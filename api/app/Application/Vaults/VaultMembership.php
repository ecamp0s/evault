<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\Vault;

/**
 * La pregunta «¿este usuario pertenece a este vault?», en un solo sitio.
 *
 * Las dos barreras del double guard la hacen: el middleware antes de entrar al
 * controlador, y cada servicio de aplicación por su cuenta. Que compartan esta
 * clase no debilita la garantía, porque lo que el double guard protege es que
 * ninguna capa dé por hecho el trabajo de la otra; no exige escribir la misma
 * consulta dos veces, lo que solo multiplicaría las ocasiones de equivocarse.
 *
 * Lo que hay que poder afirmar es que llamar a un servicio directamente, saltando
 * el controlador entero, sigue siendo seguro. Hay un test por servicio que lo
 * comprueba.
 */
final readonly class VaultMembership
{
    public function allows(int $userId, string $vaultId): bool
    {
        return Vault::query()
            ->whereKey($vaultId)
            ->whereHas('members', fn ($query) => $query->whereKey($userId))
            ->exists();
    }

    /**
     * @throws VaultNotAccessible
     */
    public function assert(int $userId, string $vaultId): void
    {
        if (! $this->allows($userId, $vaultId)) {
            throw new VaultNotAccessible;
        }
    }
}
