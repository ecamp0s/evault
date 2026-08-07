<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;

/**
 * Emite el token de sesión, con su caducidad, y aprovecha para barrer los que ya
 * caducaron de esa misma cuenta.
 *
 * Existe como servicio y no como dos líneas repetidas en el registro y en el
 * login porque los dos tienen que emitir tokens INDISTINGUIBLES: mismo nombre,
 * mismas capacidades y misma caducidad. Si divergieran, el token revelaría por
 * qué vía se obtuvo. Teniéndolo en un solo sitio, no pueden divergir por descuido.
 */
final readonly class IssueSessionToken
{
    public function handle(User $user): string
    {
        /*
         * Barrido oportunista de los caducados de esta cuenta, aprovechando que
         * quien se autentica acaba de demostrar que es su dueño.
         *
         * Es lo que evita que la tabla crezca sin techo, que era la mitad del
         * problema del issue #149: recargar la página bloquea la vault y
         * desbloquear hace por debajo un login completo, así que cada recarga
         * dejaba un token que ya nadie iba a usar.
         *
         * No toca los de otras cuentas ni los que siguen vivos: cerrar sesión en
         * un dispositivo no puede cerrarla en los demás, que es lo mismo que
         * defiende LogoutUser.
         *
         * Para una instancia con muchas cuentas, esto no basta —una cuenta que
         * nunca vuelve a entrar conserva sus caducados— y ahí entra el
         * `sanctum:prune-expired` que documenta la guía de despliegue. Pero ese
         * comando exige un cron, y esto no exige nada.
         */
        $user->tokens()
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->delete();

        return $user->createToken(
            AccessTokens::NAME,
            ['*'],
            now()->addHours(AccessTokens::SESSION_HOURS),
        )->plainTextToken;
    }
}
