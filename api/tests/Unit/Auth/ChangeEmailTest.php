<?php

declare(strict_types=1);

use App\Application\Auth\ChangeEmail;
use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\VaultMember;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

/*
 * El servicio que cambia el correo. Ver ADR-014.
 *
 * Lo que se prueba aquí no es que escriba —eso lo cubre el test de la API— sino que
 * no pueda escribir a medias, que se lleve por delante las sesiones que debe, y que
 * haga lo correcto con la clave de recuperación, que es lo único que este camino no
 * comparte con la rotación de contraseña.
 *
 * El correo es el salt de la derivación (ADR-008), así que aquí son CUATRO escrituras
 * y no tres, y el estado a medias peor es el correo cambiado con los envoltorios
 * viejos: el usuario entra, deriva una clave maestra distinta, y esa clave no abre
 * nada.
 */

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create([
        'password' => 'hash-actual',
        'email' => 'ada@evault.test',
    ]);
    $this->vault = $this->user->personalVault;
});

/**
 * El nombre es largo a propósito: PHP no distingue mayúsculas en los nombres de
 * función, así que cualquier variante de `rewrapped` chocaría con la del test de
 * rotación de contraseña, que es global como esta.
 *
 * @return array<string, WrappedVaultKey>
 */
function wrappedForEmailChange(string $vaultId, string $ciphertext = 'envoltorio-nuevo'): array
{
    return [$vaultId => new WrappedVaultKey($ciphertext, 'nonce-nuevo')];
}

it('escribe el correo, el hash y los envoltorios juntos', function (): void {
    app(ChangeEmail::class)->handle(
        userId: $this->user->id,
        newEmail: 'ada.lovelace@evault.test',
        newAuthHash: 'hash-nuevo',
        wrappedKeys: wrappedForEmailChange($this->vault->id),
    );

    $this->user->refresh();
    $member = VaultMember::query()->where('user_id', $this->user->id)->firstOrFail();

    expect($this->user->email)->toBe('ada.lovelace@evault.test')
        ->and($member->wrapped_key)->toBe('envoltorio-nuevo');
});

/*
 * El test que da valor a la transacción: se fuerza un fallo entre la escritura de los
 * envoltorios y la del usuario, y se comprueba que la primera se revirtió.
 */
it('no deja los envoltorios reescritos si falla el cambio de correo', function (): void {
    Event::listen('eloquent.saving: '.User::class, function (): void {
        throw new RuntimeException('fallo forzado entre las dos escrituras');
    });

    expect(fn () => app(ChangeEmail::class)->handle(
        userId: $this->user->id,
        newEmail: 'ada.lovelace@evault.test',
        newAuthHash: 'hash-nuevo',
        wrappedKeys: wrappedForEmailChange($this->vault->id),
    ))->toThrow(RuntimeException::class);

    $this->user->refresh();
    $member = VaultMember::query()->where('user_id', $this->user->id)->firstOrFail();

    expect($this->user->email)->toBe('ada@evault.test')
        ->and($member->wrapped_key)->not->toBe('envoltorio-nuevo');
});

it('no escribe en la vault de otro aunque le pasen su identificador', function (): void {
    // Aislamiento cross-tenant, obligatorio por ADR-004 en todo servicio crítico.
    $other = User::factory()->withPersonalVault()->create();
    $theirWrappedKey = VaultMember::query()->where('user_id', $other->id)->firstOrFail()->wrapped_key;

    app(ChangeEmail::class)->handle(
        userId: $this->user->id,
        newEmail: 'ada.lovelace@evault.test',
        newAuthHash: 'hash-nuevo',
        wrappedKeys: wrappedForEmailChange($other->personalVault->id, 'intruso'),
    );

    $member = VaultMember::query()->where('user_id', $other->id)->firstOrFail();

    expect($member->wrapped_key)->toBe($theirWrappedKey);
});

