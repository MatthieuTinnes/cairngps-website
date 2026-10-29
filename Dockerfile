FROM nginx:alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY index.html 404.html favicon.ico robots.txt sitemap.xml site.webmanifest /usr/share/nginx/html/
COPY fr /usr/share/nginx/html/fr
COPY en /usr/share/nginx/html/en
COPY assets /usr/share/nginx/html/assets
