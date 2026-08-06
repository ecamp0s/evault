# API de eVault: PHP-FPM 8.4 con Laravel 13. Ver ADR-012.
#
# No copia el código: el compose lo monta desde el clon, de modo que un cambio en
# api/ se ve sin reconstruir nada. Lo que la imagen aporta es el runtime con sus
# extensiones, que es lo que cuesta montar a mano.
FROM php:8.4-fpm

# git y unzip los usa Composer para resolver paquetes; libicu para intl.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        unzip \
        libicu-dev \
        libzip-dev \
    && rm -rf /var/lib/apt/lists/*

# pdo_mysql es la que hace falta de verdad; bcmath y zip las dan por supuestas
# Laravel y Composer respectivamente. El resto ya vienen en la imagen oficial.
RUN docker-php-ext-install -j"$(nproc)" pdo_mysql bcmath zip intl

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Espera a la base de datos, prepara .env y APP_KEY, migra y arranca. Ver el
# propio script: cada paso explica por qué está.
COPY docker/api/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

WORKDIR /var/www/html

ENTRYPOINT ["entrypoint"]
CMD ["php-fpm"]
