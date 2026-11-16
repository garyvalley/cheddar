# Security

Cheddar holds people's financial data, so reports of security problems are
very welcome.

## Reporting a problem

Report it privately, never in a public issue:

- through GitHub's **Report a vulnerability** button on this repository's
  Security tab, or
- through the contact form on the running site, choosing "A security
  problem" (`/contact?topic=security`; the site's
  `/.well-known/security.txt` points there too).

Please say what you found, where, and how to see it happen. Don't look at,
change or keep anyone else's data, don't degrade the service for others, and
give us a reasonable time to fix it before telling anyone else.

## Scope

This repository's code (the Nuxt app, the PocketBase hooks and schema, the
nginx and Kubernetes configuration) and the site it deploys. Problems in
Plaid, Cloudflare, Mailjet or PocketBase themselves belong with those
projects.

## How Cheddar is protected

README.md and k8s/README.md describe the design: required two-step sign-in,
httpOnly session cookies, collection rules on every record, sealed bank-link
tokens with rotating keys, rate limits in nginx, locked-down pods and
encrypted backups.
