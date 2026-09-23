// JSON for agents/pipes, compact tables for humans.
let mode = process.stdout.isTTY ? 'table' : 'json';
export const setMode = (m) => { mode = m; };
export const isJson = () => mode === 'json';

const trunc = (v, n) => {
  const s = v == null ? '–' : String(v);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

export function table(rows, columns) {
  if (!rows.length) return '(none)';
  const cols = columns.map(([key, label, width = 40]) => ({
    key, label, width: Math.min(width, Math.max(label.length, ...rows.map((r) => trunc(typeof key === 'function' ? key(r) : r[key], width).length))),
  }));
  const cell = (r, c) => trunc(typeof c.key === 'function' ? c.key(r) : r[c.key], c.width).padEnd(c.width);
  const line = (vals) => vals.join('  ').trimEnd();
  return [
    line(cols.map((c) => c.label.padEnd(c.width))),
    line(cols.map((c) => '─'.repeat(c.width))),
    ...rows.map((r) => line(cols.map((c) => cell(r, c)))),
  ].join('\n');
}

// `render` returns the human view; JSON mode prints `data` verbatim.
export function print(data, render) {
  if (mode === 'json' || !render) process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  else process.stdout.write(render(data) + '\n');
  const warnings = data?.warnings ?? [];
  if (mode !== 'json') for (const w of warnings) process.stderr.write(`warning: ${w}\n`);
}

export function printError(err) {
  const error = { code: err.code || 'CLI_RUNTIME_ERROR', message: err.message, ...(err.hint ? { hint: err.hint } : {}) };
  if (mode === 'json') process.stdout.write(JSON.stringify({ error }, null, 2) + '\n');
  else process.stderr.write(`error: ${error.message}${error.hint ? `\nhint: ${error.hint}` : ''}\n`);
}

export const delta = (now, before) => {
  if (now == null && before == null) return '–';
  if (before == null) return 'new';
  if (now == null) return 'lost';
  const d = before - now;
  return d === 0 ? '=' : d > 0 ? `▲${d}` : `▼${-d}`;
};
