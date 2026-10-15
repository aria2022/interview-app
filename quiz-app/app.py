import json
import os
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/fonts/bebas-neue.woff2": ("fonts/bebas-neue.woff2", "font/woff2"),
    "/fonts/plex-mono-400.woff2": ("fonts/plex-mono-400.woff2", "font/woff2"),
    "/fonts/plex-mono-500.woff2": ("fonts/plex-mono-500.woff2", "font/woff2"),
}

# Der Browser darf nur von dieser App laden. Einzige Ausnahme: die KI-Abfrage an Anthropic oder OpenAI.
CSP = (
    "default-src 'self'; "
    "connect-src 'self' https://api.anthropic.com https://api.openai.com; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "base-uri 'none'; "
    "form-action 'none'; "
    "frame-ancestors 'none'"
)


def load_questions():
    """Liest die Fragen. Gibt bei einem Fehler eine leere Liste zurück."""
    try:
        with open(BASE / "questions.json", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except (OSError, ValueError) as err:
        print(f"Fragen konnten nicht geladen werden: {err}", file=sys.stderr)
    return []


QUESTIONS = load_questions()


class Handler(BaseHTTPRequestHandler):
    def send_bytes(self, status, body, content_type, cache="no-cache"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_bytes(status, body, "application/json; charset=utf-8")

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in STATIC:
            name, content_type = STATIC[path]
            cache = "public, max-age=86400" if name.startswith("fonts/") else "no-cache"
            self.send_bytes(200, (BASE / "static" / name).read_bytes(), content_type, cache)
        elif path == "/api/questions":
            self.send_json(200, QUESTIONS)
        elif path == "/api/info":
            self.send_json(200, {"hostname": socket.gethostname(), "count": len(QUESTIONS)})
        elif path == "/healthz":
            # Lebt der Prozess? Antwortet immer 200.
            self.send_json(200, {"status": "ok"})
        elif path == "/readyz":
            # Bereit nur, wenn die Fragen geladen sind.
            if QUESTIONS:
                self.send_json(200, {"status": "ok", "questions": len(QUESTIONS)})
            else:
                self.send_json(503, {"status": "not ready", "questions": 0})
        else:
            self.send_json(404, {"error": "not found"})

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
