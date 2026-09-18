#!/usr/bin/env bash
set -u

APP_DIR=/home/e1jeong/lotto-sub-backend
ENV_FILE="$APP_DIR/.env.local"
FETCH_URL=http://127.0.0.1:3000/api/lotto/fetch-winning
RETRY_SECONDS=600
LOCK_FILE=/var/lock/lotto-sub-backend-winning-number.lock

exec 9>"$LOCK_FILE"
if ! flock --nonblock 9; then
  echo "$(date --iso-8601=seconds) [lotto-fetch] another job is already running"
  exit 0
fi

CRON_SECRET_TOKEN=$(grep -m 1 '^CRON_SECRET_TOKEN=' "$ENV_FILE" | cut -d '=' -f 2- | tr -d '\r')
: "${CRON_SECRET_TOKEN:?CRON_SECRET_TOKEN is required}"

TARGET_DATE=$(TZ=Asia/Seoul date +%F)

while true; do
  RESPONSE=$(curl --silent --show-error --max-time 30 \
    --request POST \
    --header "Authorization: Bearer $CRON_SECRET_TOKEN" \
    --header 'Content-Type: application/json' \
    --data "{\"targetDate\":\"$TARGET_DATE\"}" \
    --write-out $'\n%{http_code}' \
    "$FETCH_URL")
  CURL_EXIT=$?

  if [ "$CURL_EXIT" -eq 0 ]; then
    HTTP_STATUS=${RESPONSE##*$'\n'}
    BODY=${RESPONSE%$'\n'*}

    if [[ "$HTTP_STATUS" =~ ^2[0-9][0-9]$ ]]; then
      echo "$(date --iso-8601=seconds) [lotto-fetch] success $BODY"
      exit 0
    fi

    echo "$(date --iso-8601=seconds) [lotto-fetch] HTTP $HTTP_STATUS; retrying in ${RETRY_SECONDS}s"
  else
    echo "$(date --iso-8601=seconds) [lotto-fetch] request failed exit=$CURL_EXIT; retrying in ${RETRY_SECONDS}s"
  fi

  sleep "$RETRY_SECONDS"
done
