<?php

declare(strict_types=1);

/*
 * Límites de intentos sobre los endpoints de autenticación.
 *
 * Viven en un fichero de config y no leyendo env() desde el service provider
 * porque env() solo funciona antes de que la configuración se cachee: con
 * config:cache, una llamada a env() fuera de config/ devuelve null en producción.
 *
 * Los valores por defecto son deliberadamente conservadores. Ver ADR-005: todo
 * valor de entorno tiene un default sensato para que un clon nuevo arranque.
 */

return [

    /*
     * Login. La cuenta va por combinación de IP y correo, así que estos intentos
     * son por cuenta atacada y no por atacante. Cinco por minuto deja sitio de
     * sobra a quien se equivoca de verdad y arruina la fuerza bruta.
     */
    'login' => [
        'intentos' => (int) env('THROTTLE_LOGIN_INTENTOS', 5),
        'minutos' => (int) env('THROTTLE_LOGIN_MINUTOS', 1),
    ],

    /*
     * Registro. Aquí la cuenta va solo por IP: si incluyera el correo, bastaría
     * con cambiarlo en cada petición para no tocar nunca el límite, que es
     * justo lo que hace quien crea cuentas en masa.
     *
     * La ventana es de una hora porque registrarse es algo que se hace una vez.
     * El riesgo conocido es una IP compartida por mucha gente, una oficina detrás
     * de NAT; diez altas por hora deja margen para eso.
     */
    'registro' => [
        'intentos' => (int) env('THROTTLE_REGISTRO_INTENTOS', 10),
        'minutos' => (int) env('THROTTLE_REGISTRO_MINUTOS', 60),
    ],

];
