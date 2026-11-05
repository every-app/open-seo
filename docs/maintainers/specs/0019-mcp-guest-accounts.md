# Guest accounts for MCP connections

When someone adds OpenSEO to an AI app (Claude, ChatGPT, Claude Code, Cursor) and the browser that opens has no OpenSEO session, they get a guest account instead of a sign-up form. The window closes on its own and the agent can use OpenSEO right away. The person creates a real account only when they want something a guest can't have.

## How it works

The MCP authorize step checks whether the browser qualifies for a guest. If it does, the browser goes to a short "Connecting OpenSEO" page instead of the sign-in page. That page passes Cloudflare Turnstile and asks the server for a guest. The server runs every check again, creates the guest, approves the connection, and sends the browser back to the AI app. When a check fails, the person lands on the normal sign-in page. A browser that already has an OpenSEO session still sees the consent screen, because approving a real account without a click would let any app take it over silently.

A guest is a user with a placeholder email on a reserved domain that can never receive mail, plus its own organization. The organization starts on the free plan like any new account, so a guest has the same free credits. Email sends skip the placeholder address.

A browser qualifies when:

- the deployment is the hosted app, and the kill switch (a feature flag) is off;
- the authorization code goes to a known AI chat app or back to the person's own computer (a loopback address or an app's own URL scheme). Without a click, any other destination would let a website send its visitors through our authorize URL and collect a free account from each one;
- the request doesn't come from a large cloud or hosting provider's network;
- the IP address has made fewer than two guests, ever. Only a keyed hash of the address is stored.

## Becoming a real account

A guest can't add credits, connect Google Search Console or Google Analytics, or use the web app. When the agent hits one of those (the out-of-credits error, `whoami`, a Search Console connect link), the response gives a link that creates the account. The server instructions also tell the agent it's working with a guest.

The link carries a random claim token. Opening it signed out stores the token in a cookie and opens the sign-up page, which also offers sign-in. At the next sign-in from that browser, before the default organization would be created, the guest's organization moves to the signing-in user and the guest user is deleted. A new user ends up with exactly the guest's organization, projects and remaining credits, not a second empty one with fresh free credits. An existing user gains it as another organization. Opening the link while signed in claims it at once. The billing customer's email switches to the real account's address.

Deleting the guest invalidates its MCP connection, so the AI app asks the person to reconnect, now as their real account. The per-IP record outlives the claim, so claiming doesn't free a guest slot.

## Alternatives

- **No sign-in for some tools (lazy authentication).** Claude supports serving some tools anonymously and asking for sign-in only for others. Calls from Claude's web and desktop apps come from Anthropic's servers, so an anonymous call can't be tied to a person or a credit balance; the only option would be one shared pool anyone could drain.
- **A guest button on the sign-in page.** Still one click and a decision in a window people want to close. The automatic version removes both, and the "Already have an account? Sign in" link stays on the connecting page.
- **Better Auth's anonymous plugin.** It creates anonymous sessions in the browser and links them at sign-up. Guests here never need a browser session, and the plugin's public sign-in endpoint would have needed the same checks bolted on. The claim cookie gives the same handover with less surface.
- **Moving the guest's projects into the user's own organization.** Projects, connections and billing hang off the organization in many tables, so moving the membership is far simpler and keeps the credits where they were spent.
