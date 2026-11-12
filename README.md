# Ekdant LeadDesk

Source archive synchronized from the deployed Wix Headless site.

## Project
- Frontend: static HTML, CSS and JavaScript
- Backend/data platform: Wix Headless APIs and Wix CMS
- Main application: `assets/app.js`
- Entry page: `index.html`
- Wix integration modules: `js/wix/`

## Source layout
- `assets/` — application and authentication styles/scripts
- `auth/` — authentication callback page
- `js/wix/` — Wix authentication, client, CMS collection, item, member and media modules

## Deployment notes
This repository is a source backup. It is not yet connected to a Vercel project. The application currently depends on Wix Headless authentication and CMS configuration; deploying the frontend elsewhere requires configuring the correct OAuth redirect URLs and environment-safe Wix client configuration.

## Security checklist before public deployment
- Review all source for secrets, private tokens and accidental personal data.
- Keep Wix CMS permissions and authorization enforced server-side; hiding UI controls is not an authorization boundary.
- Configure OAuth allowed origins and redirect URLs for the eventual deployment domain.
- Do not commit `.env` files, access tokens or private keys.

## Source provenance
The files were copied from the live Wix Headless deployment without changing the live Wix site.
