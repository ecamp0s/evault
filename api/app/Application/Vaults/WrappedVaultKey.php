<?php

declare(strict_types=1);

namespace App\Application\Vaults;

/**
 * La clave de una vault, envuelta con la clave maestra de uno de sus miembros.
 *
 * Es el equivalente de VaultItemPayload para las claves: bytes que el cliente cifró
 * y que el servidor guarda sin poder abrirlos. En la tabla son las columnas
 * wrapped_key y wrapped_key_iv de vault_members.
 *
 * Los dos campos van juntos siempre. Un texto cifrado sin su nonce no se puede
 * descifrar, así que separarlos permitiría escribir media clave y dejar a alguien
 * fuera de su propia vault de forma irreversible.
 *
 * No lleva versión, al contrario que VaultItemPayload. La versión del esquema
 * criptográfico ya viaja en cada item, que es donde importa para poder migrarlos de
 * uno en uno; la clave envuelta se reescribe entera cada vez que cambia y no admite
 * convivencia de esquemas. Ver ADR-008.
 */
final readonly class WrappedVaultKey
{
    public function __construct(
        public string $ciphertext,
        public string $iv,
    ) {}
}
