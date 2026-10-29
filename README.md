# CairnGPS website

Landing page for [CairnGPS](https://github.com/MatthieuTinnes/CairnGPS), the Android app for
real-time GPS/GNSS data, track recording and achievements. Live at
<https://cairngps.matthieu.app>.

Static bilingual (French / English) site in vanilla HTML / CSS / JavaScript. No dependency, no
build step, no external resource: fonts and store badges are hosted with the site. The only
exception is the Umami analytics script (self-hosted on `umami.matthieu.app`, cookie-less),
loaded with `defer` in `fr/index.html` and `en/index.html`; the site works without it.
`data-domains` limits tracking to the production domain, so local previews are not counted.

## Contents

```
index.html          Redirects to /fr/ or /en/ (remembered choice, otherwise the browser language)
fr/index.html       French page
en/index.html       English page
404.html            Not found page (bilingual)
assets/css/         styles.css
assets/js/          globe.js (3D globe in the hero), site.js (remembers the language)
assets/fonts/       Fraunces, Manrope, Roboto Mono as woff2 (see LICENSES.md)
assets/img/         Icon, social preview image, official badges, fr/ and en/ screenshots
assets/data/        world_land.txt: Natural Earth 1:110m landmasses, the same file as the app
nginx/default.conf  nginx configuration of the image (gzip, caching, 404)
```

Both pages share the same structure: any content change goes into `fr/index.html` **and**
`en/index.html`.

`globe.js` is a port of the app's globe (`SatelliteGlobeScreen.kt` / `GlobeRendering.kt`): same
orthographic projection, same gestures (drag to rotate, pinch or ctrl + wheel to zoom, tap a
satellite to show its details) and same drawing rules. The sky is the app's demo-mode sky
(`DemoGpsSource.kt`), refreshed once a second; only the satellites used in the fix are shown.
Changes to the globe in the app should be carried over here.

Screenshots come from the app (1080 × 2400, unframed): `assets/img/screens/<lang>/<n>.png`, in
this order: Position, Satellites, 3D globe, Achievements, Track detail, Compass, Logbook.

## Running the site

Serve the folder (the globe loads `world_land.txt` with `fetch`, which doesn't work over
`file://`):

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deployment

The site is served with Docker (nginx) behind Traefik, on `cairngps.matthieu.app`.

Every commit on `main` triggers `.github/workflows/deploy.yml`: the image is built and pushed
to GHCR (`ghcr.io/matthieutinnes/cairngps-website`, tags `latest` and `main-<sha>`), then CI
calls the signed webhook of the Komodo stack `cairngps-website`, which fetches
`deploy/docker-compose.yml` from `main`, pulls the image and restarts the container. No version
tag, no preprod.

GitHub secrets expected in the `prod` environment: `KOMODO_HOST`, `KOMODO_WEBHOOK_SECRET`
(and, optionally, `GOTIFY_HOST` / `GOTIFY_TOKEN` for the notification). The Komodo stack is
configured outside this repository; its variables are documented in `deploy/.env.example`.

To redeploy without a new commit, or for the very first deployment: run the "Build & Deploy"
workflow manually (Actions → Run workflow). To roll back to a previous build: set
`IMAGE_TAG=main-<sha>` in the Komodo stack environment, then Deploy.

Local preview of the production build:

```bash
docker compose up --build
```

Then open <http://localhost:8080>.

Whenever `styles.css`, `globe.js` or `site.js` changes, bump the `?v=` parameter of the
matching tags in `fr/index.html`, `en/index.html` (and `404.html` for the stylesheet) so
browsers fetch the new version.

## License and credits

The site's code is licensed under [AGPL-3.0](LICENSE), like the app.

- Fonts: Fraunces and Manrope (SIL Open Font License 1.1), Roboto Mono (Apache 2.0).
- Landmasses: [Natural Earth](https://www.naturalearthdata.com/), public domain.
- Badges: Google Play is a trademark of Google LLC; F-Droid badge from
  [fdroid/artwork](https://gitlab.com/fdroid/artwork).
