---
title: "How to Set Up Google Search Console"
description: "What Google Search Console is, why it matters for SEO, and how to set it up and connect it to OpenSEO."
author: "OpenSEO Team"
date: "2026-10-11"
---

Google Search Console is a free tool from Google that shows how your website performs in Google Search. This guide explains what it tells you, then walks you through setting it up and connecting it to OpenSEO.

## What Search Console tells you

Search Console shows Google's own data about your site:

- **Queries:** what people searched for before your site appeared.
- **Impressions:** how often your pages showed up in results.
- **Clicks:** how often people clicked through to your site.
- **Average position:** roughly where you rank for each query.
- **Indexing:** whether Google has added a page to its search results.

SEO tools estimate traffic from outside your site. Search Console reports what actually happened. [Google's overview](https://support.google.com/webmasters/answer/9128668) covers every report.

## Why connect it to OpenSEO

Keyword research tells you what to go after. Search Console tells you whether it worked. Once it's connected, your OpenSEO dashboard shows:

- **New keywords** your site has just started appearing for.
- **Top keywords** that bring you the most clicks.
- **Striking distance:** queries where you sit at positions 5–20, close enough that a better page can move you up.

Your AI agent can read the same data through OpenSEO, so you can ask it what's working and what to fix next.

Connecting is optional. Keyword research and competitor research work without it.

## Step 1: Check whether your site is already set up

1. Open [Search Console](https://search.google.com/search-console) and sign in.
2. Open the website menu in the top left. Google calls each website a **property**.
3. If your website is listed, note which Google account you're signed in with and skip to Step 3.

If a colleague, agency, or client already manages your site in Search Console, ask them to add you:

1. Select the website in Search Console.
2. Go to **Settings → Users and permissions → Add user**.
3. Enter your Google email address and choose **Full** permission.

See [Google's guide to users and permissions](https://support.google.com/webmasters/answer/7687615).

## Step 2: Add your website

If your site isn't in Search Console yet:

1. Open the website menu and click **Add property**.
2. Pick a property type:
   - **Domain** (`example.com`) covers your whole site, including `www` and other subdomains. You'll need access to your domain's DNS settings. Use this if you can.
   - **URL prefix** (`https://www.example.com/`) covers only that address. This is often easier if your website builder has a Search Console setting.
3. Prove you own the site:
   - **Domain:** Google gives you a TXT record. Add it in the DNS settings wherever you bought your domain, then click **Verify**. DNS changes can take a while, so if it fails, wait and try again.
   - **URL prefix:** pick one of Google's methods, such as pasting an HTML tag into your website builder.
4. Leave the verification record in place afterward. Google keeps checking it.

Google's guides: [add a property](https://support.google.com/webmasters/answer/34592) and [verify ownership](https://support.google.com/webmasters/answer/9008080).

## Step 3: Connect it to OpenSEO

1. Start the connection in OpenSEO. You'll find it during signup, on the Search Console card on your dashboard, or under **Project settings → Integrations**.
2. Sign in with the Google account that has access to your site.
3. Choose your website from the list and save.

## If your website doesn't show up

- **We couldn’t find your website:** the Google account you connected doesn't have access. Check the email address shown. Click **Use a different Google account**, or get access (Step 1) and click **Refresh**.
- **Connection expired:** reconnect your Google account.
- **Couldn't load properties:** a temporary error. Try again.

## When you'll see data

A newly added site can take a few days to show data in Search Console. You can keep using OpenSEO while you wait.
