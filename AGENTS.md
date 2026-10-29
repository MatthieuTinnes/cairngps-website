# AGENTS.md

This file provides guidance to coding agents (Claude Code, Codex, OpenCode, Copilot…) when working
with code in this repository.

Static, bilingual (French / English) marketing site for the CairnGPS Android app, in vanilla
HTML / CSS / JavaScript: no dependency, no build step, no external resource — fonts and store
badges are self-hosted. The only exception is the self-hosted, cookie-less Umami tracker
(`umami.matthieu.app`) loaded with `defer` in both pages: the site works without it. The project context (contents,
local preview, deployment) is in the [README.md](README.md): read it first, and keep
it up to date when a change affects the structure, the conventions or the deployment.

## Conventions

- Code and code comments are in **English**, CI workflows included (comments, step names, error
  messages), and so is the README.
- `fr/index.html` and `en/index.html` share the same structure: a content or markup change goes
  into both, and their `hreflang` / canonical links stay in sync.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat: …`, `fix: …`,
  `chore: …`, `ci: …`), in English, lowercase imperative subject, no gitmoji. Pull request titles
  and descriptions are in English too.
- No framework, no package manager, no external CDN or font service: a change that would add a
  dependency or another third-party request needs to be discussed first.
- After editing `styles.css`, `globe.js` or `site.js`, bump the `?v=` parameter of the matching
  tag in both pages (and in `404.html` for the stylesheet) so browsers fetch the new version.
- Claims about the app (achievement count, constellations, features) must match the CairnGPS
  repository; don't invent figures.
- SEO metadata lives in each page's `<head>` (title, description, Open Graph, JSON-LD) and in
  `sitemap.xml`: a content change updates the matching metadata, the `FAQPage` JSON-LD stays
  word for word in sync with the visible FAQ, and the page's `<lastmod>` is bumped (README, SEO).

## Deployment

`main` is the only long-lived branch: PRs target `main`, and every commit on `main` is built and
deployed to prod (<https://cairngps.matthieu.app>) by `.github/workflows/deploy.yml` — no version
tag, no preprod. The workflow pushes the nginx image to GHCR, then triggers the signed webhook of
the Komodo stack `cairngps-website`, which pulls `deploy/docker-compose.yml` from `main` and
restarts the container.

`deploy/docker-compose.yml` is read by Komodo on the server: never edit it there. The root
`docker-compose.yml` is the local preview only.
