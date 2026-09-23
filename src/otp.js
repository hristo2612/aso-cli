// Reads a fresh Apple verification code from the macOS "Apple Account Verification" prompt
// (FollowUpUI) so sign-in can finish unattended. Fail-closed: any doubt -> the user enters the code.
// Needs Accessibility permission for the terminal app (System Settings > Privacy & Security).

import { execFile } from "node:child_process";

const MAX_LOGIN_AGE_MS = 2 * 60 * 1000;

const SNAPSHOT_JXA = String.raw`
ObjC.import("stdlib");
const result = (() => {
  const system = Application("System Events");
  const matches = system.processes.whose({name: "FollowUpUI"})();
  if (!matches.length || !matches[0].windows().length) {
    return {visible:false,title:"",texts:[],buttons:[]};
  }
  if (String(matches[0].bundleIdentifier()) !== "com.apple.FollowUpUI") throw new Error("unexpected_process");
  if (matches[0].windows().length !== 1) {
    return {visible:true,ambiguous:true,title:"",texts:[],buttons:[]};
  }
  const win = matches[0].windows()[0];
  const texts = [], buttons = [];
  function walk(element, depth) {
    if (depth > 8) return;
    try {
      const role = String(element.role());
      const name = String(element.name() || "");
      let value = "";
      try { value = String(element.value() || ""); } catch (_) {}
      if (role === "AXButton" && name) buttons.push(name);
      if ((role === "AXStaticText" || role === "AXTextField") && (value || name)) texts.push(value || name);
      for (const child of element.uiElements()) walk(child, depth + 1);
    } catch (_) {}
  }
  walk(win, 0);
  return {visible:true,title:String(win.name() || ""),texts:texts,buttons:buttons};
})();
JSON.stringify(result);`;

function clickPromptButtonJxa(expectedAccount, button = 'Allow') {
  return String.raw`
const system = Application("System Events");
const matches = system.processes.whose({name: "FollowUpUI"})();
if (!matches.length || matches[0].windows().length !== 1) throw new Error("prompt unavailable or ambiguous");
const win = matches[0].windows()[0];
const title = String(win.name() || "");
if (String(matches[0].bundleIdentifier()) !== "com.apple.FollowUpUI") throw new Error("unexpected_process");
const expected = ${JSON.stringify(expectedAccount.trim().toLocaleLowerCase())};
const texts = [];
function walk(element, depth) {
  if (depth > 8) return;
  try {
    const role = String(element.role());
    const name = String(element.name() || "");
    let value = "";
    try { value = String(element.value() || ""); } catch (_) {}
    if ((role === "AXStaticText" || role === "AXTextField") && (value || name)) texts.push(value || name);
    for (const child of element.uiElements()) walk(child, depth + 1);
  } catch (_) {}
}
walk(win, 0);
const combined = [title, ...texts].join("\n").replace(/\s+/g, " ").toLocaleLowerCase();
if (!/apple (id|account) verification|sign[ -]?in requested|verification code|your apple (id|account) is being used to sign in to a new device/i.test(combined)) throw new Error("purpose mismatch");
const accounts = combined.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
if (accounts.length && (accounts.length !== 1 || accounts[0] !== expected)) throw new Error("account mismatch");
if (!accounts.length && !/your apple (id|account) is being used to sign in to a new device/i.test(combined)) throw new Error("unrecognized account-free prompt");
const buttons = win.buttons.whose({name: ${JSON.stringify(button)}})();
if (buttons.length !== 1) throw new Error("Prompt button ambiguous");
buttons[0].click();
"ok";
`;
}

function defaultRunAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile("/usr/bin/osascript", ["-l", "JavaScript", "-e", script],
      { timeout: 5_000, maxBuffer: 64 * 1024, encoding: "utf8" },
      (error, stdout) => error ? reject(new Error("Apple verification UI unavailable.")) : resolve(stdout));
  });
}

function validContext({ expectedAccount, loginStartedAtMs, preLoginPromptVisible, nowMs }) {
  if (typeof expectedAccount !== "string" || !expectedAccount.trim()) return "expected_account_required";
  if (preLoginPromptVisible !== false) return "preexisting_or_unknown_prompt";
  if (!Number.isFinite(loginStartedAtMs) || loginStartedAtMs > nowMs || nowMs - loginStartedAtMs > MAX_LOGIN_AGE_MS) {
    return "login_not_fresh";
  }
  return null;
}

