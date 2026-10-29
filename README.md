# Site de CairnGPS

Site vitrine de [CairnGPS](https://github.com/MatthieuTinnes/CairnGPS), l'application Android
de données GPS/GNSS en temps réel, de traces et de succès. En ligne sur
<https://cairngps.matthieu.app>.

Site statique bilingue (français / anglais) en HTML / CSS / JavaScript vanilla. Aucune
dépendance, aucun build, aucune ressource externe : polices et badges des stores sont
hébergés avec le site. Seule exception : le script de statistiques Umami (auto-hébergé sur
`umami.matthieu.app`, sans cookie) chargé en `defer` dans `fr/index.html` et `en/index.html` ;
le site fonctionne sans lui. `data-domains` limite le comptage au domaine de prod, les aperçus
locaux ne sont donc pas comptés.

## Contenu

```
index.html          Redirige vers /fr/ ou /en/ (choix mémorisé, sinon langue du navigateur)
fr/index.html       Page française
en/index.html       Page anglaise
404.html            Page introuvable (bilingue)
assets/css/         styles.css
assets/js/          globe.js (globe 3D du haut de page), site.js (mémorise la langue)
assets/fonts/       Fraunces, Manrope, Roboto Mono en woff2 (voir LICENSES.md)
assets/img/         Icône, image de partage, badges officiels, captures d'écran fr/ et en/
assets/data/        world_land.txt : continents Natural Earth 1:110m, le même fichier que l'app
nginx/default.conf  Configuration nginx de l'image (gzip, cache, 404)
```

Les deux pages ont la même structure : toute modification de contenu se fait dans
`fr/index.html` **et** `en/index.html`.

Les captures viennent de l'app (1080 × 2400, sans cadre) : `assets/img/screens/<langue>/<n>.png`,
dans l'ordre Position, Satellites, Globe 3D, Succès, Détail d'une trace, Boussole, Carnet.

## Lancer le site

Servir le dossier (le globe charge `world_land.txt` en `fetch`, ce qui ne marche pas en
`file://`) :

```bash
python3 -m http.server 8000
```

Puis aller sur <http://localhost:8000>.

## Déploiement

Le site est servi via Docker (nginx) derrière Traefik, sur `cairngps.matthieu.app`.

Chaque commit sur `main` déclenche `.github/workflows/deploy.yml` : l'image est construite
et poussée sur GHCR (`ghcr.io/matthieutinnes/cairngps-website`, tags `latest` et
`main-<sha>`), puis la CI appelle le webhook signé de la stack Komodo `cairngps-website`,
qui récupère `deploy/docker-compose.yml` sur `main`, tire l'image et relance le conteneur.
Pas de tag de version, pas de preprod.

Secrets GitHub attendus dans l'environnement `prod` : `KOMODO_HOST`,
`KOMODO_WEBHOOK_SECRET` (et, facultatif, `GOTIFY_HOST` / `GOTIFY_TOKEN` pour la
notification). La stack Komodo est configurée hors de ce dépôt ; ses variables sont documentées dans
`deploy/.env.example`.

Pour redéployer sans nouveau commit, ou pour le tout premier déploiement : lancer
le workflow « Build & Deploy » à la main (Actions → Run workflow). Pour revenir à
un build précédent : mettre `IMAGE_TAG=main-<sha>` dans l'environnement de la
stack Komodo, puis Deploy.

Aperçu local du rendu final :

```bash
docker compose up --build
```

Puis aller sur <http://localhost:8080>.

À chaque modification de `styles.css`, `globe.js` ou `site.js`, incrémenter le paramètre
`?v=` des balises correspondantes dans `fr/index.html`, `en/index.html` (et `404.html`
pour la feuille de style) pour forcer les navigateurs à récupérer la nouvelle version.

## Licence et crédits

Code du site sous licence [AGPL-3.0](LICENSE), comme l'application.

- Polices : Fraunces et Manrope (SIL Open Font License 1.1), Roboto Mono (Apache 2.0).
- Continents : [Natural Earth](https://www.naturalearthdata.com/), domaine public.
- Badges : Google Play est une marque de Google LLC ; badge F-Droid issu de
  [fdroid/artwork](https://gitlab.com/fdroid/artwork).
