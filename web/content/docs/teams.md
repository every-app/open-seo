---
title: "Teams"
description: "Invite teammates to your OpenSEO organization, what owners and admins can do, and what everyone shares."
---

Your OpenSEO account comes with an organization. Everyone you invite to it works in the same projects and spends from the same credits. There's no per-seat fee.

## What your team shares

- **Projects:** everything in a project, including saved keywords, rank tracking, site audits, AI visibility tracking, and reports.
- **Plan and credits:** one plan and one credit balance for the whole organization.
- **Google connections:** a project's Search Console or Analytics connection works for everyone, but it uses the Google account of whoever connected it. If that person leaves the organization, the connection is removed.

API keys and agent connections are personal. Each teammate connects their own agent.

For client work, keep one organization and add each client's site as its own project.

## Invite a teammate

1. Open **Settings** and choose the **Organization** tab.
2. Click **Invite teammate**.
3. Enter their email and click **Send invite**.

They get an email with a link that expires in 7 days. Teammates join as admins.

Pending invitations show in the Members list with their expiry date. Use the row's menu to **Resend invitation**, which sends the same link with a new expiry, or **Cancel invitation**.

If the email doesn't arrive, ask them to check spam and any quarantine their company's email filter uses, then resend it. You can send up to 50 invitation emails a day per organization.

## Accept an invitation

Open the link from the email and click **Accept invitation**. If you're signed out, choose **Create account** or **Sign in** first; you come back to the invitation afterwards.

The invitation only works for the email address it was sent to. If you're signed in with a different address, you see "Invitation unavailable"; choose **Use a different account** and sign in with the invited address.

## Roles

| Role  | What they can do                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner | Everything, including billing: the plan, buying credits, auto-reload, and invoices. Each organization has one owner.                                                  |
| Admin | Everything except billing: create, archive, and delete projects, delete audits, connect and disconnect Search Console and Analytics, and invite and remove teammates. |

Billing pages tell admins "Only the organization owner can change the plan or buy credits."

## Remove a teammate or transfer ownership

- **Remove member:** open the teammate's row menu in the Members list. They lose access straight away, their agents and API keys stop working in this organization, and Search Console and Analytics connections made with their Google account are disconnected.
- **Transfer ownership:** the owner can open an admin's row menu and choose **Transfer ownership**. The new owner manages billing, and you become an admin.

There's no button to leave an organization. Ask the owner or an admin to remove you.

## Switch organizations

If you belong to more than one organization, click your email at the bottom of the sidebar and pick one under **Organization**. OpenSEO remembers your choice the next time you sign in. You can't create extra organizations; you join them by invitation.

## Agents in an organization

An agent connection works in the organization that was active when you approved it. If you belong to more than one, the approval page has a **Workspace** picker. To use your agent in a different organization, connect it again and pick that one. API keys work in the organization that was active when you created them. See [Workspaces and revoking access](/docs/mcp#workspaces-and-revoking-access).

## Deleting your account

You can't delete your account while you own an organization that has other members. Transfer ownership or remove them first. An organization where you're the only member is deleted with your account, and its plan is cancelled.

## Self-hosting

- **Password sign-in** (the default for Docker and Cloudflare): invitations work, but no email is sent. OpenSEO copies the invitation link so you can send it yourself. People can't sign up without one.
- **Cloudflare Access:** everyone shares one organization, and there's no Organization tab. To add someone, add their email to `ACCESS_ALLOWED_EMAILS` and redeploy. See [Cloudflare](/docs/self-hosting/cloudflare).
