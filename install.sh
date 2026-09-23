#!/usr/bin/env bash
# One-line install: curl -fsSL https://raw.githubusercontent.com/hristo2612/aso-cli/main/install.sh | bash
set -euo pipefail
REPO="hristo2612/aso-cli"

need_node() {
  echo "aso needs Node.js 22.13 or newer."
  if command -v brew >/dev/null 2>&1; then echo "  brew install node"; else echo "  https://nodejs.org/en/download"; fi
  exit 1
}
command -v node >/dev/null 2>&1 || need_node
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' || need_node

echo "→ installing the aso CLI"
npm install -g "aso-kit" 2>/dev/null || npm install -g "github:${REPO}"

if [ -t 0 ] || [ -r /dev/tty ]; then
  printf "→ also install the ASO agent skills (Claude Code, Codex, Cursor…)? [Y/n] "
  read -r answer </dev/tty || answer=y
  case "${answer:-y}" in [Nn]*) ;; *) npx -y skills add "$REPO" -g -y || echo "  skipped (run later: npx skills add $REPO)";; esac
fi

echo
echo "Done. Next: aso setup"
