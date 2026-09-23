import fs from 'node:fs';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { CliError, PATHS, loadConfig, saveConfig, loadSession } from './config.js';
import { print, printError, setMode, table, delta, isJson } from './output.js';
import { storefront, listStorefronts } from './storefronts.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const HELP = `aso ${VERSION}: free, local App Store Optimization toolkit

Setup
  aso setup                         first-run wizard (Apple ID → Keychain, your app, sign-in)
  aso login [--manual]              sign in to Apple Ads in Chrome (auto-fills Keychain + 2FA)
  aso status                        config, session and live Apple Ads check
  aso config [key] [value]          show/set: appId, orgId, country, appleId, autoLogin

Research
  aso keywords <terms…> [--app id]  popularity, difficulty, opportunity, competitors, your rank
  aso suggest <seed>                keyword ideas (Apple Ads recommendations + autocomplete)
  aso search <term>                 live App Store results for a term
  aso app <appId> [--lang en-US]    public listing details

Tracking (SQLite: ~/.aso/aso.db)
  aso track add|rm <appId> <terms…> manage tracked keywords
  aso track list [appId]            show tracked keywords
  aso track run [appId]             refresh all tracked keywords (cron-friendly)
  aso ranks <appId>                 latest ranks with change vs previous check
  aso history <term> [--app id]     popularity / difficulty / rank over time
  aso log add|list                  record and review metadata changes
  aso db [sql]                      tables, or run a read-only SQL query

Metadata
  aso lint --title … --subtitle … --keywords … [--locale en-US]
  aso lint --fastlane ./fastlane/metadata
  aso storefronts

Flags: -c/--country <CC>  --json  --table  --no-login  -h/--help  -v/--version
Docs: https://github.com/hristo2612/aso-cli`;

