# Security policy

## Reporting a vulnerability

Email **security@openseo.so**. Do not open a public GitHub issue, discussion or pull request for a security problem.

## Scope

In scope:

- The code in this repository.
- The hosted service at app.openseo.so and the website at openseo.so.
- Self-hosted deployments running this code.

Out of scope:

- Third-party services OpenSEO calls (DataForSEO, Google, Autumn, OpenRouter and others). Report those to the vendor.
- Misconfiguration of a self-hosted deployment.
- Denial of service, load testing, and reports that only point out a missing rate limit.
- `local_noauth` mode has no login by design. Run it behind your own auth.

## What to include

- The affected URL, route, MCP tool or file.
- The account role and organization you used, and the deployment mode (hosted, `cloudflare_access` or `local_noauth`).
- Exact steps or requests to reproduce.
- What you were able to read, change or spend.

## What to expect

- We acknowledge reports within a few business days.
- We fix confirmed issues and credit you in the fix unless you ask us not to.
- There is no bug bounty program.

## Safe harbor

We will not take action against good-faith research that stays within this policy. That means:

- Use only accounts and data you own.
- Don't spend credits you didn't pay for.
- Don't drain the free tools' daily budget.

## Severity and full scope

The [threat model](.oss-scanner/threat_model.md) explains how we rate severity and lists the intended behaviors we do not treat as bugs.
