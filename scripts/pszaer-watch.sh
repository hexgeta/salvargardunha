#!/bin/bash
# PSZAER consultation watcher.
# Alerts via Telegram (the "inbound leads" chat — HEXGETAFORMSBOT) the moment the
# participa.pt consultation page gains a NEW document — which is how the
# Government publishes its "relatório de ponderação" (its reply to all the
# public contributions) and, eventually, the final approved programme.
#
# Runs from cron on the VPS. participa.pt firewalls datacenter IPs, so the
# fetch goes through the Webshare proxy; participa.pt also serves an incomplete
# cert chain, hence --insecure on that read-only GET.
#
# Secrets: Telegram creds live in ~/.pszaer-watch/.env (chmod 600, untracked);
# WEBSHARE_PROXY_URL comes from the login profile. No secrets in this file.

set -uo pipefail

STATE_DIR="$HOME/.pszaer-watch"
mkdir -p "$STATE_DIR"
LOG() { echo "[$(date '+%F %T')] $*"; }

# --- load secrets (disable -u: shell init files reference unset vars) ---
set +u
[ -f "$STATE_DIR/.env" ] && { set -a; . "$STATE_DIR/.env"; set +a; }
[ -f "$HOME/.profile" ] && { set -a; . "$HOME/.profile" 2>/dev/null; set +a; }
set -u
# Route to the "inbound leads" chat (HEXGETAFORMSBOT — same as aima/twospouts leads)
BOT="${TELEGRAM_BOT_TOKEN_HEXGETAFORMSBOT:-}"
CHAT="${TELEGRAM_CHAT_ID_HEXGETAFORMSBOT:-}"
PROXY="${WEBSHARE_PROXY_URL:-}"

CONSULT_URL="https://participa.pt/pt/consulta/programa-setorial-das-zonas-de-aceleracao-da-implantacao-de-energias-renovaveis-pszaer"

send_tg() {
  if [ -z "$BOT" ] || [ -z "$CHAT" ]; then LOG "telegram not configured"; return 1; fi
  curl -s --max-time 30 "https://api.telegram.org/bot${BOT}/sendMessage" \
    --data-urlencode "chat_id=${CHAT}" \
    --data-urlencode "text=$1" \
    -d parse_mode=HTML -d disable_web_page_preview=true >/dev/null \
    && LOG "telegram sent" || LOG "telegram FAILED"
}

# --- fetch the consultation page via the proxy (retry: exits are flaky) ---
html=""
for attempt in 1 2 3; do
  html=$(curl -s --max-time 45 --insecure --proxy "$PROXY" "$CONSULT_URL" || true)
  [ -n "$html" ] && break
  LOG "fetch attempt $attempt empty; retrying"; sleep 5
done
if [ -z "$html" ]; then LOG "warn: empty fetch after 3 tries — will retry next cron"; exit 0; fi

docs=$(printf '%s' "$html" \
  | grep -oiE 'contents/consultationdocument/[^"]+' \
  | sed 's/%20/ /g' | sort -u)
ndocs=$(printf '%s\n' "$docs" | grep -c . || true)

if [ "$ndocs" -lt 1 ]; then
  LOG "warn: 0 documents parsed — page structure may have changed"; exit 0
fi

if [ ! -f "$STATE_DIR/docs.list" ]; then
  printf '%s\n' "$docs" > "$STATE_DIR/docs.list"
  LOG "baseline recorded: $ndocs documents (no alert on first run)"
  send_tg "✅ <b>PSZAER monitor active</b>
Watching the participa.pt consultation page ($ndocs documents recorded). You'll get an alert here the moment a new document appears — the <b>relatório de ponderação</b> (the Government's reply to the public contributions) or the final approval.

$CONSULT_URL"
  exit 0
fi

newdocs=$(comm -13 "$STATE_DIR/docs.list" <(printf '%s\n' "$docs") \
  | sed 's#contents/consultationdocument/##g')

if [ -n "$newdocs" ]; then
  LOG "NEW DOCUMENTS: $newdocs"
  send_tg "🚨 <b>PSZAER — new document on the consultation</b>
A new document has appeared on participa.pt — likely the <b>relatório de ponderação</b> (the Government's reply to the public-consultation contributions):

$newdocs

$CONSULT_URL"
  printf '%s\n' "$docs" > "$STATE_DIR/docs.list"
else
  LOG "no change ($ndocs documents)"
fi
