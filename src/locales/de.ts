import { umamiDe } from "./umami.de";

export const de = {
  nav: {
    overview: "Übersicht",
    dashboard: "Dashboard",
    research: "Recherche",
    keywords: "Keyword-Recherche",
    domain: "Domain-Übersicht",
    backlinks: "Backlinks",
    my_site: "Meine Website",
    search_performance: "GSC Insights",
    rank_tracking: "Rank-Tracking",
    saved_keywords: "Gespeicherte Keywords",
    audit: "Site-Audit",
    ai_visibility: "KI-Sichtbarkeit",
    prompt_research: "Prompt-Recherche",
    prompt_explorer: "Prompt-Explorer",
    prompt_tracking: "Prompt-Tracking",
    ai_tools: "KI-Tools",
    reports: "Berichte",
    context: "Projekt-Kontext",
    agent_setup: "Agenten-Einrichtung",
    settings: "Einstellungen",
    switch_project: "Projekt wechseln",
  },
  common: {
    language: "Sprache",
    theme: "Erscheinungsbild",
    save: "Speichern",
    saved: "Gespeichert",
    cancel: "Abbrechen",
    delete: "Löschen",
    edit: "Bearbeiten",
    close: "Schließen",
    loading: "Wird geladen...",
    search: "Suchen",
    filter: "Filter",
    export: "Exportieren",
    all: "Alle",
    date: "Datum",
    status: "Status",
    url: "URL",
    project: "Projekt",
    select_project: "Projekt auswählen",
    create_project: "Neues Projekt anlegen",
    organization: "Organisation",
    sign_out: "Abmelden",
    help: "Hilfe",
    billing: "Abrechnung & Plan",
    profile: "Profil",
    system: "System",
    light: "Hell",
    dark: "Dunkel",
    german: "Deutsch",
    english: "English",
  },
  audit: {
    title: "Site-Audit",
    start_audit: "Audit starten",
    crawling: "Crawling läuft...",
    pages_crawled: "Seiten gecrawlt",
    all_issues: "Alle Probleme",
    critical: "Kritisch",
    warning: "Warnung",
    info: "Hinweis",
    healthy: "Fehlerfrei",
    pages: "Seiten",
    issues: "Probleme",
    overview: "Übersicht",
    how_to_fix: "So wird es behoben",
    explanation: "Erklärung & Auswirkung",
    affected_pages: "Betroffene Seiten",
    page_singular: "Seite",
    page_plural: "Seiten",
    no_issues_recorded: "Keine Probleme für dieses Audit verzeichnet.",
    no_issues_recorded_desc:
      "Die Website ist entweder in hervorragendem Zustand oder es liegen keine Beanstandungen vor.",
    render_javascript: "JavaScript rendern",
    max_pages: "Seitenlimit",
    lighthouse: "Lighthouse Performance",
    no_issues_found: "Keine Probleme gefunden.",
    last_audit: "Letztes Audit",
    in_progress: "Audit läuft...",
    completed: "Abgeschlossen",
    failed: "Fehlgeschlagen",
    crawl_depth: "Crawltiefe",
    response_time: "Antwortzeit",
    status_code: "Statuscode",
    word_count: "Wortanzahl",
  },
  ranks: {
    title: "Rank-Tracking",
    keyword: "Keyword",
    position: "Position",
    previous: "Vorher",
    change: "Veränderung",
    best: "Beste",
    location: "Standort",
    search_volume: "Suchvolumen",
    serp_features: "SERP-Features",
    last_checked: "Zuletzt geprüft",
    refresh: "Jetzt prüfen",
    add_keyword: "Keyword hinzufügen",
    no_keywords: "Noch keine Keywords hinterlegt.",
  },
  settings: {
    title: "Einstellungen",
    personal: "Persönlich",
    organization: "Organisation",
    sections: "Einstellungsbereiche",
    appearance: "Erscheinungsbild",
    theme: "Theme",
    language: "Sprache",
    language_desc: "Wähle deine bevorzugte Sprache für die Benutzeroberfläche.",
    about: "Über OpenSEO",
    version: "Version",
    analytics: "Produktanalyse",
    analytics_desc:
      "Teile anonymisierte Nutzungsdaten, um OpenSEO zu verbessern.",
    analytics_help: "Hilf mit, OpenSEO zu verbessern",
    analytics_enabled: "Analyse aktiviert",
    analytics_disabled: "Analyse deaktiviert",
    privacy_title: "Datenschutz und E-Mails",
    privacy_analytics: "Nutzungsanalyse",
    privacy_analytics_desc:
      "Teile Nutzungsdaten und Sitzungsaufzeichnungen, um OpenSEO zu verbessern.",
    privacy_analytics_label: "Nutzungsanalyse teilen",
    privacy_updates: "Produkt-Updates",
    privacy_updates_desc:
      "Gelegentliche E-Mails zu neuen Funktionen und Tipps. Jederzeit abbestellbar.",
    privacy_updates_label: "Produkt-Update-E-Mails erhalten",
    privacy_updates_error: "Wir konnten deine E-Mail-Auswahl nicht speichern.",
    connected_agents_title: "Verbundene Agenten",
    connected_agents_desc:
      "KI-Clients, die über OAuth bei OpenSEO angemeldet sind.",
    connected_agents_error: "Verbundene Agenten konnten nicht geladen werden.",
    connected_agents_empty: "Noch keine Agenten verbunden.",
    connected_agents_client: "Client",
    connected_agents_organization: "Organisation",
    connected_agents_connected: "Verbunden",
    connected_agents_actions: "Aktionen für",
    connected_agents_disconnect: "Trennen",
    connected_agents_disconnect_title: "„{name}“ trennen?",
    connected_agents_disconnect_confirm: "Trennen",
    connected_agents_disconnect_warning:
      "Der Agent muss sich erneut bei OpenSEO anmelden.",
    connected_agents_success: "Agent getrennt",
  },
  project_settings: {
    title: "Projekteinstellungen",
    sections: "Bereiche der Projekteinstellungen",
    tabs: {
      general: "Allgemein",
      integrations: "Integrationen",
    },
    general: {
      title: "Allgemein",
      name: "Name",
      name_required: "Gib einen Projektnamen ein.",
      scan_notice:
        "Das Hinzufügen deiner Website startet einen Scan von bis zu 50 Seiten mit JavaScript-Rendering. Das Rendering verbraucht dein Kontingent.",
      domain: "Domain",
      optional: "(optional)",
      market_help:
        "Keyword-, SERP- und Domain-Daten nutzen dieses Land und diese Sprache, sofern bei einer Abfrage nichts anderes angegeben ist.",
      save_changes: "Änderungen speichern",
      updated: "Projekt aktualisiert",
      error_loading: "Fehler beim Laden des Projekts",
      not_found: "Dieses Projekt wurde nicht gefunden.",
    },
    danger: {
      title: "Projekt archivieren",
      description:
        "Durch das Archivieren wird das Projekt aus deinem Workspace entfernt und das geplante Rank-Tracking gestoppt. Du kannst es später über die Projektseite wiederherstellen.",
      only_project: "Du kannst dein einziges Projekt nicht archivieren.",
      archive_button: "Projekt archivieren",
      confirm_button: "Ja, Projekt archivieren",
      archived: "Projekt archiviert",
    },
  },
  ai: {
    title: "Agenten-Einrichtung",
    description:
      "Die leistungsfähigste Art, OpenSEO zu nutzen, ist über den KI-Agenten, den du bereits verwendest. Einmal einrichten, danach einfach drauflos fragen.",
    tabs: {
      setup: "Agent einrichten",
      skills: "Skills",
    },
    setup: {
      title: "Agent einrichten",
      description:
        "Füge den Setup-Prompt in deinen Agenten ein, um OpenSEO zu verbinden und die SEO-Skills zu installieren. Er führt dich durch alle weiteren Schritte.",
      copy_button: "Setup-Prompt kopieren",
      copy_success: "Setup-Prompt kopiert",
      instructions: "Einrichtungsanleitung",
      coach_hint_prefix: "Sobald die Verbindung steht, bitte deinen Agenten, ",
      coach_hint_link: "SEO Coach",
      coach_hint_suffix: " zu nutzen, um die nächsten Schritte zu planen.",
    },
    update: {
      title: "Skills aktualisieren",
      description:
        "Bereits verbunden? Füge den Update-Prompt in deinen Agenten ein, um die neuesten OpenSEO-Skills zu erhalten – deine Verbindungseinstellungen und persönlichen Anpassungen bleiben erhalten.",
      copy_button: "Update-Prompt kopieren",
      copy_success: "Update-Prompt kopiert",
      instructions: "Update-Anleitung",
    },
    cloudflare_alert:
      "Diese Instanz befindet sich hinter Cloudflare Access. MCP-Clients können sich erst verbinden, wenn Managed OAuth in deiner Access-Anwendung aktiviert ist.",
    cloudflare_guide: "Anleitung",
    mcp_url_label: "MCP-Server-URL für diese Instanz:",
    mcp_url_copied: "MCP-URL kopiert",
    skills: {
      intro:
        "Der Setup-Prompt installiert diese Skills. Rufe sie namentlich auf, wenn du einen vollständigen Bericht statt einer kurzen Antwort wünschst.",
      "seo-coach":
        "Erklärt deinen aktuellen Stand und wählt den nächsten Schritt aus.",
      "seo-project-setup":
        "Speichert deine Ziele, Mitbewerber und wichtigsten Seiten als gemeinsamen Kontext.",
      "seo-audit":
        "Kompaktes Site-Audit, fokussiert auf eine konkrete Maßnahme für diese Woche.",
      "ai-visibility-audit":
        "Findet die wenigen Anpassungen mit den besten Chancen auf Erwähnung in KI-Antworten.",
      "ai-prompt-research":
        "Ermittelt, was Nutzer ChatGPT zu deinem Markt fragen und wer zitiert wird.",
      "keyword-research": "Findet Keyword-Chancen anhand weniger Startthemen.",
      "keyword-clustering":
        "Gruppiert Keywords nach Suchintention und ordnet sie Zielseiten zu.",
      "competitive-landscape":
        "Zeigt die Marktführer in deiner Branche und warum sie erfolgreich sind.",
      "competitor-analysis":
        "Analysiert Keywords, Inhalte und Backlinks eines einzelnen Mitbewerbers.",
      "link-prospecting":
        "Findet Backlink-Möglichkeiten und entwirft Kontaktaufnahmen.",
      "local-seo":
        "Prüft das Google Unternehmensprofil und die Sichtbarkeit in Google Maps.",
      "seo-report":
        "Speichert alle obigen Analysen als Bericht auf deiner Berichtsseite.",
    },
    panel: {
      description:
        "Füge diesen Prompt in deinen Agenten ein, um OpenSEO automatisch für dich zu konfigurieren.",
      plugin_title: "OpenSEO-Plugin",
      plugin_subtitle: "MCP-Verbindung + SEO-Skills",
      copy_button: "Setup-Prompt kopieren",
      copy_success: "Setup-Prompt kopiert",
      manual_setup: "Manuelle Einrichtung",
    },
    agent_list: {
      or_any_client: "oder jeder andere MCP-Client",
    },
    onboarding: {
      finish: "Fertigstellen",
      go_to_dashboard: "Zum Dashboard",
    },
  },
  dashboard: {
    title: "Dashboard",
    welcome: "Willkommen zurück",
    your_website: "Deine Website",
    tagline: "Suchsichtbarkeit, Backlinks und Website-Zustand auf einen Blick.",
    project_settings: "Projekteinstellungen",
    tabs: {
      overview: "Übersicht",
      keywords: "Keywords",
      backlinks: "Backlinks",
    },
    onboarding: {
      title: "Erste Schritte",
      description:
        "Analysiere Mitbewerber und Keywords, prüfe deine Website und verbinde deine Tools.",
      competitor_title: "Mitbewerber analysieren",
      competitor_desc:
        "Themen und Backlinks entdecken, von denen du lernen kannst.",
      keywords_title: "Keyword-Ideen finden",
      keywords_desc:
        "Starte mit einem Keyword und erfahre, wonach Nutzer suchen.",
      audit_title: "Website prüfen",
      audit_desc:
        "Prüfe auf defekte Links, fehlende Tags und Indexierungsprobleme.",
      mcp_title: "KI-Agenten verbinden",
      mcp_desc:
        "Nutze OpenSEO direkt in Claude oder deinem bevorzugten Agenten.",
      team_title: "Teammitglied einladen",
      team_desc: "Teile Projekte und Analysen mit deinem Team.",
      project_title: "Mehrere Websites verwalten?",
      project_desc:
        "Lege ein weiteres Projekt an oder lasse deinen Agenten Websites einrichten.",
      skip: "Vorerst überspringen",
      only_one_project: "Ich benötige nur ein Projekt",
      saved_for_later: "für später gemerkt",
      completed: "abgeschlossen",
      restore: "Wiederherstellen",
    },
    cards: {
      site_health: "Website-Zustand",
      find_holding_back: "Finde heraus, was deine Website bremst",
      scan_desc:
        "Prüfe bis zu 50 Seiten auf defekte Links, fehlende Titel und Seiten, die Google nicht indexieren kann.",
      scan_website: "Website scannen",
      starting_scan: "Scan startet...",
      add_website: "Website hinzufügen",
      view_progress: "Fortschritt anzeigen",
      review_issues: "Probleme prüfen",
      no_issues_found:
        "Keine Probleme gefunden – deine Website sieht gesund aus.",
      run_again: "Audit erneut ausführen, um Probleme zu sehen.",
      pages_checked: "Seiten geprüft",
      scan_not_finished:
        "Der letzte Scan wurde nicht abgeschlossen. Prüfe die Ergebnisse oder starte erneut.",
      gsc_title: "Google Search Console Leistung",
      gsc_view_insights: "GSC Insights ansehen →",
      last_28_days: "Letzte 28 Tage",
      metric: "Kennzahl",
      value: "Wert",
      change: "Veränderung",
      clicks: "Klicks",
      impressions: "Impressionen",
      ctr: "Klickrate (CTR)",
      avg_position: "Durchschnittliche Position",
      gsc_error:
        "Search-Console-Daten konnten nicht geladen werden. Bitte versuche es gleich erneut.",
      new_keywords_title: "Neue Keywords",
      new_keywords_about: "Über neue Keywords",
      new_keywords_desc:
        "Suchanfragen, bei denen deine Website kürzlich auf Google erschienen ist.",
      new_keywords_detail:
        "In der letzten Woche der Search Console Daten gefunden, aber nicht in den vier Wochen davor.",
      view_all: "Alle ansehen →",
      keyword: "Keyword",
      no_new_keywords: "Keine neuen Keywords diese Woche",
      no_search_data: "Noch keine Suchdaten vorhanden",
      existing_queries_note:
        "Bestehende Suchanfragen können weiterhin Klicks gewinnen. Sieh dir deren Leistung an.",
      no_search_reported:
        "Google hat noch keine Suchanfragen für deine Website gemeldet. Prüfe deine Property in Search Console.",
      view_full_gsc: "Vollständige GSC Insights ansehen →",
      new_backlinks_title: "Neue Backlinks",
      new_backlinks_about: "Über neue Backlinks",
      new_backlinks_desc:
        "Links zu deiner Website, die in der letzten Woche gefunden wurden.",
      referring_domain: "Verweisende Domain",
      referring_page: "Verweisende Seite",
      anchor: "Ankertext",
      backlinks: "Backlinks",
      no_new_links: "Keine neuen Backlinks diese Woche",
      explore_existing_links:
        "Entdecke die Websites, die bereits auf dich verlinken.",
      view_backlinks: "Backlinks ansehen →",
      see_who_links: "Erfahre, wer auf deine Website verlinkt",
      add_website_backlinks_desc:
        "Füge deine Website hinzu, um neue und verlorene Backlinks zu beobachten.",
    },
    quick_stats: "Schnellübersicht",
    audit_score: "Audit-Gesundheit",
    tracked_keywords: "Beobachtete Keywords",
    top_rankings: "Top-10 Platzierungen",
    recent_issues: "Dringende Audit-Probleme",
  },
  umami: umamiDe,
};

type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends object ? DeepStringRecord<T[K]> : string;
};

export type TranslationDict = DeepStringRecord<typeof de>;
