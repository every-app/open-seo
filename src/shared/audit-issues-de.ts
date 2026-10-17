export interface LocalizedAuditIssueContent {
  title: string;
  explanation: string;
  howToFix: string;
}

export const AUDIT_ISSUE_DESCRIPTORS_DE: Record<
  string,
  LocalizedAuditIssueContent
> = {
  "blocked-page": {
    title: "Crawler wurde blockiert",
    explanation:
      "Die Website hat eine Bot-Challenge oder Zugriffsverweigerung (z. B. eine Cloudflare-Challenge oder HTTP 403) statt der Seite zurückgegeben. Wir weisen dies transparent aus, anstatt die Seite fälschlich als defekt darzustellen. Die Seite konnte nicht geprüft werden, und Suchmaschinen-Crawler könnten auf ähnliche Hürden stoßen.",
    howToFix:
      'Falls du Inhaber der Website bist, setze den User-Agent "OpenSEO-Audit" in deinen WAF-/Bot-Protection-Regeln auf die Allowlist (bei Cloudflare: eine WAF-Regel, die den Bot-Schutz für "OpenSEO-Audit" überspringt). Starte das Audit anschließend neu. Bei Shopify nutze stattdessen den Crawler-Zugang (Onlineshop → Einstellungen → Crawler-Zugriff) und hinterlege die Signatur in OpenSEO unter Einstellungen → Crawler-Zugang.',
  },
  "javascript-rendering-suspected": {
    title: "Inhalte erfordern möglicherweise JavaScript",
    explanation:
      "Das HTML der Seite enthält einen JavaScript-App-Container mit sehr wenig lesbarem Text und keinen Überschriften, Links oder Bildern. Möglicherweise lädt die Seite ihre Inhalte erst im Browser nach oder befand sich beim Rendern noch im Ladevorgang. Inhaltsprüfungen wurden übersprungen, da dieses HTML möglicherweise nicht die vollständige Seite widerspiegelt.",
    howToFix:
      'Falls bei diesem Audit kein JavaScript gerendert wurde, starte ein neues Audit mit aktivierter Option "JavaScript rendern", um die nachgeladenen Inhalte zu prüfen. Für ein zuverlässiges Crawling sollten wichtige Inhalte und Navigationen bereits im initialen HTML per Server-Side-Rendering (SSR) oder Pre-Rendering ausgeliefert werden.',
  },
  "rate-limited-page": {
    title: "Rate-Limit erreicht (429)",
    explanation:
      "Der Server hat mit 429 Too Many Requests geantwortet, sodass diese Seite nicht geprüft werden konnte. Der Crawler pausiert kurz, wenn die Abkühlzeit der Website innerhalb des Audit-Zeitlimits liegt.",
    howToFix:
      'Erhöhe das Rate-Limit für Crawler oder setze den User-Agent "OpenSEO-Audit" in den Rate-Limiting-Regeln auf die Allowlist. Starte das Audit anschließend neu (ggf. mit weniger Seiten, falls das Limit sehr strikt ist). Bei Shopify nutze stattdessen den Crawler-Zugang.',
  },
  "crawl-rate-limited": {
    title: "Crawl vorzeitig beendet: Rate-Limit",
    explanation:
      "Die Website forderte eine längere Wartezeit, als das Audit-Zeitlimit erlaubt. Das Crawlen weiterer Seiten wurde gestoppt. Dieser Bericht ist unvollständig; nicht abgerufene URLs werden weder als fehlerhaft noch als rate-limitiert gewertet.",
    howToFix:
      'Starte das Audit neu, sobald das Rate-Limit der Website zurückgesetzt ist, oder bitte den Webseitenbetreiber, den "OpenSEO-Audit"-Crawler freizugeben. Bei Shopify nutze den Crawler-Zugang.',
  },
  "server-error": {
    title: "Serverfehler (5xx)",
    explanation:
      "Die Seite hat einen 5xx-Serverfehler zurückgegeben. Wenn Suchmaschinen wiederholt auf Serverfehler stoßen, crawlen sie die Website seltener und entfernen betroffene Seiten eventuell aus dem Index.",
    howToFix:
      "Prüfe die Server-Logs für diese URL und behebe den zugrunde liegenden Fehler. Falls die Seite dauerhaft entfernt wurde, gib einen Status 404/410 zurück oder richte eine 301-Weiterleitung auf eine relevante Zielseite ein.",
  },
  "broken-internal-link": {
    title: "Fehlerhafter interner Link",
    explanation:
      "Diese Seite verlinkt auf eine interne URL, die einen Fehlerstatus (4xx/5xx) zurückgibt. Defekte Links verschwenden Crawl-Budget, lassen Link-Equity verpuffen und frustrieren Besucher – sie gehören zu den häufigsten und schädlichsten technischen SEO-Problemen.",
    howToFix:
      "Aktualisiere den Link auf die korrekte, aktive Ziel-URL oder entferne ihn. Falls das Ziel verschoben wurde, verlinke direkt auf die neue URL, statt dich auf Weiterleitungen zu verlassen.",
  },
  "missing-title": {
    title: "Fehlendes Title-Tag",
    explanation:
      "Die Seite besitzt kein <title>-Tag. Der Titel ist das stärkste On-Page-Relevanzsignal und dient als Überschrift in den Suchergebnissen. Fehlt er, generieren Suchmaschinen eigenmächtig einen oft unpassenden Titel.",
    howToFix:
      "Füge ein einzigartiges, aussagekräftiges <title>-Tag mit ca. 50–60 Zeichen hinzu, das das Hauptthema der Seite prägnant benennt.",
  },
  "broken-page": {
    title: "Seite liefert Fehlercode (4xx)",
    explanation:
      "Diese gecrawlte URL lieferte einen Client-Fehler (z. B. 404). Wenn sie in der Sitemap oder auf anderen Seiten verlinkt ist, verschwenden Crawler weiterhin Anfragen darauf.",
    howToFix:
      "Falls die Seite existieren sollte, stelle sie wieder her. Falls sie absichtlich entfernt wurde, lösche sie aus der Sitemap sowie aus internen Verlinkungen und richte ggf. eine 301-Weiterleitung ein.",
  },
  "duplicate-title": {
    title: "Doppelter Seitentitel (Duplicate Title)",
    explanation:
      "Mehrere Seiten teilen sich denselben Title-Tag. Suchmaschinen nutzen den Titel zur Unterscheidung von Inhalten; Duplikate führen zu Kannibalisierung und senken die Klickrate (CTR).",
    howToFix:
      "Formuliere für jede Seite einen individuellen Titel. Verwende bei Template-Seiten dynamische Unterscheidungsmerkmale (Name, Kategorie, Standort) im Seitentitel.",
  },
  "duplicate-meta-description": {
    title: "Doppelte Meta-Description",
    explanation:
      "Mehrere Seiten verwenden dieselbe Meta-Description. Suchergebnisse zeigen dadurch identische Snippets an, sodass Nutzer die Seiten nicht voneinander unterscheiden können.",
    howToFix:
      "Erstelle für jede Seite eine einzigartige Meta-Description oder entferne das Duplikat ganz – Suchmaschinen erstellen dann ein Snippet aus dem Seiteninhalt, was besser als ein falsches Duplikat ist.",
  },
  "duplicate-content": {
    title: "Doppelter Seiteninhalt (Duplicate Content)",
    explanation:
      "Zwei oder mehr URLs liefern exakt denselben sichtbaren Text. Suchmaschinen wählen in der Regel nur eine Version für den Index aus, wodurch sich Ranking-Signale aufteilen.",
    howToFix:
      "Führe Duplikate zusammen: Bestimme die kanonische URL, setze rel=canonical auf den anderen Seiten und richte nach Möglichkeit 301-Weiterleitungen ein (häufige Ursachen: Trailing-Slashes, URL-Parameter, HTTP/HTTPS- oder WWW-Varianten).",
  },
  "missing-meta-description": {
    title: "Fehlende Meta-Description",
    explanation:
      "Die Seite hat keine Meta-Description hinterlegt. Suchmaschinen stellen das Snippet dann automatisch aus Textfragmenten der Seite zusammen, was oft unvollständig wirkt und Klicks kostet.",
    howToFix:
      "Füge eine prägnante Meta-Description mit ca. 70–160 Zeichen hinzu, die den Inhalt der Seite zusammenfasst und einen Klickanreiz bietet.",
  },
  "missing-h1": {
    title: "Fehlende H1-Überschrift",
    explanation:
      "Die Seite besitzt keine H1-Überschrift. Die H1 signalisiert Nutzern und Suchmaschinen das primäre Thema des Dokuments. Seiten ohne H1 weisen oft eine unklare thematische Struktur auf.",
    howToFix:
      "Füge genau eine H1-Überschrift hinzu, die das Hauptthema der Seite klar benennt und zum Title-Tag passt.",
  },
  "multiple-h1": {
    title: "Mehrere H1-Überschriften",
    explanation:
      "Die Seite enthält mehr als eine H1-Überschrift. Dies verwässert das thematische Hauptsignal und deutet meist auf einen Template-Fehler hin (z. B. wenn Logo und Überschrift beide als H1 ausgezeichnet sind).",
    howToFix:
      "Behalte genau eine H1 als Hauptüberschrift bei und stufe weitere Überschriften auf H2/H3 herab (oder nutze für Logos normale HTML-Elemente ohne Überschriften-Semantik).",
  },
  "redirect-chain": {
    title: "Weiterleitungskette (Redirect Chain)",
    explanation:
      "Das Erreichen der Zielseite erfordert zwei oder mehr aufeinanderfolgende Weiterleitungen. Jeder Zwischenschritt erzeugt Latenz, verliert Link-Equity und beansprucht Crawl-Budget; zu lange Ketten werden von Crawlern abgebrochen.",
    howToFix:
      "Leite die ursprüngliche URL und alle internen Links direkt auf das finale Ziel weiter, sodass maximal eine einzige Weiterleitung erfolgt.",
  },
  "redirect-loop": {
    title: "Weiterleitungsschleife (Redirect Loop)",
    explanation:
      "Diese Weiterleitung führt im Kreis wieder zu sich selbst zurück. Die URL kann dadurch nie aufgelöst werden; Browser und Suchmaschinen brechen mit einer Fehlermeldung ab.",
    howToFix:
      "Überprüfe die Weiterleitungsregeln für diese URL und unterbrich den Kreislauf, sodass die Weiterleitung bei einer realen 200-OK-Seite endet.",
  },
  "canonical-conflict": {
    title: "Widersprüchliche Canonical-Angaben",
    explanation:
      "Die Seite deklariert unterschiedliche Canonical-URLs im HTML-Tag <link rel=canonical> und im HTTP-Link-Header. Bei Widersprüchen ignorieren Suchmaschinen oft beide Angaben und wählen eine eigene URL.",
    howToFix:
      "Wähle eine eindeutige kanonische URL und deklariere sie an genau einer Stelle (im <head> des HTMLs); entferne oder harmonisiere die andere Angabe.",
  },
  "thin-content": {
    title: "Sehr dünner Inhalt (Thin Content)",
    explanation:
      "Die Seite enthält nur sehr wenig sichtbaren Text. Seiten mit unzureichendem Inhalt ranken selten, können die Qualitätsbewertung der gesamten Website belasten und weisen bei clientseitigen Web-Apps oft auf Inhalte hin, die für normale Crawler unsichtbar bleiben.",
    howToFix:
      "Erweitere die Seite um substanziellen, nützlichen Inhalt, setze sie auf noindex oder führe sie mit einer passenderen Seite zusammen. Falls der Inhalt existiert, aber via JavaScript geladen wird, stelle sicher, dass er per SSR oder Pre-Rendering im HTML bereitgestellt wird.",
  },
  "images-missing-alt": {
    title: "Bilder ohne Alt-Texte",
    explanation:
      "Mindestens ein Bild auf der Seite besitzt kein alt-Attribut. Alt-Texte sind unverzichtbar für die Barrierefreiheit (Screenreader) und die primäre Methode für Suchmaschinen, Bildinhalte zu verstehen.",
    howToFix:
      'Hinterlege beschreibende Alt-Texte für inhaltstragende Bilder. Verwende ein leeres Attribut (alt="") ausschließlich für rein dekorative Schmuckelemente.',
  },
  "orphan-page": {
    title: "Verwaiste Seite (Orphan Page)",
    explanation:
      "Keine der gecrawlten Seiten verlinkt auf diese URL – sie wurde ausschließlich über die Sitemap gefunden. Verwaiste Seiten erhalten kaum Beachtung von Crawlern, keine interne Linkkraft und können von Website-Besuchern nicht gefunden werden.",
    howToFix:
      "Verlinke diese Seite von relevanten Stellen aus (Navigation, Themen-Hubs, verwandte Beiträge) oder entferne sie aus der Sitemap, falls sie nicht indexiert werden soll.",
  },
  "no-outgoing-links": {
    title: "Seite ohne ausgehende Links",
    explanation:
      "Die Seite enthält keinerlei ausgehende Links und bildet eine Sackgasse. Eingehende Linkkraft stoppt hier, Crawler können keine weiteren Pfade erkunden und Besucher müssen den Zurück-Button des Browsers nutzen.",
    howToFix:
      "Füge Links zu verwandten Seiten, zur übergeordneten Kategorie oder zur Startseite hinzu. Falls die Navigation per JavaScript gerendert wird, stelle sicher, dass sie auch im statischen HTML existiert.",
  },
  "title-too-long": {
    title: "Seitentitel zu lang",
    explanation:
      "Der Titel überschreitet ca. 60 Zeichen. In den Suchergebnissen wird er voraussichtlich mit Auslassungspunkten abgeschnitten, wodurch das Ende des Satzes verloren geht.",
    howToFix:
      "Kürze den Titel auf etwa 50–60 Zeichen und platziere die wichtigsten Signalwörter an den Anfang.",
  },
  "title-too-short": {
    title: "Seitentitel zu kurz",
    explanation:
      "Der Titel ist kürzer als ca. 10 Zeichen. Solche Titel sind meist zu generisch, um den Inhalt präzise zu beschreiben oder Aufmerksamkeit in den SERPs zu erzeugen.",
    howToFix:
      "Erweitere den Titel auf eine aussagekräftige Phrase (ca. 30–60 Zeichen), die den Inhalt und Mehrwert der Seite widerspiegelt.",
  },
  "meta-description-too-long": {
    title: "Meta-Description zu lang",
    explanation:
      "Die Meta-Description umfasst mehr als ca. 160 Zeichen. Suchmaschinen werden das Snippet in den Suchergebnissen unvollständig abschneiden.",
    howToFix:
      "Kürze die Beschreibung auf ca. 70–160 Zeichen und stelle sicher, dass die Kernaussage und der Call-to-Action erhalten bleiben.",
  },
  "meta-description-too-short": {
    title: "Meta-Description zu kurz",
    explanation:
      "Die Meta-Description hat weniger als ca. 70 Zeichen. Zu kurze Beschreibungen nutzen den verfügbaren Platz in den Suchergebnissen nicht aus und werden von Google oft durch beliebigen Text von der Seite ersetzt.",
    howToFix:
      "Erweitere die Beschreibung auf ca. 70–160 Zeichen, die den Inhalt prägnant zusammenfassen und zum Klick einladen.",
  },
  "heading-order-skip": {
    title: "Überschriften-Ebenen übersprungen",
    explanation:
      "Die Überschriften-Hierarchie überspringt Ebenen (z. B. eine H4 direkt nach einer H2). Dies schwächt die logische Dokumentstruktur für Screenreader und Inhalts-Parser.",
    howToFix:
      "Passe die Überschriften so an, dass sie stufenweise absteigen (H1 → H2 → H3), ohne Zwischenebenen zu überspringen.",
  },
  "slow-response": {
    title: "Langsame Server-Antwortzeit (TTFB)",
    explanation:
      "Die Server-Antwort (Time to First Byte) dauerte über 1,5 Sekunden. Eine langsame Antwortzeit verschlechtert alle nachgelagerten Web-Vitals-Metriken und bremst das Crawling.",
    howToFix:
      "Prüfe Server- und Datenbankabfragen sowie das Caching für diese Route. Das Ausliefern von zwischengespeichertem oder statisch generiertem HTML behebt das Problem meist zuverlässig.",
  },
  "noindex-page": {
    title: "Seite ist auf noindex gesetzt",
    explanation:
      "Die Seite signalisiert Suchmaschinen, nicht in den Index aufgenommen zu werden (per Robots-Meta-Tag oder X-Robots-Tag-Header). Dies ist oft gewollt – dieser Hinweis dient lediglich der Transparenz und ist kein Fehler.",
    howToFix:
      "Falls die Seite ranken soll, entferne die noindex-Direktive. Falls es beabsichtigt ist (z. B. Danke-Seiten, interne Filter, Login-Bereiche), ist keine Handlung erforderlich.",
  },
  "canonicalized-page": {
    title: "Auf eine andere URL kanonisiert",
    explanation:
      "Die Seite deklariert eine andere URL als Canonical und weist Suchmaschinen an, stattdessen jene URL zu indexieren. Dies ist bei Varianten und Syndizierung normal, verhindert aber ein eigenständiges Ranking dieser Seite.",
    howToFix:
      "Falls diese Seite selbstständig ranken soll, setze den Canonical-Link auf ihre eigene URL. Andernfalls ist keine Handlung nötig.",
  },
  "deep-page": {
    title: "Seite liegt tief in der Seitenstruktur",
    explanation:
      "Die Seite ist 5 oder mehr Klicks von der Startseite entfernt. Tiefe Seiten werden von Suchmaschinen seltener gecrawlt und erhalten weniger interne Linkkraft.",
    howToFix:
      "Füge interne Verlinkungen von übergeordneten Seiten (Kategorie-Seiten, Hubs, Hauptnavigation) hinzu, um den Klickpfad zu verkürzen.",
  },
};
