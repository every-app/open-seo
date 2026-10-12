# Website dashboard

The dashboard is the home for monitoring the current project's website. Research pages remain available for investigating other websites and exploring larger datasets.

## Views

The dashboard has addressable Overview, Keywords and Backlinks tabs. Opening a tab mounts its detail view; inactive views do not fetch their data. Rank tracking remains in its existing workflow and is omitted from the dashboard.

Overview keeps the existing onboarding checklist and completion rules. The checklist appears only on Overview.

Overview includes new search queries and recent link activity. New referring domains take precedence over new backlinks. When the provider reports no new domains, the card shows new backlinks; when neither exists, it offers a path to the full backlink view. Domain discovery dates identify newly observed referring sites, rather than assuming every recently discovered link comes from a new domain.

Keywords uses Search Console for New keywords, Top keywords and Striking distance. Top keywords sorts by clicks. Striking distance shows query/page pairs at average positions 5–20, sorted by impressions. A link opens full GSC Insights for deeper exploration. New keywords have at least ten impressions in seven completed days and no observations in the preceding 28 days. When the baseline reaches its row limit, each candidate is checked directly against the earlier period. The new view examines up to 25 candidates from the first 25,000 recent queries. Top keywords shows up to 25,000 queries from the last 28 days. The views display Google's average position over the relevant period, rather than a live rank. Keyword tables support text and metric filters, sorting and pagination. Google can omit some queries, so these views do not promise exhaustive coverage. Search Console results are saved and reused between visits. Paid provider snapshots remain available through research workflows.

Backlinks displays recently discovered links, recently checked lost links, and the latest live links, with up to 25 referring domains per view. Text, link type, domain rank and spam score filters refine loaded results. Date semantics and source details are available through an information popover.

Saving a website in the app starts its first 50-page audit with JavaScript rendering, subject to the account's audit capacity and rendering credits. Concurrent saves share one startup attempt. Existing audits are not restarted on later saves. A failed startup preserves the website and tells the user why the scan could not start. The overview Site health card links to Site Audit and shows the latest saved audit matching the project website, progress while running, and a manual scan action when no audit exists. Dashboard visits do not start audits.

The unconnected Google Analytics card first asks whether the user uses GA4. Yes opens the existing connection flow. No permanently dismisses the optional card for that project and suggests using another analytics provider's MCP with their agent. Connecting GA4 later restores the data card.

## Refresh behavior

Provider usage draws from the customer's credits. Link activity, backlink detail views and Search Console keyword views refresh after 24 hours. Refreshes happen on visits, with empty results cached too. Failed refreshes preserve saved data and delay another attempt. Concurrent refresh attempts share a claim. The overview does not request backlink totals.

Client and server cache identities include the relevant site, market or connected property. Changing project settings must not show a previous site's results as current.

## Alternatives

Fetching every view on entry would improve immediate tab switching but spend credits on data the customer never opens. Loading paid detail views on demand keeps the first visit lighter. Free Search Console discovery remains visible on Overview.

Scheduled refreshes would provide updates while customers are away. Visit-triggered refreshes fit this version because inactive projects do not need background updates. Alerts and scheduled digests can be evaluated separately.

Provider keyword snapshots alone cannot reliably identify newly acquired keywords. Search Console comparison gives stronger first-party evidence; source popovers acknowledge both datasets' limits.

A manual first audit would avoid starting work for an unintended site, but delay the first useful result. Automatically scanning a newly saved website shortens that wait. JavaScript rendering makes the initial scan useful for sites whose content depends on scripts.

A complete replacement of audit and performance workflows would duplicate existing capabilities. The dashboard reuses their data and offers direct paths to the full tools.
