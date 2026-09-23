// Browser sign-in to Apple Ads (uses your App Store Connect Apple ID) and session capture.
// Runs your installed Google Chrome with a dedicated profile in ~/.aso/browser.
import readline from 'node:readline';
import { CliError, PATHS, ensureHome, loadConfig, saveConfig, saveSession } from './config.js';
import { getPassword } from './keychain.js';
import { getPromptState, readFreshOTP, dismissVerifiedPrompt } from './otp.js';
import { popularity } from './apple/ads.js';

const START_URL = 'https://app-ads.apple.com/cm/app';
const COOKIE_URL = 'https://app-ads.apple.com/cm/api/v2/keywords/popularities';
const say = (msg) => process.stderr.write(`aso: ${msg}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(headless) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new CliError('NO_PLAYWRIGHT', 'playwright-core is not installed', { hint: 'Reinstall: npm i -g hristo2612/aso-cli' });
  }
  ensureHome();
  const opts = { headless, viewport: { width: 1200, height: 820 } };
  try {
    return await chromium.launchPersistentContext(PATHS.browser, { ...opts, channel: 'chrome' });
  } catch (chromeError) {
    try {
      return await chromium.launchPersistentContext(PATHS.browser, opts);
    } catch {
      throw new CliError('NO_BROWSER', `Could not start Chrome: ${chromeError.message.split('\n')[0]}`, {
        hint: 'Install Google Chrome, or run `npx playwright install chromium`',
      });
    }
  }
}

const appleFrames = (page) => page.frames().filter((f) => {
  try { return new URL(f.url()).hostname === 'idmsa.apple.com'; } catch { return false; }
}).reverse();

async function visible(page, selector) {
  for (const frame of appleFrames(page)) {
    const field = frame.locator(selector).first();
    if (await field.isVisible().catch(() => false)) return { frame, field };
  }
  return null;
}

async function clickButton(page, name) {
  for (const frame of [...appleFrames(page), page.mainFrame()]) {
    const btn = frame.getByRole('button', { name, exact: true });
    if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
      await btn.click({ timeout: 5000 });
      return true;
    }
  }
  return false;
}

// Fills Apple ID + password. Apple renders either a one-step or a two-step form inside an iframe.
async function fillCredentials(page, appleId, password) {
  const email = await visible(page, 'input[type=email], #account_name_text_field');
  if (!email) return false;
  await email.field.fill(appleId, { timeout: 5000 });
  let pw = await visible(page, 'input[type=password]');
  if (!pw) {
    if (!(await clickButton(page, 'Continue'))) await email.frame.locator('#sign-in').click({ timeout: 5000 }).catch(() => {});
    for (let i = 0; i < 20 && !pw; i++) { await sleep(500); pw = await visible(page, 'input[type=password]'); }
  }
  if (!pw) return false;
  await pw.field.fill(password, { timeout: 5000 });
  if (!(await clickButton(page, 'Sign In'))) {
    await clickButton(page, 'Continue');
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const again = await visible(page, 'input[type=password]');
      if (again && await clickButton(page, 'Sign In')) break;
    }
  }
  return true;
}

async function fillCode(page, code) {
  const box = await visible(page, 'input.form-security-code-input');
  if (!box) return false;
  const inputs = box.frame.locator('input.form-security-code-input');
  const n = await inputs.count();
  if (n === 6) for (let i = 0; i < 6; i++) await inputs.nth(i).fill(code[i], { timeout: 2000 });
  else await inputs.first().fill(code, { timeout: 2000 });
  return true;
}

function askCodeInTerminal() {
  if (!process.stdin.isTTY) return null;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const promise = new Promise((resolve) => rl.question('aso: or type the 6-digit code here: ', (a) => {
    rl.close();
    resolve(a.replace(/\D/g, ''));
  }));
  return { promise, close: () => rl.close() };
}

function sessionFrom(cookies) {
  const ok = cookies.filter((c) => /(^|\.)apple\.com$/.test(c.domain.replace(/^\./, '')) && c.value && !/[\r\n;]/.test(c.value));
  const xsrf = ok.find((c) => c.name === 'XSRF-TOKEN-CM')?.value ?? null;
  if (!xsrf && !ok.some((c) => c.name === 'app-ads.sid')) return null;
  return { cookieHeader: ok.map((c) => `${c.name}=${c.value}`).join('; '), xsrfToken: xsrf };
}

// Lists the Apple Ads orgs this Apple ID can use and the App Store apps linked to them.
async function discover(page) {
  return page.evaluate(async () => {
    const get = async (url) => {
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        return r.ok ? (await r.json()).data : null;
      } catch { return null; }
    };
    const orgs = [];
    const walk = (list) => {
      for (const o of list ?? []) {
        if (o.status === 'ACTIVE' && o.isAccessible !== false) orgs.push({ id: String(o.id), name: o.displayName || o.name });
        walk(o.subOrgs);
      }
    };
    walk((await get('/cm/api/v1/startup/orgs'))?.orgDetails);
    const apps = ((await get('/cm/api/v1/apps?basic=true')) ?? []).map((a) => ({ id: String(a.adamId), name: a.appName }));
    return { orgs, apps };
  });
}

async function pageHasText(page, pattern) {
  for (const frame of [...appleFrames(page), page.mainFrame()]) {
    const text = await frame.locator('body').innerText({ timeout: 1000 }).catch(() => '');
    if (pattern.test(text)) return true;
  }
  return false;
}

// Tries each org until Apple answers a popularity request. Apple keeps the selected org in the
// server-side session, so switching means opening that org's dashboard.
async function connect(context, page, config) {
  let found = { orgs: [], apps: [] };
  for (let i = 0; i < 5 && !found.orgs.length; i++) {
    found = await discover(page);
    if (!found.orgs.length) await sleep(2000);
  }
  if (!found.orgs.length || /signup|onboard|welcome|getstarted/i.test(page.url())) {
    throw new CliError('NO_APPLE_ADS_ACCOUNT', 'This Apple ID has no Apple Ads account yet', {
      hint: 'Create one for free at https://searchads.apple.com (pick United States if your country is not listed; no campaign or payment needed), then run `aso login`',
      exitCode: 3,
    });
  }
  if (!found.apps.length) {
    throw new CliError('NO_LINKED_APPS', 'Your Apple Ads account has no App Store Connect apps linked', {
      hint: 'In Apple Ads open account menu > Settings > Link Accounts, link your App Store Connect account, then run `aso login`',
      exitCode: 3,
    });
  }
  const adsApp = found.apps.find((a) => a.id === String(config.appId)) ?? found.apps[0];
  const landed = new URL(page.url()).pathname.match(/\/cm\/app\/(\d+)/)?.[1];
  const order = [...new Set([config.orgId, landed, ...found.orgs.map((o) => o.id)].filter(Boolean).map(String))];
  for (const orgId of order) {
    if (orgId !== new URL(page.url()).pathname.match(/\/cm\/app\/(\d+)/)?.[1]) {
      await page.goto(`https://app-ads.apple.com/cm/app/${orgId}/report`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await sleep(2500);
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      const session = sessionFrom(await context.cookies(COOKIE_URL));
      if (!session) { await sleep(2000); continue; }
      try {
        await popularity(['photo'], 'US', { ...session, appId: adsApp.id });
        return { session, orgId, org: found.orgs.find((o) => o.id === orgId)?.name ?? null, adsApp, apps: found.apps };
      } catch (e) {
        if (e.code === 'ADS_ORG_NOT_LINKED') break;
        if (e.code !== 'AUTH_REQUIRED' || attempt === 3) throw e;
        await sleep(2000);
      }
    }
  }
  throw new CliError('NO_LINKED_APPS', 'None of your Apple Ads orgs can read keyword popularity yet', {
    hint: 'In Apple Ads open account menu > Settings > Link Accounts and link your App Store Connect account to an org, then run `aso login`',
    exitCode: 3,
  });
}

