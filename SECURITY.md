# Great Fitness Plan — security policy

This repository should be **Private**. It is intentionally not a public website.

## Deployment

- Cloudflare Worker: `piggy-fitness-plan`.
- `src/index.js` imports the HTML GUI as a text module and **does not use Static Assets**. This ensures `ctx.access` is available to the Worker with Worker-level Access.
- Cloudflare Access must be enabled for the entire Worker (production and previews) with an **Allow policy for exactly two verified email addresses**. No everyone/email-domain allow rules or bypass policies.
- The Worker deliberately responds 403 when the platform Access identity is absent. Keep `workers.dev` and preview URLs **disabled** until Access and both user logins have been verified.
- Notion credentials are Worker **Runtime Secrets** only: `NOTION_TOKEN` and `APP_PASSWORD`. Never commit actual values.
- This Worker enforces a second bearer password, Content Security Policy, browser security headers, request origin checks, and a 10 KB streaming JSON cap.

## Security limitations

- The Access service must be initialized by the account owner in Cloudflare Zero Trust and configured with the two authorized emails.
- Shared `APP_PASSWORD` is stored in browser `sessionStorage` per tab and should be a long random unique secret. Rotate if previously reused or exposed.
- Cloudflare Access policies provide the primary brute-force boundary. The secondary password does **not** have a distributed rate limiter yet.
- InBody readings are stored in Notion and locally in the browser; users should export CSV backups. Do not store secrets in localStorage.
- Review security after any redeploy; do not deploy older versions that omit the Access fail-closed guard.
- GitHub Private does not undo any past clone or fork of the previously public repository; rotate any credentials found in git history.

## Checklist before re-enabling routes

1. [ ] Repository changed to Private and verified.
2. [ ] Cloudflare Zero Trust enabled.
3. [ ] Worker-level Access policy limits entry to only the two named email addresses.
4. [ ] Unauthenticated requests fail (403/Access login); both authorized iPhones can log in.
5. [ ] Notion read/write and cross-device synchronization verified with test records.
6. [ ] Runtime Secrets confirmed present, no credentials in GitHub history.
7. [ ] Enable the production `workers.dev` hostname (previews can remain disabled).
