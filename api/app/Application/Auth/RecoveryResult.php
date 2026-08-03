<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;

/**
 * Lo que se lleva quien ha demostrado tener la clave de recuperación: los
 * envoltorios que solo esa clave abre, y un token para terminar la operación.
 *
 * El token NO es una sesión normal. Solo sirve para fijar una contraseña maestra
 * nueva y caduca pronto, porque quien llega aquí todavía no ha demostrado saber
 * ninguna contraseña. Ver ADR-010.
 */
final readonly class RecoveryResult
{
    /**
     * @param  list<array{vault_id: string, recovery_wrapped_key: string, recovery_wrapped_key_iv: string}>  $wrappedKeys
     */
    public function __construct(
        public User $user,
        public array $wrappedKeys,
        public string $token,
    ) {}
}