export async function login({ manual = false, timeoutSec = 300, trust = true, headless = false } = {}) {
  const config = loadConfig();
  const password = manual ? null : await getPassword(config.keychainService, config.appleId);
  if (!manual && !password) say('no saved Apple ID password (run `aso setup` to save one); sign in in the browser window');
  const context = await launch(headless);
  let terminalCode = null;
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => {
      throw new CliError('NETWORK_ERROR', `Could not open Apple Ads (${e.message.split('\n')[0]})`, { hint: 'Check your internet connection and retry' });
    });
    say(headless ? 'signing in to Apple Ads in the background' : 'browser open, signing in to Apple Ads');
    const deadline = Date.now() + timeoutSec * 1000;
    let filled = false;
    let otpContext = null;
    let otpDone = false;
    let otpEntered = false;
    let codeAnnounced = false;
    let trustHandled = false;
    let lastCheck = 0;

    while (Date.now() < deadline) {
      const active = context.pages().at(-1) || page;
      if (active.isClosed()) throw new CliError('BROWSER_CLOSED', 'The browser was closed before sign-in finished', { hint: 'Run `aso login` again', exitCode: 3 });

      if (password && !filled && await visible(active, 'input[type=email], #account_name_text_field')) {
        let preLoginPromptVisible = true;
        try {
          const s = await getPromptState({ expectedAccount: config.appleId, loginStartedAtMs: Date.now(), preLoginPromptVisible: false });
          preLoginPromptVisible = s.status !== 'absent';
        } catch { /* no Accessibility access: auto-OTP stays off */ }
        const startedAt = Date.now();
        filled = await fillCredentials(active, config.appleId, password).catch(() => false);
        if (filled) {
          say(`signing in as ${config.appleId}`);
          otpContext = { expectedAccount: config.appleId, loginStartedAtMs: startedAt, preLoginPromptVisible };
        }
      }

      if (filled && await pageHasText(active, /(apple (id|account)|password) (or password )?(was|is) incorrect|check the account information/i)) {
        throw new CliError('BAD_CREDENTIALS', `Apple rejected the Apple ID or password for ${config.appleId}`, {
          hint: 'Run `aso setup` to save the correct password, or `aso login --manual` to type it yourself', exitCode: 3,
        });
      }

      const codeBox = await visible(active, 'input.form-security-code-input');
      if (codeBox) {
        if (otpContext && !otpDone && process.platform === 'darwin' && Date.now() - lastCheck > 2500) {
          lastCheck = Date.now();
          try {
            const r = await readFreshOTP({ ...otpContext, autoAllow: true });
            if (r.status === 'code_ready' && await fillCode(active, r.otp)) {
              otpDone = true;
              otpEntered = true;
              say('two-factor code read from the macOS prompt and entered');
              await dismissVerifiedPrompt(otpContext).catch(() => {});
            } else if (r.status !== 'absent') otpDone = true;
          } catch {
            otpDone = true;
            say('tip: to auto-fill 2FA codes, allow your terminal in System Settings > Privacy & Security > Accessibility');
          }
        }
        if (!codeAnnounced && !otpEntered && (otpDone || !otpContext)) {
          if (headless) throw new CliError('NEEDS_INTERACTION', 'Apple wants a two-factor code', { exitCode: 3 });
          codeAnnounced = true;
          say('enter the Apple two-factor code in the browser window');
          terminalCode = askCodeInTerminal();
          terminalCode?.promise.then((code) => code.length === 6 && fillCode(active, code).catch(() => {}));
        }
      }

      if (!trustHandled && await clickButton(active, trust ? 'Trust' : 'Don’t Trust').catch(() => false)) {
        trustHandled = true;
        say(trust ? 'browser trusted (fewer 2FA prompts next time)' : 'browser not trusted');
      }

      const url = new URL(active.url());
      if (process.env.ASO_DEBUG) say(`debug url=${url.origin}${url.pathname}`);
      const signedIn = url.hostname === 'app-ads.apple.com'
        && !(await visible(active, 'input[type=email], input[type=password], input.form-security-code-input'))
        && sessionFrom(await context.cookies(COOKIE_URL));
      if (signedIn) {
        terminalCode?.close();
        say('signed in, finding your Apple Ads org and apps');
        const { session, orgId, org, adsApp, apps } = await connect(context, active, config);
        saveSession({ ...session, orgId, adsAppId: adsApp.id, apps, appleId: config.appleId, capturedAt: new Date().toISOString() });
        saveConfig({ orgId });
        return { status: 'signed_in', verified: true, org: org ? `${org} (${orgId})` : orgId, queryApp: `${adsApp.name} (${adsApp.id})`, apps, sessionFile: PATHS.session };
      }
      await sleep(1000);
    }
    throw new CliError('LOGIN_TIMEOUT', `Sign-in did not finish within ${timeoutSec}s`, {
      hint: 'Run `aso login` again (add --timeout 600 for more time, or --manual to type everything yourself)', exitCode: 3,
    });
  } finally {
    terminalCode?.close();
    await context.close().catch(() => {});
  }
}
