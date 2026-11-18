# Guest accounts for MCP connections

When someone adds OpenSEO to an AI app (Claude, ChatGPT, Claude Code, Cursor) and the browser that opens has no OpenSEO session, they get a guest account instead of a sign-up form. The window closes on its own and the agent can use OpenSEO right away. The person creates a real account only when they want something a guest can't have.

## How it works

The MCP authorize step checks whether the browser qualifies for a guest. If it does, the browser goes to a short "Connecting OpenSEO" page instead of the sign-in page. That page passes Cloudflare Turnstile and asks the server for a guest. The server runs every check again, creates the guest, approves the connection, and sends the browser back to the AI app. When a check fails, the person lands on the normal sign-in page. A browser that already has an OpenSEO session still sees the consent screen, because approving a real account without a click would let any app take it over silently.

A guest is a user with a placeholder email on a reserved domain that can never receive mail, plus its own organization. The organization starts on the free plan like any new account, so a guest has the same free credits. Email sends skip the placeholder address.

A browser qualifies when:

- the deployment is the hosted app, and the kill switch (a feature flag) is off;
- the authorization code goes to a known AI chat app or back to the person's own computer (a loopback address or an app's own URL scheme). Without a click, any other destination would let a website send its visitors through our authorize URL and collect a free account from each one;
- the request doesn't come from a large cloud or hosting provider's network;
- the browser has never signed in to a real account. A sign-in leaves a long-lived cookie, so someone whose session lapsed gets the sign-in page instead of an empty guest workspace;
- the IP address has made fewer than two guests, ever. Only a keyed hash of the address is stored.

## Becoming a real account

A guest can't add credits, connect Google Search Console or Google Analytics, or use the web app. When the agent hits one of those (the out-of-credits error, `whoami`, a Search Console connect link), the response gives a sign-up link and says to open it in the browser that connected OpenSEO. The server instructions also tell the agent it's working with a guest.

The connecting page leaves a claim cookie in the browser, holding a random token that names the guest. At the next sign-up or sign-in from that browser, before the default organization would be created, the guest's organization moves to the signing-in user, the claim is recorded, and the guest user is deleted. A new user ends up with exactly the guest's organization, projects and remaining credits, not a second empty one with fresh free credits. An existing user gains it as another organization but stays in their own, which holds their plan; a new user opens the guest's. A link into the guest's organization, such as an audit the agent ran, opens that organization, as any link to a project in another of the user's organizations does. The billing customer's email switches to the real account's address.

The agent's connection keeps working. Its token still names the guest, and each MCP request from a claimed guest's token acts as the account that claimed it, in the same organization. That connection appears under the account's connected agents, where it can be revoked, and deleting the account revokes it. The per-IP record outlives the claim, so claiming doesn't free a guest slot.

Only the connecting page sets the claim cookie. Because a claim hands over the agent's connection, a claim must come from the browser that connected the agent: a claim link that anyone could send would let its sender's agent act as whoever opened it. The cost is that someone who connects on one device and signs up on another doesn't bring the guest's work along; they start a fresh account and reconnect. On a shared computer, the next person to sign in within the cookie's 30 days claims the guest; the guest was made in that browser, and the connection can be revoked.

## Alternatives

- **No sign-in for some tools (lazy authentication).** Claude supports serving some tools anonymously and asking for sign-in only for others. Calls from Claude's web and desktop apps come from Anthropic's servers, so an anonymous call can't be tied to a person or a credit balance; the only option would be one shared pool anyone could drain.
- **A guest button on the sign-in page.** Still one click and a decision in a window people want to close. The automatic version removes both, and the "Already have an account? Sign in" link stays on the connecting page.
- **Better Auth's anonymous plugin.** It creates anonymous sessions in the browser and links them at sign-up. Guests here never need a browser session, and the plugin's public sign-in endpoint would have needed the same checks bolted on. The claim cookie gives the same handover with less surface.
- **A claim link.** An earlier version handed the agent a link carrying the claim token, which set the cookie in whatever browser opened it. It covered people who sign up on another device, but once a claim also hands over the agent's connection, a link someone else sends is a way into the opener's account.
- **Asking the person to reconnect after a claim.** Deleting the guest's token is simpler, but the person has to find the connector in their AI app's settings and connect again, and the agent fails until they do.
- **Moving the guest's projects into the user's own organization.** Projects, connections and billing hang off the organization in many tables, so moving the membership is far simpler and keeps the credits where they were spent.
