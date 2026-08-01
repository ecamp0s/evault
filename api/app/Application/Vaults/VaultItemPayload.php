<?php

declare(strict_types=1);

namespace App\Application\Vaults;

/**
 * El contenido opaco de un item, moviéndose entre la capa de presentación y la de
 * aplicación.
 *
 * Los tres campos van juntos siempre y no por comodidad: el texto cifrado y su
 * nonce son un mismo dato partido en dos columnas, y la versión dice cómo hay que
 * leerlos. Actualizar uno sin los otros produciría una fila que no se puede
 * descifrar, así que el payload se sustituye entero o no se toca.
 *
 * Nada de aquí se interpreta en el servidor. Ver docs/architecture/FOUNDATION.md.
 */
final readonly class VaultItemPayload
{
    public function __construct(
        public string $ciphertext,
        public string $iv,
        public int $version,
    ) {}
}
