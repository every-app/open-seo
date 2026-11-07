---
title: "Search Console and Analytics"
description: "Connect Google Search Console and Google Analytics 4 to a project, change or remove the connection, and read the data in the app or from your agent."
---

Connect Google Search Console to see the clicks, impressions and positions Google measured for your site. Connect Google Analytics 4 to see your organic traffic. Both are read-only, and neither uses credits.

## Connect a project

1. In your project, open **Project settings**. The gear next to the project name and the button on the project dashboard both open it.
2. Choose the **Integrations** tab.
3. On the **Google Search Console** or **Google Analytics** card, click **Connect**.
4. Pick your Google account and allow access on Google's screens. Leave every permission box checked.
5. Back in OpenSEO, choose your site or property and click **Save property**.

Search Console and Analytics connect separately, so repeat the steps for the other one. On hosted OpenSEO there's no Google Cloud project to set up.

Each project connects to one Search Console site and one Analytics property. Once your Google account is linked, you can pick its sites and properties for your other projects without signing in to Google again.

The connection uses the Google account of whoever connected it, and the card shows that account's email. Everyone in your organization sees the data. If that person leaves the organization, the connection is removed and someone else needs to connect it again.

Owners and admins can connect, change and disconnect projects. See [Teams](/docs/teams).

## Change or remove a connection

- **Change property or account:** pick a different site or property, or click **Add Google account** to use another Google account.
- **Disconnect project:** removes the connection from this project only. It happens straight away, with no confirmation.
- **Remove a Google account:** open the account list and click **Remove**. This disconnects that account from every project you connected with it, and the dialog lists how many.

## If your site isn't listed

- **"We couldn't find your website"** means the Google account you chose can't see the site in Search Console. Add the site to Search Console, ask whoever manages it to give your account access, or click **Use a different Google account**.
- **A Search Console property you can't select** needs Full access or verified ownership. Ask the property's owner to give your account Full access, or verify ownership yourself in Search Console.
- **"Search Console connection is missing a permission"** (or the same for Google Analytics) means a box was unchecked on Google's permission screen. Connect again and check every box.
- **"Connection expired"** next to an account means Google signed you out. Click **Reconnect**.

For a walkthrough of adding and verifying a site in Search Console, see [How to Set Up Google Search Console](/blogs/google-search-console-setup).

## Search Console data in the app

Open **GSC Insights** in the project sidebar, under My Site.

- **Date range:** last 7 days, 28 days (the default) or 3 months. Search Console data runs about 3 days behind, so ranges end 3 days ago.
- **Search type:** Web search, Discover or Google News. Discover and Google News show pages only; Google reports no queries or positions for them.
- **Device and country:** narrow everything on the page to one device or country.
- **Totals:** clicks, impressions, click-through rate and average position, each compared with the period before.
- **Striking distance:** queries where your best page ranks 5th to 20th, sorted by impressions, up to 100. These are often the quickest wins. Select rows to **Copy keywords**, **Save as keywords** or **Track rankings**.
- **Queries** and **Pages** show clicks, impressions, click-through rate and position for each query or page.

Click **Filters** to filter by **Page URL** or **Query**. **Contains** ignores case and matches anywhere in the text, so `/blog/` matches a whole folder. **Exactly matches** compares the full URL or query, including case. Filters change the totals, striking distance, tables and exports.

**Export** sends the Queries or Pages table to Google Sheets or a CSV file, up to 1,000 rows.

## Google Analytics data in the app

The **Google Analytics** card on the project dashboard shows organic search over the last 28 days: sessions, active users, engagement rate and key events, with a sessions chart. For anything more detailed, ask your agent.

## Use your assistant

With [OpenSEO MCP](/docs/mcp) connected, your agent can read both, with no credits:

- **Search Console:** performance by query, page, country, device or date, for web, image, video, news and Discover search, up to 16 months back. It can also check whether specific URLs are indexed, up to 10 at a time.
- **Analytics:** organic overview, landing pages, page performance, key events, traffic acquisition, ecommerce, site search, audience and measurement health.
- **Both together:** pages ranking 4th to 20th in Search Console, with what their visitors did in Analytics.

Your agent can list the sites and properties your Google accounts can see and choose one for a project. Linking a Google account still happens in the app.

To get a Search Console summary by email every week, see [Get a Weekly SEO Report Without Building Anything](/blogs/weekly-seo-report).

## Self-hosting

Self-hosted OpenSEO connects to Google through your own Google Cloud OAuth client. Follow the setup guides on GitHub:

- [Google Search Console](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md)
- [Google Analytics](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_GOOGLE_ANALYTICS.md)
