# SPA de eVault servida por Caddy, que además hace de frontal de la API. Ver ADR-012.
#
# Aquí SÍ se copia el código y se construye dentro, al revés que en la imagen de la
# API, y no es una inconsistencia: Vite sustituye import.meta.env en tiempo de build,
# así que la URL de la API y la CSP quedan escritas dentro del JavaScript generado.
# El artefacto es específico de este despliegue. Cambiar VITE_API_URL obliga a
# reconstruir, y por eso es un ARG y no una variable de entorno del contenedor.

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

ARG API_HOST
ARG API_SCHEME=http
ARG HTTP_PORT=80

# La URL se compone aquí y no llega hecha desde el compose porque hay que aplicar
# una regla que compose no sabe expresar, la misma que aplica el entrypoint de la
# API para CORS: EL ORIGEN LLEVA PUERTO SALVO QUE SEA EL ESTÁNDAR DE SU ESQUEMA
# —80 para http, 443 para https—. Un origen mal compuesto no rompe de forma
# visible: la SPA carga y solo falla al hablar con la API.
#
# Aquí decide además el `connect-src` de la CSP, que se genera en este build, así
# que equivocarse bloquea las peticiones por dos vías distintas a la vez.
#
# Falla pronto y con un motivo legible: sin API_HOST, la SPA se construiría sin
# saber adónde hablar y el error aparecería en el navegador de quien la abra.
RUN test -n "$API_HOST" || (echo "ERROR: falta el argumento de build API_HOST" >&2 && exit 1) && \
    if { [ "$API_SCHEME" = "http" ] && [ "$HTTP_PORT" = "80" ]; } || \
       { [ "$API_SCHEME" = "https" ] && [ "$HTTP_PORT" = "443" ]; }; then \
        VITE_API_URL="${API_SCHEME}://${API_HOST}/api"; \
    else \
        VITE_API_URL="${API_SCHEME}://${API_HOST}:${HTTP_PORT}/api"; \
    fi && \
    echo "construyendo la SPA contra $VITE_API_URL" && \
    VITE_API_URL="$VITE_API_URL" npm run build


FROM caddy:2-alpine

COPY --from=build /app/dist /srv
COPY docker/web/Caddyfile /etc/caddy/Caddyfile