describe('la clave de recuperación', function (): void {
    beforeEach(function (): void {
        $this->user->forceFill(['recovery_auth_hash' => 'hash-recuperacion-viejo'])->save();
        VaultMember::query()->where('user_id', $this->user->id)->update([
            'recovery_wrapped_key' => 'envoltorio-recuperacion-viejo',
            'recovery_wrapped_key_iv' => 'nonce-viejo',
        ]);
    });

    it('se rehace cuando llega una nueva', function (): void {
        app(ChangeEmail::class)->handle(
            userId: $this->user->id,
            newEmail: 'ada.lovelace@evault.test',
            newAuthHash: 'hash-nuevo',
            wrappedKeys: wrappedForEmailChange($this->vault->id),
            recoveryAuthHash: 'hash-recuperacion-nuevo',
            recoveryWrappedKeys: [
                $this->vault->id => new WrappedVaultKey('envoltorio-recuperacion-nuevo', 'nonce-nuevo'),
            ],
        );

        $this->user->refresh();
        $member = VaultMember::query()->where('user_id', $this->user->id)->firstOrFail();

        /*
         * Con Hash::check y no comparando cadenas: recovery_auth_hash lleva el cast
         * 'hashed', así que el servidor NUNCA guarda el valor que recibe. Comprobarlo
         * así es además lo que fija esa garantía —si alguien quitara el cast, este
         * test se pondría rojo—, mientras que un toBe() sobre el literal se pondría
         * verde justo cuando el hash dejara de aplicarse.
         */
        expect(Hash::check('hash-recuperacion-nuevo', $this->user->recovery_auth_hash))->toBeTrue()
            ->and($this->user->recovery_auth_hash)->not->toBe('hash-recuperacion-nuevo')
            ->and($member->recovery_wrapped_key)->toBe('envoltorio-recuperacion-nuevo');
    });

    /*
     * La decisión menos obvia del servicio, y la que evita el peor final: un
     * envoltorio que ya no puede abrirse, guardado como si sirviera, y un usuario
     * convencido de que tiene red de seguridad.
     *
     * El correo es el salt del HKDF del que salen las claves de recuperación, así que
     * al cambiarlo el envoltorio viejo deja de abrir. Sin clave se está en el modelo
     * anterior, que ADR-010 considera legítimo; con una que no abre, en ninguno.
     */
    it('se BORRA si no llega una nueva, en vez de quedarse sin poder abrir', function (): void {
        app(ChangeEmail::class)->handle(
            userId: $this->user->id,
            newEmail: 'ada.lovelace@evault.test',
            newAuthHash: 'hash-nuevo',
            wrappedKeys: wrappedForEmailChange($this->vault->id),
        );

        $this->user->refresh();
        $member = VaultMember::query()->where('user_id', $this->user->id)->firstOrFail();

        expect($this->user->recovery_auth_hash)->toBeNull()
            ->and($member->recovery_wrapped_key)->toBeNull()
            ->and($member->recovery_wrapped_key_iv)->toBeNull();
    });
});

it('se lleva por delante los demás tokens y conserva el de la petición', function (): void {
    $survivor = $this->user->createToken('actual')->accessToken;
    $this->user->createToken('otro-dispositivo');

    app(ChangeEmail::class)->handle(
        userId: $this->user->id,
        newEmail: 'ada.lovelace@evault.test',
        newAuthHash: 'hash-nuevo',
        wrappedKeys: wrappedForEmailChange($this->vault->id),
        keepTokenId: $survivor->id,
    );

    expect($this->user->tokens()->pluck('id')->all())->toBe([$survivor->id]);
});

it('sin token que conservar se caen todos', function (): void {
    $this->user->createToken('uno');
    $this->user->createToken('dos');

    app(ChangeEmail::class)->handle(
        userId: $this->user->id,
        newEmail: 'ada.lovelace@evault.test',
        newAuthHash: 'hash-nuevo',
        wrappedKeys: wrappedForEmailChange($this->vault->id),
    );

    expect($this->user->tokens()->count())->toBe(0);
});
