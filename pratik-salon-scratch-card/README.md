# Pratik Salon Scratch Card

This folder contains the Vercel-hosted frontend for the existing Wix Headless scratch-card site.

## Architecture
- Wix: existing site, Wix Forms app, form schema, and form submissions.
- GitHub: source control in this folder.
- Vercel: static frontend hosting and Git-connected deployments.
- Wix JS modules are reverse-proxied from the existing Wix Headless site using `vercel.json`.

## Important launch limitation
The existing scratch-card allocation is currently browser-side and uses localStorage. It is suitable for a demonstration/pilot, but it does **not** provide server-enforced one-time mobile-number redemption or tamper-proof prize allocation. Do not use it as a fraud-resistant promotion until a persistent server-side prize ledger and validation endpoint are connected.

## Deploy
Vercel project root directory: `pratik-salon-scratch-card`.
Production branch: `main`.
