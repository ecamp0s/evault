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
        'attempts' => (int) env('THROTTLE_LOGIN_ATTEMPTS', 5),
        'minutes' => (int) env('THROTTLE_LOGIN_MINUTES', 1),
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
    'register' => [
        'attempts' => (int) env('THROTTLE_REGISTER_ATTEMPTS', 10),
        'minutes' => (int) env('THROTTLE_REGISTER_MINUTES', 60),
    ],

    /*
     * Recuperación con la clave de recuperación. Más estricto que el login, y no
     * por simetría: el perfil de uso es distinto. Nadie recupera su cuenta cinco
     * veces al día, así que tres intentos por hora no estorban a quien la usa de
     * verdad y estrechan mucho la ventana a quien la prueba.
     *
     * La cuenta va por IP y correo, igual que el login: por IP sola un NAT
     * compartido dejaría fuera a inocentes, y por correo solo cualquiera podría
     * bloquear la recuperación de otro justo el día que la necesita.
     *
     * Las claves están en inglés, al contrario que las de arriba, siguiendo la
     * convención de CLAUDE.md para todo lo nuevo. Migrar las anteriores es el issue
     * #119, que tendrá que decidir además qué hacer con sus variables de entorno.
     */
    /*
     * Cambio de contraseña maestra. Recibe el hash de autenticación actual, así que
     * sin límite sería un sitio donde probar contraseñas con una sesión ya abierta.
     * Cambiarla es algo que se hace muy de vez en cuando, así que cinco por hora no
     * estorban a nadie.
     */
    'master_password' => [
        'attempts' => (int) env('THROTTLE_MASTER_PASSWORD_ATTEMPTS', 5),
        'minutes' => (int) env('THROTTLE_MASTER_PASSWORD_MINUTES', 60),
    ],

    /*
     * Cambio de correo electrónico. Ver ADR-014.
     *
     * Mismo perfil que el de arriba y por el mismo motivo: recibe el hash de
     * autenticación actual, así que sin límite sería un sitio donde probar
     * contraseñas con una sesión ya abierta. Y hay una razón más, propia de este
     * endpoint: su respuesta ante un correo ya registrado es indistinguible de la de
     * una contraseña incorrecta, pero sin límite se podría enumerar la instancia a
     * base de intentos aunque cada respuesta por separado no diga nada.
     */
    'email' => [
        'attempts' => (int) env('THROTTLE_EMAIL_ATTEMPTS', 5),
        'minutes' => (int) env('THROTTLE_EMAIL_MINUTES', 60),
    ],

    'recovery' => [
        'attempts' => (int) env('THROTTLE_RECOVERY_ATTEMPTS', 3),
        'minutes' => (int) env('THROTTLE_RECOVERY_MINUTES', 60),
    ],

];
