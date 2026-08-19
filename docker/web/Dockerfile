# SPA de eVault servida por Caddy, que además hace de frontal de la API. Ver ADR-012
# y ADR-016.
#
# Aquí SÍ se copia el código y se construye dentro, al revés que en la imagen de la
# API, porque la SPA necesita un paso de build y la API no.
#
# EL ARTEFACTO YA NO ES ESPECÍFICO DE UN DESPLIEGUE, y eso cambió en el issue #296.
# Antes este build recibía API_HOST, API_SCHEME y HTTP_PORT para componer la URL de
# la API, que Vite horneaba dentro del JavaScript: un `dist/` solo servía al hostname
# con el que se construyó. Desde ADR-016 la SPA pide `/api` relativo, así que el
# mismo `dist/` funciona servido desde cualquier nombre — que es justo lo que hacía
# falta para que la vault responda por `evault.local` y por el nombre de la tailnet
# a la vez.

FROM node:24-alpine AS build

WORKDIR /app

# Primero el manifiesto y el lockfile: mientras no cambien, la capa de dependencias
# se reutiliza y un cambio en src/ no reinstala nada.
# El .npmrc va con ellos, y no es cosmético: lleva `engine-strict`, así que sin él
# `npm ci` aquí dentro no comprobaría la versión de Node. Hoy la imagen base la fija
# el FROM de arriba y cumple, pero bajarla dejaría de fallar y pasaría a construir un
# bundle con un runtime que el proyecto no soporta. Ver #255.
COPY web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci

COPY web/ ./

# Sin ningún argumento de build, y esa ausencia es la propiedad que se buscaba: no
# hay nada que pasarle porque no hay nada específico del despliegue que hornear.
RUN npm run build


FROM caddy:2-alpine

COPY --from=build /app/dist /srv
COPY docker/web/Caddyfile /etc/caddy/Caddyfile