function parseSnapshot(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.visible !== "boolean" || typeof parsed.title !== "string" ||
        !Array.isArray(parsed.texts) || !Array.isArray(parsed.buttons) ||
        (parsed.ambiguous !== undefined && typeof parsed.ambiguous !== "boolean") ||
        parsed.texts.some((item) => typeof item !== "string") ||
        parsed.buttons.some((item) => typeof item !== "string")) throw new Error();
    return parsed;
  } catch (_) {
    throw new Error("Apple verification UI returned an invalid state.");
  }
}

function classify(snapshot, expectedAccount) {
  if (!snapshot.visible) return { status: "absent", reason: "no_prompt", accountMatch: "unverified", title: "" };
  if (snapshot.ambiguous) return { status: "human_required", reason: "multiple_prompts", accountMatch: "unverified", title: "" };
  const combined = [snapshot.title, ...snapshot.texts].join("\n").replace(/\s+/g, ' ').toLocaleLowerCase();
  const accounts = combined.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [];
  const accountMatch = accounts.length === 1 && accounts[0] === expectedAccount.trim().toLocaleLowerCase() ? "matched" : "unverified";
  const knownAccountFreePrompt = !accounts.length && /your apple (id|account) is being used to sign in to a new device|apple (id|account) verification code/i.test(combined);
  const verifiedTitle = /apple (id|account) verification|sign[ -]?in requested|verification code/i.test(snapshot.title) || knownAccountFreePrompt;
  if (!verifiedTitle) return { status: "human_required", reason: "unexpected_prompt_title", accountMatch, title: snapshot.title };
  if (accountMatch !== "matched" && !knownAccountFreePrompt) return { status: "human_required", reason: "account_not_verifiable", accountMatch, title: snapshot.title };
  const allowCount = snapshot.buttons.filter((name) => name === "Allow").length;
  if (allowCount === 1) return { status: "approval_ready", reason: null, accountMatch, title: snapshot.title };
  if (allowCount > 1) return { status: "human_required", reason: "approval_ambiguous", accountMatch, title: snapshot.title };
  return { status: "code_ready", reason: null, accountMatch, title: snapshot.title };
}

function extractOTP(texts) {
  const found = new Set();
  for (const text of texts) {
    if (!/^[\d\s\u00a0]+$/.test(text)) continue;
    const value = text.replace(/\D/g, "");
    if (/^\d{6}$/.test(value)) found.add(value);
  }
  return found.size === 1 ? [...found][0] : null;
}

async function snapshot(runAppleScript) {
  try {
    return parseSnapshot(await runAppleScript(SNAPSHOT_JXA));
  } catch (_) {
    throw new Error("Apple verification UI unavailable or invalid.");
  }
}

export async function getPromptState({
  expectedAccount,
  loginStartedAtMs,
  preLoginPromptVisible,
  nowMs = Date.now(),
  runAppleScript = defaultRunAppleScript,
}) {
  const reason = validContext({ expectedAccount, loginStartedAtMs, preLoginPromptVisible, nowMs });
  if (reason) return { status: "human_required", reason, accountMatch: "unverified", title: "" };
  return classify(await snapshot(runAppleScript), expectedAccount);
}

export async function readFreshOTP({
  expectedAccount,
  loginStartedAtMs,
  preLoginPromptVisible,
  nowMs = Date.now(),
  autoAllow = false,
  runAppleScript = defaultRunAppleScript,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const reason = validContext({ expectedAccount, loginStartedAtMs, preLoginPromptVisible, nowMs });
  if (reason) return { status: "human_required", reason };

  let current = await snapshot(runAppleScript);
  let state = classify(current, expectedAccount);
  if (state.status === "approval_ready") {
    if (!autoAllow) return { status: "human_required", reason: "approval_required" };
    try {
      await runAppleScript(clickPromptButtonJxa(expectedAccount));
    } catch (_) {
      return { status: "human_required", reason: "verified_approval_failed" };
    }
    await wait(1_000);
    current = await snapshot(runAppleScript);
    state = classify(current, expectedAccount);
  }
  if (state.status !== "code_ready") return { status: state.status, reason: state.reason };
  const otp = extractOTP(current.texts);
  if (!otp) return { status: "human_required", reason: "code_missing_or_ambiguous" };
  return { status: "code_ready", otp, observedAt: new Date(nowMs).toISOString() };
}

export async function dismissVerifiedPrompt(context) {
  const state = await getPromptState(context);
  if (state.status !== 'code_ready') return false;
  await (context.runAppleScript || defaultRunAppleScript)(clickPromptButtonJxa(context.expectedAccount, 'Done'));
  return true;
}
