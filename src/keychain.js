// Apple ID password storage. macOS: login Keychain via /usr/bin/security.
// Elsewhere: ASO_APPLE_PASSWORD environment variable.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const SECURITY = '/usr/bin/security';
export const hasKeychain = process.platform === 'darwin';

export async function getPassword(service, account) {
  if (process.env.ASO_APPLE_PASSWORD) return process.env.ASO_APPLE_PASSWORD;
  if (!hasKeychain || !account) return null;
  try {
    const { stdout } = await run(SECURITY, ['find-generic-password', '-s', service, '-a', account, '-w'], { timeout: 15000 });
    return stdout.replace(/\r?\n$/, '') || null;
  } catch {
    return null;
  }
}

// `security ... -w` as the last flag prompts for the password in the terminal,
// so the password never passes through this process or its arguments.
export function promptAndStorePassword(service, account) {
  return new Promise((resolve, reject) => {
    const child = spawn(SECURITY, ['add-generic-password', '-U', '-s', service, '-a', account, '-l', 'aso-cli Apple ID', '-w'],
      { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`security exited with ${code}`))));
    child.on('error', reject);
  });
}

export async function deletePassword(service, account) {
  if (!hasKeychain) return false;
  try {
    await run(SECURITY, ['delete-generic-password', '-s', service, '-a', account], { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}
