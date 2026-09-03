#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/home/e1jeong/lotto-sub-backend
ENV_FILE="$APP_DIR/.env.local"
RECONCILE_URL=http://127.0.0.1:3001/api/billing/reconcile

set -a
. "$ENV_FILE"
set +a

: "${CRON_SECRET_TOKEN:?CRON_SECRET_TOKEN is required}"

curl --fail --silent --show-error --max-time 30 \
  --request POST \
  --header "Authorization: Bearer $CRON_SECRET_TOKEN" \
  "$RECONCILE_URL"
