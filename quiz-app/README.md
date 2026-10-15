# Interview-Quiz

Quiz-App mit 80 Multiple-Choice-Fragen zu Kubernetes, Homelab, Ingress, Gateway API und KI. Python, nur Standardbibliothek. Entstanden mit Claude als Hilfe beim Schreiben. Betrieben, getestet und deployed habe ich sie selbst im eigenen Kubernetes-Cluster.

## Funktionen

- Jede Frage hat vier Antworten (Reihenfolge wird gemischt). Richtig leuchtet grün, falsch rot.
- Navigation: Zurück, Überspringen, Weiter. Die Pod-Leiste oben ist klickbar und zeigt den Stand jeder Frage (richtig, falsch, übersprungen, offen). Beantwortete Fragen lassen sich ansehen, aber nicht noch einmal werten.
- Tipp-Button: kleine Zusatzhilfe, ohne die Lösung zu verraten.
- Nach der Antwort: richtig oder falsch mit kurzer Erklärung.
- Punkte mit Combo (mehrere richtige Antworten in Folge) und Level mit XP. Der Stand liegt nur im Browser (`localStorage`).
- Ergebnis am Ende: Punkte, Auswertung nach Thema, Tabelle im Stil von `kubectl get pods`. Offene und falsche Fragen lassen sich wiederholen.
- KI-Helfer (optional): Der Nutzer trägt einen eigenen API-Key ein (Anthropic oder OpenAI) und kann zur Frage chatten. Der Helfer verrät die richtige Antwort erst, nachdem geantwortet wurde.
- Ton (aus Standard, per Schalter) und Funken respektieren die Systemeinstellung "Bewegung reduzieren".
- Tastatur: A bis D oder 1 bis 4 antworten, H zeigt den Tipp, Pfeiltasten blättern, S überspringt, Enter geht weiter.

Schriften (SIL Open Font License, Lizenztexte in `static/fonts/`): Bebas Neue und IBM Plex Mono. Sie werden von der App selbst ausgeliefert, nicht von einem Drittanbieter.

## Zum API-Key

- Der Key wird nur im Browser eingegeben und nur im Browser gespeichert (`sessionStorage`, nur mit Haken bei "Key merken" in `localStorage`).
- Der Server sieht den Key nie. Der Browser ruft die Anbieter direkt auf (`connect-src` in der Content-Security-Policy ist auf `api.anthropic.com` und `api.openai.com` begrenzt).
- Ein Key im Browser ist bei einer öffentlichen Seite ein Risiko. Darum: Ausgabelimit beim Anbieter setzen und den Key danach löschen.

## Lokal starten

    python3 app.py

Dann http://localhost:8080 öffnen. Anderer Port: `PORT=9000 python3 app.py`.

## Als Container starten

    docker build -t quiz-app .
    docker run --rm -p 8080:8080 quiz-app

Der Container läuft als Nutzer 10001, nicht als root.

## Endpunkte

| Pfad | Zweck |
| --- | --- |
| `/` | Oberfläche |
| `/api/questions` | Fragen als JSON |
| `/api/info` | Pod-Name und Anzahl Fragen |
| `/healthz` | Liveness: Prozess lebt |
| `/readyz` | Readiness: 200 nur, wenn die Fragen geladen sind, sonst 503 |

## Test

    ./test.sh

Startet die App auf einem freien Port und prüft Endpunkte, Frontend-Dateien und die Fragen (eindeutige IDs, genau 3 falsche und 1 richtige Antwort).

## Deployment im Cluster

Die Manifeste liegen in `k8s/` (Deployment mit 2 Replicas, Service). Das Image baut die GitHub-Actions-Pipeline `.github/workflows/quiz-app.yml` (Test, dann Build und Push nach GHCR). Das Deployment läuft von Hand per `kubectl apply -f quiz-app/k8s/`.

Bei neuem Inhalt den Image-Tag erhöhen (aktuell `0.3.0`), weil Kubernetes ein vorhandenes Image mit gleichem Tag nicht neu zieht.
