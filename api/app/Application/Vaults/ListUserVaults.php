<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;
use Illuminate\Support\Collection;

/**
 * Los vaults a los que pertenece un usuario.
 *
 * Es el punto de entrada al contexto de tenant desde el cliente: si el vault viaja
 * explícito en cada llamada, alguien tiene que decirle al cliente qué vaults tiene.
 *
 * No se resolvió metiéndolo en /api/auth/me, que habría sido más barato mientras
 * cada usuario tenga exactamente uno, por dos motivos: cambiaría el contrato de un
 * endpoint que se decidió mantener estable hasta la Iteración 3, y dejaría de
 * servir en cuanto existan las vaults compartidas del plan Team.
 *
 * Cuando lleguen las organizaciones, este endpoint devolverá también sus vaults
 * sin cambiar de forma.
 */
final readonly class ListUserVaults
{
    /**
     * @return Collection<int, VaultSummary>
     */
    public function handle(int $userId): Collection
    {
        $user = User::query()->whereKey($userId)->first();

        if (! $user instanceof User) {
            /*
             * Un usuario que no existe no pertenece a nada. Devolver una lista
             * vacía y no lanzar es lo correcto aquí: quien llama ya viene
             * autenticado, así que este caso no es un error del cliente sino una
             * situación que no debería darse, y hacerla explotar solo cambiaría un
             * 200 vacío por un 500.
             */
            return new Collection;
        }

        return $user->vaults()
            ->orderBy('name')
            ->orderBy('id')
            ->get()
            ->map(fn (Vault $vault): VaultSummary => new VaultSummary(
                id: $vault->id,
                name: $vault->name,
                /*
                 * Personal para *este* usuario, no personal en abstracto. Hoy da
                 * lo mismo, porque a la vault personal de otro no se pertenece
                 * nunca, pero escribirlo así evita que la respuesta signifique
                 * algo distinto el día que existan las vaults compartidas.
                 */
                isPersonal: $vault->personal_for_user_id === $userId,
                role: $vault->pivot->role,
                /*
                 * Del pivot y no del vault: la clave envuelta es la de este usuario.
                 * Como la consulta arranca de $user->vaults(), el pivot que llega es
                 * siempre el suyo, así que no hay forma de devolver la de otro sin
                 * cambiar de dónde sale esta consulta.
                 */
                wrappedKey: new WrappedVaultKey(
                    ciphertext: $vault->pivot->wrapped_key,
                    iv: $vault->pivot->wrapped_key_iv,
                ),
            ))
            ->values();
    }
}
