#!/usr/bin/env bash
# Chrome 136+ ignores --remote-debugging-port on the default profile, so the scraper gets its own.
set -euo pipefail

port="${TWIN_CDP_PORT:-9222}"
profile="${TWIN_CHROME_PROFILE:-$HOME/.config/twin-chrome}"

if [[ -z "${CHROME:-}" ]]; then
  case "$(uname -s)" in
    Darwin) CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ;;
    *) CHROME="google-chrome" ;;
  esac
fi

mkdir -p "$profile"
exec "$CHROME" \
  --user-data-dir="$profile" \
  --remote-debugging-port="$port" \
  --no-first-run \
  --no-default-browser-check \
  "$@"
