#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  process.stderr.write(`aso needs Node.js 22.13 or newer (you have ${process.versions.node}). https://nodejs.org\n`);
  process.exit(1);
}
const { main } = await import('../src/cli.js');
process.exitCode = await main(process.argv.slice(2));
