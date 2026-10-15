#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# freien Port suchen, damit kein alter Prozess den Test täuschen kann
PORT="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
export PORT

python3 app.py &
APP_PID=$!
trap 'kill "$APP_PID" 2>/dev/null || true' EXIT

URL="http://127.0.0.1:${PORT}"

# warten, bis die App antwortet (höchstens 10 Sekunden)
for _ in $(seq 1 20); do
  if curl --fail --silent "$URL/healthz" > /dev/null; then
    break
  fi
  sleep 0.5
done

# der gestartete Prozess muss noch laufen
kill -0 "$APP_PID"

curl --fail --silent --show-error "$URL/healthz" | grep --quiet '"ok"'
curl --fail --silent --show-error "$URL/readyz" | grep --quiet '"ok"'
curl --fail --silent --show-error "$URL/" | grep --quiet 'Interview-Quiz'
curl --fail --silent --show-error "$URL/app.js" | grep --quiet 'use strict'
curl --fail --silent --show-error "$URL/style.css" | grep --quiet 'font-face'
for font in bebas-neue plex-mono-400 plex-mono-500; do
  curl --fail --silent --show-error --output /dev/null "$URL/fonts/$font.woff2"
done
curl --fail --silent --show-error "$URL/api/questions" | python3 -c '
import json, sys
data = json.load(sys.stdin)
assert len(data) >= 60, f"zu wenige Fragen: {len(data)}"
ids = [x["id"] for x in data]
assert len(ids) == len(set(ids)), "doppelte Nummern"
for x in data:
    nr = x["id"]
    for feld in ("q", "correct", "hint", "explain", "group"):
        assert str(x[feld]).strip(), f"Feld {feld} leer bei Frage {nr}"
    assert len(x["wrong"]) == 3, f"nicht genau 3 falsche Antworten bei Frage {nr}"
    alle = x["wrong"] + [x["correct"]]
    assert len(set(alle)) == 4 and all(a.strip() for a in alle), f"Antworten doppelt oder leer bei Frage {nr}"
'

# unbekannter Pfad muss 404 liefern
test "$(curl --silent --output /dev/null --write-out '%{http_code}' "$URL/gibt-es-nicht")" = "404"

echo "Alle Tests erfolgreich"
