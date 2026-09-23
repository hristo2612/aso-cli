#!/usr/bin/env bash
# ASO CLI installer
#   curl -fsSL https://raw.githubusercontent.com/hristo2612/aso-cli/main/install.sh | bash
# Options (after `bash -s --`): --yes (no questions), --no-skills, --no-setup
set -euo pipefail

REPO="hristo2612/aso-cli"
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=13
ASSUME_YES=0 SKILLS=ask SETUP=ask
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --no-skills) SKILLS=no ;;
    --no-setup) SETUP=no ;;
  esac
done

# Colors only when writing to a terminal.
if [ -t 1 ]; then
  C=$'\033[36m' G=$'\033[32m' Y=$'\033[33m' R=$'\033[31m' D=$'\033[2m' B=$'\033[1m' N=$'\033[0m'
else
  C= G= Y= R= D= B= N=
fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s▸ %s%s\n' "$B" "$*" "$N"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
fail() { printf '  %s✗ %s%s\n' "$R" "$*" "$N"; exit 1; }

# Questions read from the keyboard even when this script is piped from curl.
TTY=/dev/tty
interactive() { [ "$ASSUME_YES" = 0 ] && [ -r "$TTY" ] && [ -w "$TTY" ] && { : <"$TTY"; } 2>/dev/null; }
ask() { # ask "question" default(y|n)
  local q=$1 def=$2 hint answer
  [ "$def" = y ] && hint="Y/n" || hint="y/N"
  if ! interactive; then [ "$def" = y ]; return; fi
  printf '  %s?%s %s %s[%s]%s ' "$C" "$N" "$q" "$D" "$hint" "$N" >"$TTY"
  read -r answer <"$TTY" || answer=
  answer=${answer:-$def}
  [[ $answer =~ ^[Yy] ]]
}

printf '%s' "$C"
cat <<'BANNER'

   █████╗ ███████╗ ██████╗      ██████╗██╗     ██╗
  ██╔══██╗██╔════╝██╔═══██╗    ██╔════╝██║     ██║
  ███████║███████╗██║   ██║    ██║     ██║     ██║
  ██╔══██║╚════██║██║   ██║    ██║     ██║     ██║
  ██║  ██║███████║╚██████╔╝    ╚██████╗███████╗██║
  ╚═╝  ╚═╝╚══════╝ ╚═════╝      ╚═════╝╚══════╝╚═╝
BANNER
printf '%s' "$N"
say "  Free App Store Optimization for you and your AI agent."

# 1. Node.js
step "Node.js ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}+"
node_ok() {
  command -v node >/dev/null 2>&1 &&
    node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>${NODE_MIN_MAJOR}||(a===${NODE_MIN_MAJOR}&&b>=${NODE_MIN_MINOR})?0:1)" 2>/dev/null
}
if node_ok; then
  ok "node $(node -v)"
else
  command -v node >/dev/null 2>&1 && warn "node $(node -v) is too old" || warn "node is not installed"
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ] && ask "Install Node.js 22 with nvm?" y; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm install 22 >/dev/null && nvm use 22 >/dev/null
  elif command -v brew >/dev/null 2>&1 && ask "Install the latest Node.js with Homebrew?" y; then
    brew install node || brew upgrade node
  fi
  node_ok || fail "Please install Node.js ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}+ (https://nodejs.org) and run this again."
  ok "node $(node -v)"
fi

# 2. The CLI
step "Installing the aso command"
if npm install -g "github:${REPO}" >/tmp/aso-install.log 2>&1 || npm install -g aso-kit >>/tmp/aso-install.log 2>&1; then
  rm -f /tmp/aso-install.log
else
  if grep -q EACCES /tmp/aso-install.log; then
    fail "npm can't write to its global folder. Fix it once with:  npm config set prefix ~/.local  (then add ~/.local/bin to PATH) and run this again."
  fi
  fail "npm install failed, see /tmp/aso-install.log"
fi
NPM_BIN="$(npm prefix -g)/bin"
if command -v aso >/dev/null 2>&1 && aso --version >/dev/null 2>&1; then
  ok "aso $(aso --version) at $(command -v aso)"
else
  export PATH="$NPM_BIN:$PATH"
  ok "aso $("$NPM_BIN/aso" --version)"
  warn "$NPM_BIN is not on your PATH. Add this to your shell profile:"
  say  "      export PATH=\"$NPM_BIN:\$PATH\""
fi
if [ "$(uname)" = Darwin ] && [ ! -d "/Applications/Google Chrome.app" ] && [ ! -d "$HOME/Applications/Google Chrome.app" ]; then
  warn "Google Chrome not found. It's used for the Apple Ads sign-in (https://www.google.com/chrome)."
fi

# 3. Agent skills
if [ "$SKILLS" != no ]; then
  step "Agent skills (Claude Code, Codex, Cursor and more)"
  if ask "Install the 8 ASO skills for your AI agents?" y; then
    if npx -y skills add "$REPO" -g -y >/tmp/aso-skills.log 2>&1; then
      rm -f /tmp/aso-skills.log
      ok "skills installed (update later with: npx skills update)"
    else
      warn "skills install failed (see /tmp/aso-skills.log); retry with: npx skills add $REPO"
    fi
  else
    say "  ${D}later: npx skills add $REPO${N}"
  fi
fi

# 4. Setup
step "Connect Apple Ads for keyword popularity"
if [ "$SETUP" != no ] && interactive && ask "Run aso setup now? (about 1 minute)" y; then
  aso setup <"$TTY"
else
  say "  Run ${B}aso setup${N} when you're ready. Search, ranks, difficulty and lint work without it."
fi

say ""
say "  ${G}${B}Done.${N} Try:  ${B}aso keywords \"habit tracker,daily planner\"${N}"
say "  ${D}Docs: https://github.com/${REPO}${N}"
say ""
