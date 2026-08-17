<?php

declare(strict_types=1);

namespace App\Application\Auth;

/**
 * La forma canónica de un correo electrónico.
 *
 * ESTO NO ES UNA CORTESÍA DE LA INTERFAZ: ES PARTE DEL CONTRATO CRIPTOGRÁFICO.
 *
 * Por ADR-008 el correo es el SALT del que se deriva la clave maestra, así que
 * cliente y servidor tienen que normalizarlo exactamente igual o la derivación no
 * coincide. Cuando no coincide, el fallo no es un error: es un usuario que escribe
 * su contraseña buena y recibe «credenciales incorrectas», o peor, una vault que
 * deja de abrirse sin que nada haya avisado.
 *
 * El equivalente en el cliente es normalizeEmail() de web/src/lib/vault/crypto.ts, y
 * hay un test que fija que las dos hacen lo mismo. Si una cambia, la otra también.
 *
 * VIVE AQUÍ Y NO REPETIDA EN CADA SITIO desde #221, que es cuando iba a haber un
 * sexto uso. Antes estaba copiada en RegisterUser, LoginUser, RecoverAccess y dos
 * veces en AttemptKey, sin nada que comprobara que las cinco seguían siendo iguales.
 * Lo que lo hacía peligroso no es la duplicación: es que una copia que divergiera NO
 * ROMPERÍA NINGÚN TEST y se manifestaría como una vault que no abre, con el sitio
 * donde mirar muy lejos del sitio del problema.
 */
final class EmailAddress
{
    /**
     * Minúsculas y sin espacios alrededor.
     *
     * `mb_strtolower` y no `strtolower`, porque el segundo solo baja los ASCII y
     * dejaría `JOSÉ@…` a medio normalizar.
     *
     * Lo que NO se hace aquí, y conviene decirlo porque parece que faltara: nada de
     * quitar puntos ni sufijos con `+`, aunque algunos proveedores los traten como
     * equivalentes. Dos correos que un proveedor considera el mismo son dos salts
     * distintos, y «arreglarlo» dejaría fuera de su vault a quien se registró con la
     * variante que aquí se descarta.
     */
    public static function normalize(string $email): string
    {
        return mb_strtolower(trim($email));
    }
}
