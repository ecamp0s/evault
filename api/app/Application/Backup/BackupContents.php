<?php

declare(strict_types=1);

namespace App\Application\Backup;

/**
 * Qué entra en una copia de seguridad, y por qué esas cuatro tablas.
 *
 * El orden importa al restaurar: las claves ajenas exigen que exista el usuario
 * antes que su vault, y la vault antes que sus miembros y sus items.
 *
 * `vault_members` NO es opcional aunque solo tenga pertenencias: ahí vive la clave
 * de vault envuelta. Sin ella, la copia es un montón de ciphertext que ya nadie
 * puede abrir, ni siquiera con la contraseña maestra correcta. Es la diferencia
 * entre una copia de seguridad y un fichero grande. Ver ADR-008.
 *
 * Lo que se deja fuera y es deliberado: `personal_access_tokens`, porque una sesión
 * viva no es un dato que restaurar y arrastrarla resucitaría tokens que quizá se
 * revocaron a propósito; y `cache` y `jobs`, que son estado de ejecución.
 */
final class BackupContents
{
    /** Versión del formato del fichero. Se comprueba al restaurar. */
    public const int VERSION = 1;

    /**
     * En este orden se escriben y en este orden se restauran.
     *
     * @var list<string>
     */
    public const array TABLES = ['users', 'vaults', 'vault_members', 'vault_items'];
}
