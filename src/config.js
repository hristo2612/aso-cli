import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HOME = process.env.ASO_HOME || path.join(os.homedir(), '.aso');
export const PATHS = {
  config: path.join(HOME, 'config.json'),
  session: path.join(HOME, 'session.json'),
  db: path.join(HOME, 'aso.db'),
  browser: path.join(HOME, 'browser'),
};

const DEFAULTS = {
  appleId: null,
  appId: null,
  country: 'US',
  autoLogin: true,
  keychainService: 'aso-cli',
};

export class CliError extends Error {
  constructor(code, message, { hint, exitCode = 1 } = {}) {
    super(message);
    this.code = code;
    this.hint = hint;
    this.exitCode = exitCode;
  }
}

export function ensureHome() {
  fs.mkdirSync(HOME, { recursive: true, mode: 0o700 });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new CliError('BAD_FILE', `Could not read ${file}: ${e.message}`);
  }
}

// Private (0600) atomic write; session and config never leave this machine.
export function writePrivateJson(file, data) {
  ensureHome();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function loadConfig() {
  return { ...DEFAULTS, ...(readJson(PATHS.config) || {}) };
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  writePrivateJson(PATHS.config, next);
  return next;
}

export function loadSession() {
  return readJson(PATHS.session);
}

export function saveSession(session) {
  writePrivateJson(PATHS.session, session);
}
