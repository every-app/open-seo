# Eigener Fork, selbst gehostet – nicht der gehostete Dienst

- **Datum:** 2026-11-20
- **Was:** Das SEO-Werkzeug läuft als eigener Fork (`lippistudio/open-seo`) auf eigener Infrastruktur; Datenquellen sind
  DataForSEO-Zugänge aus dem Tresor.
- **Warum:** Die Analysen laufen über Kunden-Domains – also über Daten, die zu fremden Websites gehören. Beim gehosteten
  Dienst läge jede geprüfte Domain, jeder Keyword-Satz und jede Wettbewerbsanalyse in einem fremden Konto, und die
  Zugangsdaten der Datenquelle wären dort hinterlegt statt im Tresor. Selbst gehostet bleiben die Daten im Haus, und
  die Kosten sind dem Kundenprojekt zuordenbar.
- **Verworfen:** der gehostete Dienst (Daten und Zugänge beim Anbieter); eine eigene Lösung von Grund auf (Monate Arbeit
  für etwas, das als Fork schon 1973 Tests mitbringt).
- **Nachtrag 2026-11-28:** Der Fork wird mit **pnpm** und festgeschriebenem Stand installiert. Mit `npm` entsteht ein
  anderer Abhängigkeitsbaum, dann schlagen 13 Testdateien fehl, ohne dass etwas kaputt wäre.
