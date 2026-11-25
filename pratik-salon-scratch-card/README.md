# Pratik Salon Scratch Card

This folder contains the source for the Vercel-hosted frontend connected to the existing Wix Headless scratch-card site.

## Live sites
- Vercel production: https://pratik-salon-scratch-card.vercel.app
- Wix Headless source and Forms backend: https://headless-setemtnnipu-rushigadekar142-140f.wix-site-host.com

## Architecture
- Wix: existing site, Wix Forms app, form schema, and form submissions.
- GitHub: source control in this folder.
- Vercel: production static hosting.
- Wix JS modules are reverse-proxied from the existing Wix Headless site using `vercel.json`.

## Important launch limitation
The existing scratch-card allocation is currently browser-side and uses localStorage. It is suitable for a demonstration/pilot, but it does **not** provide server-enforced one-time mobile-number redemption or tamper-proof prize allocation. Do not use it as a fraud-resistant promotion until a persistent server-side prize ledger and validation endpoint are connected.

## Deployment status
The Vercel production deployment was created directly from the GitHub source files. Automatic GitHub-to-Vercel deployment is not enabled because the Vercel GitHub integration is not installed for this team. The production site is live; future GitHub commits will not deploy automatically until that integration is installed and linked.
