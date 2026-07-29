# Attendix — Microsoft Teams app package

This folder contains the Microsoft Teams **personal tab** app package for
Attendix. The tab embeds the live web app (`https://attendix.de/`) in an iframe;
users sign in with their existing Attendix (Supabase) credentials — there is no
Azure AD / SSO.

## Contents

| File | Purpose |
|------|---------|
| `manifest.json` | Teams app manifest (schema v1.19). |
| `color.png` | 192×192 full-color app icon. |
| `outline.png` | 32×32 transparent monochrome (white) icon for the Teams app rail. |

`color.png` and `outline.png` are generated from `src/assets/icon/favicon.png`.
Regenerate them with `npm run teams:icons` (see `scripts/teams-icons.mjs`).

> **Note on `outline.png`:** it is auto-derived by keying out the teal
> background and flattening the foreground to white. It reads well, but if the
> design team wants a hand-tuned silhouette, replace this file (keep it 32×32,
> transparent, monochrome white).

## Build the app package (.zip)

The uploadable package is just these three files zipped **at the root** (no
parent folder):

```bash
npm run teams:package      # produces teams/attendix-teams.zip
```

or manually, from this folder:

```bash
cd teams
zip -j attendix-teams.zip manifest.json color.png outline.png
```

## Install (internal org — no store submission)

1. Ensure your tenant allows custom app upload (Teams Admin Center →
   *Teams apps* → *Setup policies* → allow "Upload custom apps"). An admin may
   need to enable this.
2. In Teams: **Apps → Manage your apps → Upload an app → Upload a custom app**,
   then select `attendix-teams.zip`.
3. Add the **Attendix** personal tab and sign in with your Attendix account.

For org-wide rollout, upload the same zip in the Teams Admin Center under
*Teams apps → Manage apps → Upload new app*.

## Updating

- **App content** updates automatically: the tab loads `attendix.de` live, so
  any Vercel deploy is immediately reflected in Teams. (Native OTA / Capawesome
  Live Update does **not** apply to the Teams tab — it's web, not native.)
- **Manifest changes** (name, icons, id, domains) require bumping
  `manifest.json` `version` and re-uploading the zip.

## Requirements already satisfied

- HTTPS + custom domain (`attendix.de`) → listed in `validDomains`.
- Iframe framing: `vercel.json` sends
  `Content-Security-Policy: frame-ancestors ... teams.microsoft.com ...` so
  Teams is allowed to embed the app.
