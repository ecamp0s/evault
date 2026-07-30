<?php

use App\Support\CorsOrigins;

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    /*
     * Los orígenes se leen de CORS_ALLOWED_ORIGINS, una lista separada por comas,
     * y no se escriben aquí: la API no puede asumir el dominio desde el que se la
     * consume, porque el mismo build tiene que servir al SaaS y a un despliegue
     * self-hosted. Ver ADR-005. El valor de desarrollo vive en .env.example.
     */
    'allowed_origins' => CorsOrigins::fromEnv(env('CORS_ALLOWED_ORIGINS')),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
