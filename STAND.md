# Stand (lippistudio-Fork)

Fork von [every-app/open-seo](https://github.com/every-app/open-seo) (`upstream`), unser Fork ist
`lippistudio/open-seo` (`origin`). Zweck: selbst gehostetes SEO-Werkzeug (Keyword-, Ranking- und Seitenanalysen über
DataForSEO) für die Kunden-Websites des Studios. Die übrigen Dateien stammen vom Hersteller.

## Stand

Stand: 2026-11-20 · Status: **pausiert** (läuft derzeit nicht)

- Fertig: eigener Commit auf `chore/ignore-backups-compose-dataforseo-env` – Backups beim Selbsthosten ignoriert,
  DataForSEO-Key wird an die Laufzeit durchgereicht (Key nur aus dem Tresor).
- Offen: eigenen Branch mit `upstream/main` abgleichen, bevor es wieder genutzt wird.

## Floorplan

Die Karte des Projekts liegt in `floorplan/` (`floorplan/index.html` im Browser öffnen; Fragen an die Karte:
`node floorplan/serve.mjs`). Nach Änderungen an Code, Dateien oder Struktur mit dem Skill `floorplan` aktualisieren und
mit committen; `floorplan/.cache/` bleibt draußen.

## Prüfen

Prüflauf: 2026-11-28 – ./pruefen.sh   (285 Testdateien, 1973 Tests, alle grün; 19 s)

Start: `pnpm install --frozen-lockfile`, dann `pnpm dev`; Anleitung für Agenten: `AGENTS.md`.

Wichtig: Die Abhängigkeiten müssen mit **pnpm** und dem festgeschriebenen Stand installiert werden. Mit `npm`
entsteht ein anderer Baum (u. a. eine andere `@better-auth/core`), dann schlagen 13 Testdateien mit Fehlern fehl, die
nach Programmfehlern aussehen, aber keine sind.
