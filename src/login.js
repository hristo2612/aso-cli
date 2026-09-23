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
    throw new CliError('NO_PLAYWRIGHT', 'playwright-core is not installed', { hint: 'Reinstall: npm i -g @hristo2612/aso-cli' });
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

export async function login({ manual = false, timeoutSec = 300, trust = true, headless = false } = {}) {
  const config = loadConfig();
  const password = manual ? null : await getPassword(config.keychainService, config.appleId);
  if (!manual && !password) say('no saved Apple ID password (run `aso setup` to save one); sign in manually in the browser');
  const context = await launch(headless);
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    say('browser open, signing in to Apple Ads');
    const deadline = Date.now() + timeoutSec * 1000;
    let filled = false;
    let otpContext = null;
    let otpDone = false;
    let otpEntered = false;
    let codeAnnounced = false;
    let terminalCode = null;
    let trustHandled = false;
    let lastCheck = 0;
    let switchedOrg = false;
    let verifyAttempts = 0;

    while (Date.now() < deadline) {
      const active = context.pages().at(-1) || page;
      if (active.isClosed()) throw new CliError('BROWSER_CLOSED', 'The browser was closed before sign-in finished', { exitCode: 3 });

      if (password && !filled && await visible(active, 'input[type=email], #account_name_text_field')) {
        let preLoginPromptVisible = true;
        try {
          const s = await getPromptState({ expectedAccount: config.appleId, loginStartedAtMs: Date.now(), preLoginPromptVisible: false });
          preLoginPromptVisible = s.status !== 'absent';
        } catch { /* no Accessibility access: auto-OTP stays off */ }
        const startedAt = Date.now();
        filled = await fillCredentials(active, config.appleId, password).catch(() => false);
        if (filled) {
          say(`signed in as ${config.appleId}, waiting for Apple`);
          otpContext = { expectedAccount: config.appleId, loginStartedAtMs: startedAt, preLoginPromptVisible };
        }
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
          } catch { otpDone = true; }
        }
        if (!codeAnnounced && !otpEntered && (otpDone || !otpContext)) {
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
      if (process.env.ASO_DEBUG) say(`debug url=${url.origin}${url.pathname} cookies=${(await context.cookies(COOKIE_URL)).map((c) => c.name).join(',')}`);
      const onAds = url.hostname === 'app-ads.apple.com' && !(await visible(active, 'input[type=email], input[type=password], input.form-security-code-input'));
      if (onAds) {
        const session = sessionFrom(await context.cookies(COOKIE_URL));
        if (session) {
          terminalCode?.close();
          const landedOrg = url.pathname.match(/\/cm\/app\/(\d+)/)?.[1] ?? null;
          // Accounts with several orgs (campaign groups) land on a default one; switch to the org
          // that owns your app, since popularity requests run in the context of the current org.
          if (config.orgId && landedOrg !== String(config.orgId) && !switchedOrg) {
            switchedOrg = true;
            say(`switching to Apple Ads org ${config.orgId}`);
            await active.goto(`https://app-ads.apple.com/cm/app/${config.orgId}/report`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
            await sleep(3000);
            continue;
          }
          const orgId = config.orgId ? String(config.orgId) : landedOrg;
          const result = { ...session, orgId, appleId: config.appleId, capturedAt: new Date().toISOString() };
          if (config.appId) {
            try {
              await popularity(['photo'], config.country, { ...result, appId: config.appId });
              result.verified = true;
            } catch (e) {
              if (e.code === 'AUTH_REQUIRED' && ++verifyAttempts < 4) { await sleep(3000); continue; }
              result.verified = false;
              result.verifyError = e.code === 'AUTH_REQUIRED'
                ? `Apple Ads org ${orgId} cannot read popularity for app ${config.appId}. If your account has several orgs, set the one with your app: aso config orgId <id> (the number in app-ads.apple.com/cm/app/<id>/…)`
                : e.message;
            }
          }
          saveSession(result);
          if (orgId && result.verified !== false) saveConfig({ orgId });
          return { status: 'signed_in', verified: result.verified ?? null, orgId, sessionFile: PATHS.session, ...(result.verifyError ? { warning: result.verifyError } : {}) };
        }
      }
      await sleep(1000);
    }
    terminalCode?.close();
    throw new CliError('LOGIN_TIMEOUT', `Sign-in did not finish within ${timeoutSec}s`, { hint: 'Run `aso login` again', exitCode: 3 });
  } finally {
    await context.close().catch(() => {});
  }
}
