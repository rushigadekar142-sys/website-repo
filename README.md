# Ekdant LeadDesk

Ekdant LeadDesk is a browser-based lead and contact management CRM for Ekdant Digital Marketing.

## Architecture

- Frontend: static HTML, CSS, and JavaScript modules.
- Authentication: Wix Headless OAuth, including Google sign-in with PKCE.
- Data backend: Wix CMS collections.
- Hosting: Vercel.
- Production URL: https://ekdant-leaddesk.vercel.app

## Source layout

- `index.html` — CRM application shell.
- `assets/app.js` — dashboard, contacts, projects, imports, filters, follow-ups, reports, and team UI.
- `assets/app.css`, `assets/auth.css` — application and authentication styles.
- `auth/callback.html` — OAuth callback page.
- `js/wix/` — Wix authentication, REST client, CMS item/collection, member, and media modules.
- `vercel.json` — response security headers and static hosting settings.

## Wix backend

The frontend uses the existing Wix Headless client and existing Wix CMS data. The main collections are:

- `EkdantProjects`
- `EkdantContacts`
- `EkdantActivity`

The Vercel production domain and exact OAuth callback URI are registered on the existing Wix Headless OAuth app:

- Allowed domain: `https://ekdant-leaddesk.vercel.app`
- Callback URI: `https://ekdant-leaddesk.vercel.app/auth/callback.html`

Do not commit Wix access tokens, refresh tokens, client secrets, or API keys. The OAuth client ID in the browser configuration is a public client identifier, not a secret.

## Deployment

The current production deployment is published on Vercel. GitHub-to-Vercel automatic deployment is not linked yet; deployments were uploaded directly to the existing Vercel project. Once the Vercel GitHub Login Connection is configured, connect this repository and enable deployments from `main`.

## Important security note

Project roles are currently enforced in the browser UI, while the existing Wix CMS collections allow site-member access. This is not server-side authorization. Before inviting external users or treating project-level Viewer/Editor roles as a security boundary, move authorization checks into a trusted backend and restrict direct collection access.
