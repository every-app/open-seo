---
name: customer-keywords
description: Finds the keywords and pages a site should target from who its ideal customer is and their search intent (what they're trying to get done when they search), using OpenSEO keyword and search result data. Works out the customer and intent from the site when the user doesn't name them. Use when the user describes who they want to reach, asks what their customers search for, or wants keywords based on their audience rather than their existing pages.
license: MIT
---

# Customer keywords

Start from the customer, not the site's pages: who they are and their search intent, what they're trying to get done when they search. Brainstorm what that person types, measure it, check that Google serves those searches to the same person, and group what's left into families, one page each. Needs the OpenSEO MCP server connected (https://openseo.so).

For keywords competitors rank for and the site doesn't, use `keyword-gap` instead.

## Inputs

- The user's site. Call `list_projects` and take the project whose `domain` matches, or `create_project` with the market below if there is none. Ask only if you have no website to work from.
- The customer and their search intent, such as "homeschoolers aged 17 to 20, or their parents", looking for "a college or an alternative to college". The same person searches for many things; the intent keeps the searches that lead to what the site offers. Use the user's if they gave them. If not, write them yourself from the site and `get_project_context`. Don't stop to ask; name them at the top of the report so the user can correct them.
- The market. Use the project's default unless the customer is clearly in another country.

If OpenSEO isn't connected, say so and stop. Don't estimate search volumes yourself.

## Steps

1. **Read the site and write the customer card.** Read the homepage and two or three pages that say who it's for, such as an FAQ or a product page. If the site blocks fetches, read its sitemap or search results limited to the site. Write one line on who the customer is, one on their search intent, and the words they use, which are rarely the site's. A site says "personalized degrees"; its customer types "colleges for homeschoolers". If the site serves several customers, take the one the user named or the one the homepage leads with.
2. **Brainstorm searches.** Write 20 to 30 searches this person would type with this intent: naming their situation, the problem or doubt behind it, the alternatives they weigh, comparisons, and questions. Write them as the customer, not from the site's pages.
3. **Measure them.** Call `get_keyword_metrics` with the list and `includeMonthlyTrends: false`. Anywhere from none to two thirds can come back with no row or no volume, more in a niche; that means no data, not no demand. If part of the intent has nothing measured, brainstorm once more for that part and measure again. Then call `research_keywords` once with three or four wildcard seeds built from the patterns that measured best, such as "colleges for _ students" or "cheap _ glasses". Wildcards usually return rows with volume, while plain seeds drift off topic ("alternatives to college" returned the electoral college); drop a seed whose rows come back without volume. Four seeds return about 90,000 characters, which arrives as a file to read with `jq`.
4. **Keep to the intent.** Keep keywords this customer would search with this intent. Note other audiences the research surfaces for "Other customers", and set aside other meanings of the word ("cheap wine glasses") and searches for a named competitor for "Skip these". Drop keywords with no volume unless a measured variant stands behind them.
5. **Group into families.** Put keywords that one page would answer together, name each family by the need, and lead with its highest-volume keyword. Close variants often share one volume ("cheap rx glasses" and "cheap prescription glasses" both 246,000): list them once and never add them up.
6. **Mark what the site has.** Call `get_search_console_performance` with `dimensions: ["query", "page"]`; if it says the site isn't connected, and the site has real traffic, call `get_domain_keyword_suggestions` on it instead (its top 100 keywords with positions, no URLs). Match those to families, and make a bigger keyword the lead where one turns up. For a small site, skip both; step 7 shows whether it appears.
7. **Check page one.** Call `get_serp_results` for each family's lead keyword, five per call (about 10,000 characters each). Read rows seen in two or three reads (`seenIn`) and quote `bestPosition` as a position; if few rows repeat, call page one unsettled. Confirm the results serve this customer and intent: a keyword can name the offer and belong to someone else ("montessori university" returns Montessori schools for young children; "alternatives to alcohol" returns kava and THC). Drop or relabel families that fail. "Near me" results change with the searcher's city, so mark those families local. Note who holds page one, naming rows with a null `domain` (usually forum threads) by their title. Every `url` is a Google redirect, so find the site's own pages by matching the result's title to its sitemap.

## Output

A report in this order, with a line or two of prose around each part:

- **The customer and search intent:** the card from step 1, marked "from you" or "inferred from the site".
- **Keyword families:** a table of family, lead keyword, monthly searches, difficulty, funnel stage (the tool's `intent`), who holds page one, the site's position or "not ranking", and the page: an existing URL, "rework <URL>", or "to create".
- **All keywords:** a table of keyword, monthly searches, difficulty, funnel stage and family, sorted by family.
- **Pages to create or rework:** three to five, best first by fit, then how open page one is, then volume. Give each its family, the format page one rewards, and what this customer needs that the current results miss.
- **Other customers:** audiences the research surfaced, each with a lead keyword and its volume.
- **Skip these:** keywords that looked right but don't fit, with one reason each: a different searcher, another meaning of the word, a named competitor, or a need the site can't meet.

Then offer to save the keywords with `save_keywords`, tagged `customer-keywords` and the family name, or to track the lead keywords with `create_rank_tracker` and `add_rank_tracking_keywords`. Do neither without a yes. If they want tracking, show the `estimate_rank_tracker_cost` figure before creating it, since scheduled tracking keeps spending credits.

## Notes

- A run is about 8 OpenSEO calls and 200 to 300 credits; three test runs used 737 together. Tell the user before going past 2,000 credits. If credits run out, report what you have and say what's missing.
- Volumes, difficulty and positions are estimates for one market. Write `unknown` for any value a tool didn't return, treat a difficulty of 0 or null as unknown, and don't report one check of page one as a fixed ranking.