const OPTIONS = {
  country: { type: 'string', short: 'c' },
  app: { type: 'string' },
  json: { type: 'boolean' },
  table: { type: 'boolean' },
  fresh: { type: 'boolean' },
  limit: { type: 'string' },
  lang: { type: 'string' },
  days: { type: 'string' },
  manual: { type: 'boolean' },
  timeout: { type: 'string' },
  trust: { type: 'boolean', default: true },
  login: { type: 'boolean', default: true },
  title: { type: 'string' },
  subtitle: { type: 'string' },
  keywords: { type: 'string' },
  fastlane: { type: 'string' },
  locale: { type: 'string' },
  field: { type: 'string' },
  old: { type: 'string' },
  new: { type: 'string' },
  note: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

const usage = (msg) => new CliError('CLI_USAGE_ERROR', msg, { hint: 'Run `aso --help`', exitCode: 2 });
const int = (v, def) => (v == null ? def : Number.parseInt(v, 10) || def);

function countryOf(opts) {
  const cc = (opts.country || loadConfig().country || 'US').toUpperCase();
  if (!storefront(cc)) throw new CliError('BAD_COUNTRY', `Unknown country "${cc}"`, { hint: 'Run `aso storefronts`', exitCode: 2 });
  return cc;
}

const appIdOf = (value) => {
  const id = String(value ?? '').replace(/^id/, '');
  if (!/^\d{5,15}$/.test(id)) throw usage(`"${value}" is not an App Store app id (digits, e.g. 1234567890)`);
  return id;
};

// ---------- commands ----------

async function cmdSetup() {
  const { hasKeychain, promptAndStorePassword, getPassword } = await import('./keychain.js');
  const { itunesSearch } = await import('./apple/store.js');
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const ask = async (q, def) => (await rl.question(`${q}${def ? ` [${def}]` : ''}: `)).trim() || def || '';
  const config = loadConfig();
  try {
    process.stderr.write(`\naso setup: free ASO toolkit. Everything stays on this machine (~/.aso).\n
Keyword popularity comes from Apple Ads. You need an Apple ID that can open https://app-ads.apple.com
(sign up free at https://searchads.apple.com, link your App Store Connect account; no campaign or billing needed).
Search, ranks, difficulty and history work without it.\n\n`);
    const country = (await ask('Default country', config.country || 'US')).toUpperCase();
    if (!storefront(country)) throw usage(`Unknown country ${country}`);
    const appleId = await ask('Apple ID email for Apple Ads (blank to skip)', config.appleId);
    let appId = config.appId;
    const appAnswer = await ask('Your app (App Store id or name)', appId);
    if (appAnswer && !/^\d+$/.test(appAnswer)) {
      const found = (await itunesSearch(appAnswer, country, 8));
      found.forEach((a, i) => process.stderr.write(`  ${i + 1}) ${a.name} by ${a.developer} (${a.id})\n`));
      const pick = int(await ask('Pick a number', '1'), 1);
      appId = found[pick - 1]?.id ?? null;
    } else if (appAnswer) appId = appAnswer;
    let orgId = config.orgId;
    if (appleId) {
      orgId = await ask('Apple Ads org id (only if your account has several orgs: the number in app-ads.apple.com/cm/app/<id>/… for the org that has your app; blank = default)', orgId) || null;
    }
    saveConfig({ country, appleId: appleId || null, appId: appId || null, orgId: orgId || null });
    process.stderr.write(`\nsaved ${PATHS.config}\n`);

    if (appleId && hasKeychain) {
      const has = await getPassword(config.keychainService, appleId);
      const store = await ask(`${has ? 'Update' : 'Save'} the Apple ID password in the macOS Keychain for automatic sign-in? (y/n)`, has ? 'n' : 'y');
      if (/^y/i.test(store)) {
        rl.pause();
        await promptAndStorePassword(config.keychainService, appleId);
        rl.resume();
        process.stderr.write(`stored in Keychain (service "${config.keychainService}")\n`);
      }
    } else if (appleId) {
      process.stderr.write('Tip: set ASO_APPLE_PASSWORD in your environment for automatic sign-in on this OS.\n');
    }
    const doLogin = appleId ? await ask('Sign in to Apple Ads now? (y/n)', 'y') : 'n';
    rl.close();
    if (/^y/i.test(doLogin)) await cmdLogin({});
    process.stderr.write(`\nDone. Try:\n  aso keywords "white noise,sleep sounds"\n  aso suggest meditation\n  aso search "habit tracker"\n`);
  } finally {
    rl.close();
  }
}

async function cmdLogin(opts) {
  const { login } = await import('./login.js');
  const result = await login({ manual: !!opts.manual, timeoutSec: int(opts.timeout, 300), trust: opts.trust !== false });
  print(result, (r) => `signed in ✓${r.verified ? ' (Apple Ads popularity verified)' : r.warning ? `\nwarning: ${r.warning}` : '\nset your app with `aso config appId <id>` to verify popularity access'}`);
}

async function cmdStatus() {
  const { getPassword, hasKeychain } = await import('./keychain.js');
  const config = loadConfig();
  const session = loadSession();
  const out = {
    version: VERSION,
    node: process.versions.node,
    home: PATHS.config.replace(/\/config\.json$/, ''),
    config: { appleId: config.appleId, appId: config.appId, country: config.country, autoLogin: config.autoLogin },
    passwordSaved: config.appleId ? !!(await getPassword(config.keychainService, config.appleId)) : false,
    keychain: hasKeychain,
    session: session ? { capturedAt: session.capturedAt, ageHours: Math.round((Date.now() - Date.parse(session.capturedAt)) / 36e5) } : null,
    appleAds: 'not checked',
  };
  if (session && config.appId) {
    const { popularity } = await import('./apple/ads.js');
    try {
      await popularity(['photo'], config.country, { ...session, appId: config.appId });
      out.appleAds = 'ok';
    } catch (e) {
      out.appleAds = e.code === 'AUTH_REQUIRED' ? 'expired, run `aso login`' : e.message;
    }
  } else if (!session) out.appleAds = 'no session, run `aso login`';
  else out.appleAds = 'no app configured, run `aso config appId <id>`';
  out.ready = out.appleAds === 'ok';
  print(out, (o) => [
    `aso ${o.version} (node ${o.node})  home ${o.home}`,
    `Apple ID     ${o.config.appleId ?? '–'}${o.passwordSaved ? ' (password in Keychain)' : ''}`,
    `App          ${o.config.appId ?? '–'}`,
    `Country      ${o.config.country}`,
    `Session      ${o.session ? `${o.session.ageHours}h old` : '–'}`,
    `Apple Ads    ${o.appleAds}`,
  ].join('\n'));
}

function cmdConfig(args) {
  const [key, value] = args;
  const allowed = ['appId', 'orgId', 'country', 'appleId', 'autoLogin', 'keychainService'];
  if (!key) return print(loadConfig());
  if (!allowed.includes(key)) throw usage(`Unknown config key "${key}" (use: ${allowed.join(', ')})`);
  if (value === undefined) return print({ [key]: loadConfig()[key] });
  let v = value;
  if (key === 'autoLogin') v = /^(true|1|yes|on)$/i.test(value);
  if (key === 'appId') v = appIdOf(value);
  if (key === 'orgId' && !/^\d+$/.test(value)) throw usage('orgId must be digits (from app-ads.apple.com/cm/app/<orgId>/…)');
  if (key === 'country') { v = value.toUpperCase(); if (!storefront(v)) throw usage(`Unknown country ${v}`); }
  if (value === 'null' || value === '') v = null;
  print(saveConfig({ [key]: v }));
}

async function cmdKeywords(args, opts) {
  const { parseTerms, analyzeKeywords } = await import('./research.js');
  const terms = parseTerms(args);
  if (!terms.length) throw usage('Give at least one keyword: aso keywords "k1,k2"');
  if (terms.length > 100) throw usage('At most 100 keywords per call');
  const appId = opts.app ? appIdOf(opts.app) : loadConfig().appId;
  const result = await analyzeKeywords(terms, { country: countryOf(opts), appId, fresh: opts.fresh, allowLogin: opts.login });
  print(result, (r) => table(r.items, [
    ['keyword', 'keyword', 32],
    [(i) => (i.popularity == null ? '–' : i.popularityFloor ? '5*' : i.popularity), 'pop', 4],
    ['difficulty', 'diff', 4],
    ['opportunity', 'opp', 4],
    ['appCount', 'apps', 4],
    ...(r.appId ? [[(i) => i.rank ?? '>200', 'rank', 5]] : []),
    [(i) => i.topApps.slice(0, 3).map((a) => a.name).join(' · '), 'top apps', 60],
  ]) + (r.items.some((i) => i.popularityFloor) ? '\n* 5 = Apple floor (low or unknown volume)' : ''));
}

async function cmdSuggest(args, opts) {
  const seed = args.join(' ').trim();
  if (!seed) throw usage('Give a seed keyword: aso suggest "meditation"');
  const { suggest } = await import('./research.js');
  const result = await suggest(seed.toLowerCase(), { country: countryOf(opts), limit: int(opts.limit, 50), allowLogin: opts.login });
  print(result, (r) => table(r.items, [['keyword', 'keyword', 40], ['popularity', 'pop', 4], [(i) => i.sources.join(','), 'source', 24]]));
}

async function cmdSearch(args, opts) {
  const term = args.join(' ').trim();
  if (!term) throw usage('Give a search term: aso search "habit tracker"');
  const { searchResults } = await import('./apple/store.js');
  const country = countryOf(opts);
  const res = await searchResults(term, country, { limit: int(opts.limit, 20) });
  const out = { term, country, appCount: res.appCount, apps: res.apps };
  print(out, (o) => table(o.apps, [
    ['rank', '#', 3], ['id', 'id', 11], ['name', 'name', 30], ['subtitle', 'subtitle', 30],
    [(a) => a.rating?.toFixed(1), '★', 3], ['ratingCount', 'ratings', 8], [(a) => a.updatedAt?.slice(0, 10), 'updated', 10],
  ]));
}

async function cmdApp(args, opts) {
  if (!args[0]) throw usage('Give an app id: aso app 1234567890');
  const { appDetails } = await import('./apple/store.js');
  const { recordApp } = await import('./db.js');
  const country = countryOf(opts);
  const app = await appDetails(appIdOf(args[0]), country, opts.lang);
  recordApp(app, country);
  print(app, (a) => [
    `${a.name}  (${a.id})`,
    `subtitle    ${a.subtitle ?? '–'}`,
    `developer   ${a.developer}`,
    `rating      ${a.rating?.toFixed?.(2) ?? '–'} from ${a.ratingCount ?? 0} ratings`,
    `version     ${a.version}  updated ${a.updatedAt?.slice(0, 10)}  released ${a.releasedAt?.slice(0, 10)}`,
    `genres      ${a.genres.join(', ')}`,
    `price       ${a.price}`,
    `languages   ${a.languages.length}: ${a.languages.join(' ')}`,
    `screenshots iPhone ${a.screenshots.iphone}, iPad ${a.screenshots.ipad}`,
    `url         ${a.url}`,
    '',
    (a.description ?? '').slice(0, 600) + ((a.description?.length ?? 0) > 600 ? '…' : ''),
  ].join('\n'));
}

async function cmdTrack(args, opts) {
  const db = await import('./db.js');
  const [sub, ...rest] = args;
  const country = countryOf(opts);
  if (sub === 'add' || sub === 'rm') {
    const { parseTerms } = await import('./research.js');
    const appId = appIdOf(rest[0]);
    const terms = parseTerms(rest.slice(1));
    if (!terms.length) throw usage(`aso track ${sub} <appId> "k1,k2"`);
    const changed = sub === 'add' ? db.trackAdd(appId, terms, country) : db.trackRemove(appId, terms, country);
    return print({ appId, country, [sub === 'add' ? 'added' : 'removed']: changed, tracked: db.trackList(appId).length },
      (o) => `${sub === 'add' ? 'added' : 'removed'} ${changed.length} keyword(s); ${o.tracked} tracked for ${appId}`);
  }
  if (sub === 'list') {
    const rows = db.trackList(rest[0] ? appIdOf(rest[0]) : null);
    return print({ items: rows }, (o) => table(o.items, [['appId', 'app', 11], ['country', 'cc', 2], ['keyword', 'keyword', 40], [(r) => r.addedAt.slice(0, 10), 'added', 10]]));
  }
  if (sub === 'run') {
    const { analyzeKeywords } = await import('./research.js');
    const rows = db.trackList(rest[0] ? appIdOf(rest[0]) : null).filter((r) => !opts.country || r.country === country);
    const groups = new Map();
    for (const r of rows) {
      const k = `${r.appId}|${r.country}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r.keyword);
    }
    const results = [];
    for (const [k, terms] of groups) {
      const [appId, cc] = k.split('|');
      for (let i = 0; i < terms.length; i += 100) {
        const r = await analyzeKeywords(terms.slice(i, i + 100), { country: cc, appId, allowLogin: opts.login });
        results.push(r);
      }
    }
    const summary = results.flatMap((r) => r.items.map((i) => ({ appId: r.appId, country: r.country, keyword: i.keyword, rank: i.rank, popularity: i.popularity, difficulty: i.difficulty })));
    return print({ checked: summary.length, items: summary, warnings: [...new Set(results.flatMap((r) => r.warnings))] },
      (o) => (o.items.length ? table(o.items, [['appId', 'app', 11], ['country', 'cc', 2], ['keyword', 'keyword', 36], [(i) => i.rank ?? '>200', 'rank', 5], ['popularity', 'pop', 4], ['difficulty', 'diff', 4]]) : 'nothing tracked, add with `aso track add <appId> "k1,k2"`'));
  }
  throw usage('aso track add|rm|list|run');
}

async function cmdRanks(args, opts) {
  const db = await import('./db.js');
  const appId = appIdOf(args[0] ?? loadConfig().appId);
  const country = countryOf(opts);
  const items = db.latestRanks(appId, country).map((r) => ({ ...r, change: delta(r.rank, r.previousRank) }));
  print({ appId, country, items }, (o) => (o.items.length
    ? table(o.items, [['keyword', 'keyword', 36], [(r) => r.rank ?? (r.checkedAt ? '>200' : '–'), 'rank', 5], ['change', 'Δ', 5], ['popularity', 'pop', 4], ['difficulty', 'diff', 4], [(r) => r.checkedAt?.slice(0, 16).replace('T', ' '), 'checked', 16]])
    : `no tracked keywords for ${appId} in ${country}. Run \`aso track add ${appId} "k1,k2"\` then \`aso track run\``));
}

async function cmdHistory(args, opts) {
  const db = await import('./db.js');
  const keyword = args.join(' ').trim().toLowerCase();
  if (!keyword) throw usage('aso history "<keyword>" [--app id] [--days 90]');
  const appId = opts.app ? appIdOf(opts.app) : loadConfig().appId;
  const h = db.keywordHistory(keyword, countryOf(opts), appId, int(opts.days, 90));
  const out = { keyword, country: countryOf(opts), appId, ...h };
  print(out, (o) => {
    const byDay = new Map();
    for (const s of o.snapshots) byDay.set(s.observedAt.slice(0, 10), { day: s.observedAt.slice(0, 10), popularity: s.popularity, difficulty: s.difficulty });
    for (const r of o.ranks) byDay.set(r.observedAt.slice(0, 10), { ...(byDay.get(r.observedAt.slice(0, 10)) ?? { day: r.observedAt.slice(0, 10) }), rank: r.rank ?? '>200' });
    return table([...byDay.values()], [['day', 'date', 10], ['popularity', 'pop', 4], ['difficulty', 'diff', 4], ...(o.appId ? [['rank', 'rank', 5]] : [])]);
  });
}

async function cmdLog(args, opts) {
  const db = await import('./db.js');
  const [sub] = args;
  if (sub === 'add') {
    const appId = appIdOf(opts.app ?? loadConfig().appId);
    if (!opts.field || opts.new === undefined) throw usage('aso log add --app <id> --locale en-US --field keywords --old "…" --new "…" [--note "why"]');
    const id = db.logChange({ appId, locale: opts.locale || 'en-US', field: opts.field, old: opts.old, new: opts.new, note: opts.note });
    return print({ id, appId }, () => `logged change #${id}`);
  }
  if (sub === 'list' || !sub) {
    const items = db.listChanges(opts.app ? appIdOf(opts.app) : null);
    return print({ items }, (o) => table(o.items, [['id', '#', 4], [(r) => r.loggedAt.slice(0, 10), 'date', 10], ['appId', 'app', 11], ['locale', 'locale', 6], ['field', 'field', 9], ['new', 'new value', 50], ['note', 'note', 40]]));
  }
  throw usage('aso log add|list');
}

async function cmdDb(args) {
  const db = await import('./db.js');
  if (!args.length) {
    return print({ path: PATHS.db, tables: db.tables() }, (o) => `${o.path}\n\n${table(o.tables, [['name', 'table', 20], ['rows', 'rows', 8], ['columns', 'columns', 90]])}`);
  }
  const rows = db.readOnlyQuery(args.join(' '));
  print({ rows }, (o) => (o.rows.length ? table(o.rows, Object.keys(o.rows[0]).map((k) => [k, k, 40])) : '(no rows)'));
}

async function cmdLint(opts) {
  const { lintMetadata, lintFastlane } = await import('./lint.js');
  const render = (r) => [
    `${r.locale}: ${r.pass ? 'PASS' : 'FAIL'}  score ${r.score}  title ${r.stats.title}  subtitle ${r.stats.subtitle}  keywords ${r.stats.keywords}  unique words ${r.stats.uniqueWords}`,
    ...r.issues.map((i) => `  ${i.severity.padEnd(7)} ${i.rule.padEnd(24)} ${i.message}`),
  ].join('\n');
  if (opts.fastlane) {
    const results = lintFastlane(opts.fastlane);
    return print({ pass: results.every((r) => r.pass), locales: results }, (o) => o.locales.map(render).join('\n\n'));
  }
  if (opts.title === undefined && opts.subtitle === undefined && opts.keywords === undefined) {
    throw usage('aso lint --title "…" --subtitle "…" --keywords "a,b,c"  or  aso lint --fastlane <dir>');
  }
  print(lintMetadata({ title: opts.title, subtitle: opts.subtitle, keywords: opts.keywords, locale: opts.locale }), render);
}

// ---------- entry ----------

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, allowNegative: true });
  } catch (e) {
    printError(usage(e.message));
    return 2;
  }
  const { values: opts, positionals } = parsed;
  if (opts.json) setMode('json');
  if (opts.table) setMode('table');
  const [cmd, ...args] = positionals;
  if (opts.version) { process.stdout.write(`${VERSION}\n`); return 0; }
  if (!cmd || opts.help || cmd === 'help') { process.stdout.write(`${HELP}\n`); return 0; }

  const commands = {
    setup: () => cmdSetup(),
    login: () => cmdLogin(opts),
    status: () => cmdStatus(),
    config: () => cmdConfig(args),
    keywords: () => cmdKeywords(args, opts),
    kw: () => cmdKeywords(args, opts),
    suggest: () => cmdSuggest(args, opts),
    search: () => cmdSearch(args, opts),
    app: () => cmdApp(args, opts),
    track: () => cmdTrack(args, opts),
    ranks: () => cmdRanks(args, opts),
    history: () => cmdHistory(args, opts),
    log: () => cmdLog(args, opts),
    db: () => cmdDb(args),
    lint: () => cmdLint(opts),
    storefronts: () => print({ items: listStorefronts() }, (o) => table(o.items, [['code', 'cc', 2], ['name', 'country', 22], [(s) => (s.ads ? 'yes' : 'no'), 'popularity', 10]])),
  };
  const run = commands[cmd];
  try {
    if (!run) throw usage(`Unknown command "${cmd}"`);
    await run();
    return 0;
  } catch (e) {
    if (!(e instanceof CliError) && process.env.ASO_DEBUG) console.error(e);
    printError(e instanceof CliError ? e : new CliError('CLI_RUNTIME_ERROR', e.message));
    return e.exitCode ?? 1;
  }
}

export { isJson };
