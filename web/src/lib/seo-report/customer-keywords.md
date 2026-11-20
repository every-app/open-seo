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
4. **Keep to the intent.** Keep keywords this customer would search with this intent. Set aside the searches that belong to another audience, another meaning of the word ("cheap wine glasses") or a named competitor: the largest of them go under "Don't spend on these". Drop keywords with no volume unless a measured variant stands behind them.
5. **Group into families.** Put keywords that one page would answer together, name each family by the need, and lead with its highest-volume keyword. Close variants often share one volume ("cheap rx glasses" and "cheap prescription glasses" both 246,000): list them once and never add them up.
6. **Mark what the site has.** Call `get_search_console_performance` with `dimensions: ["query", "page"]`; if it says the site isn't connected, and the site has real traffic, call `get_domain_keyword_suggestions` on it instead (its top 100 keywords with positions, no URLs). Match those to families, and make a bigger keyword the lead where one turns up. For a small site, skip both; step 7 shows whether it appears.
7. **Check page one.** Call `get_serp_results` for each family's lead keyword, five per call (about 10,000 characters each). Read rows seen in two or three reads (`seenIn`) and quote `bestPosition` as a position; if few rows repeat, call page one unsettled. Confirm the results serve this customer and intent: a keyword can name the offer and belong to someone else ("montessori university" returns Montessori schools for young children; "alternatives to alcohol" returns kava and THC). Drop or relabel families that fail. "Near me" results change with the searcher's city, so mark those families local. Note who holds page one, naming rows with a null `domain` (usually forum threads) by their title. Every `url` is a Google redirect, so find the site's own pages by matching the result's title to its sitemap.

## Output

The report is a plan, then the data behind it. Its reader is busy, often a founder or an investor, and gives the first page a minute. Whoever reads only that page must know what to build and why it is worth it.

### The plan (`moves`)

A move is one page to build or rework for one keyword family. Hand in the three most worth doing, best first, and fewer when fewer are worth doing.

- Only a keyword that fits the customer and intent is a candidate.
- Among those, weigh searches against difficulty: the best move is the largest search the site could reach page one for in a few months. A difficulty under 30 is open. Over 50 takes links and time, so the search has to be several times larger to earn its place.
- A keyword under 100 searches a month is a move only when nothing larger fits.
- A keyword is a move only once step 7 has read its page one. Without that it is a guess.

The moves are drawn as cards on one page, each with its searches and difficulty beside it, so each line has a length to keep to:

- `action`: what to do, verb first, naming the page, in at most 12 words. "Rework the pricing page into a worked monthly bill".
- `page`: the address of the page to rework, or null for a new page.
- `keyword`, `searches`, `difficulty`: the family's lead keyword and its numbers. Null for a number the tool didn't return.
- `holders`: who is on page one now, in at most 25 words: up to three names with their positions ("Yelp #1, Suitsupply #2"), then the kind of page they are. If the site is in the results, say where.
- `steps`: the three steps that build the page, in the order to build it, or two when a third would be filler. They are drawn numbered. Each is one line of at most 13 words that starts with a verb and names one thing to make that page one lacks: "Add a table of ...", "Work out the bill for ...", "Record a walkthrough of ...". The first step is the piece that most sets the page apart from page one, and each later step builds on the one before. A step any page would need ("Publish the page", "Put the keyword in the title", "Add internal links") doesn't belong. Make each specific enough to start on today, with the specifics taken from the site's own pages. "Add clear pricing" names a kind of content and stops; "Work out the monthly bill for three apps and ten people, line by line" is a thing to make.
- `why`: at most 16 words on why this move sits where it does, for a reader comparing the numbers down the page. "Easiest page one in the plan, and the page exists." When a later move has more searches, say what outweighs them.

Write each move in its own words. If two read as one sentence with the nouns swapped, rewrite one.

### The verdict (`headline`), the site today (`standing`) and the customer (`customer`)

- `headline`: one sentence of at most 22 words that a reader could act on alone. It names the first move, the number that makes it worth doing, and what makes page one winnable. Every number in it is one of the moves' numbers.
- `standing`: one sentence of at most 25 words on where the site is in search today, from step 6 and the domain overview: its estimated visits a month from search, how many keywords it ranks for, and the best keyword it ranks for that names what it sells, with its position. Round the numbers ("about 190,000"). Give only what a lookup returned, and null when the lookups returned nothing to say.
- `customer`: who the plan assumes is searching and what they want, in at most 25 words, so the reader can correct it. It finishes the sentence "This plan assumes your customer is ...", so it starts in lower case with "a" or "an": "a technical founder who wants ...".

### The data (`markdown`)

Under a page, so it and the plan make two pages. Bullets and tables: no paragraph, and nothing between the title and the first section. These sections in this order, leaving out any with nothing to say:

1. `## Keywords for each page`: one table of every keyword worth working into a page. Columns: Page (the move's number and two or three words for it, or "Later"), Keyword, Searches a month (est.), Difficulty (est.). Sort by page, then by searches. At most 10 rows: the plan's keywords first, then the largest of the rest. List close variants once.
2. `## After the plan`: up to three families worth a page that didn't make the plan. One bullet of one sentence each: the lead keyword in bold, its searches and difficulty, then the one thing to do about it.
3. `## Don't spend on these`: up to three searches that would waste the reader's money: they look right and have real volume, and page one shows they belong to another searcher. One bullet of one sentence each: the keyword in bold, its searches, then who is searching. Leave out anything small or plainly off topic.

## Notes

- A run is about 8 OpenSEO calls and 200 to 300 credits; three test runs used 737 together. Tell the user before going past 2,000 credits. If credits run out, report what you have and say what's missing.
- Volumes, difficulty and positions are estimates for one market. Write `unknown` for any value a tool didn't return, treat a difficulty of 0 or null as unknown, and don't report one check of page one as a fixed ranking.
