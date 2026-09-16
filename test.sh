#!/usr/bin/env bash
set -euo pipefail

python3 app.py >/tmp/interview-app.log 2>&1 &
APP_PID=$!
trap 'kill "$APP_PID" 2>/dev/null || true' EXIT

sleep 1
curl --fail --silent http://127.0.0.1:8080/ | grep --quiet "Hello from Kubernetes"
curl --fail --silent http://127.0.0.1:8080/healthz | grep --quiet '"status": "ok"'

echo "Alle Tests erfolgreich"
