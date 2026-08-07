<?php

declare(strict_types=1);

use App\Application\Auth\AccessTokens;
use App\Application\Auth\IssueSessionToken;
use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

beforeEach(function (): void {
    $this->user = User::factory()->create();
    $this->issue = new IssueSessionToken;
});

it('emite un token que caduca', function (): void {
    $this->issue->handle($this->user);

    $token = PersonalAccessToken::query()->firstOrFail();

    expect($token->expires_at)->not->toBeNull()
        ->and($token->expires_at->timestamp)
        ->toEqualWithDelta(now()->addHours(AccessTokens::SESSION_HOURS)->timestamp, 5);
});

/*
 * Registro y login tienen que emitir tokens indistinguibles: si el nombre o las
 * capacidades difirieran, el token revelaría por qué vía se obtuvo. De ahí que los
 * dos pasen por este servicio.
 */
it('emite el token con el nombre y las capacidades de siempre', function (): void {
    $this->issue->handle($this->user);

    $token = PersonalAccessToken::query()->firstOrFail();

    expect($token->name)->toBe(AccessTokens::NAME)
        ->and($token->abilities)->toBe(['*']);
});

/*
 * El barrido es lo que impide que la tabla crezca sin techo. Cada recarga de página
 * bloquea la vault y desbloquear hace por debajo un login completo, así que sin esto
 * se acumulaba un token por recarga que ya nadie iba a usar. Ver el issue #149.
 */
it('barre los tokens ya caducados de la cuenta al emitir uno nuevo', function (): void {
    $this->user->createToken(AccessTokens::NAME, ['*'], now()->subMinute());
    $this->user->createToken(AccessTokens::NAME, ['*'], now()->subDay());

    expect(PersonalAccessToken::query()->count())->toBe(2);

    $this->issue->handle($this->user);

    expect(PersonalAccessToken::query()->count())->toBe(1)
        ->and(PersonalAccessToken::query()->firstOrFail()->expires_at->isFuture())->toBeTrue();
});

/*
 * Barrer los caducados no puede llevarse por delante las sesiones que siguen
 * abiertas en otros dispositivos. Es la misma garantía que defiende LogoutUser al
 * revocar solo el token de la petición.
 */
it('no toca los tokens de la cuenta que siguen vivos', function (): void {
    $vivo = $this->user->createToken(AccessTokens::NAME, ['*'], now()->addHours(3))->accessToken;

    $this->issue->handle($this->user);

    expect(PersonalAccessToken::query()->whereKey($vivo->id)->exists())->toBeTrue()
        ->and(PersonalAccessToken::query()->count())->toBe(2);
});

/*
 * Aislamiento entre cuentas, obligatorio por ADR-004: el barrido va acotado al
 * usuario que se autentica y no puede alcanzar los tokens de otro, ni siquiera los
 * caducados.
 */
it('no borra los tokens caducados de otra cuenta', function (): void {
    $otra = User::factory()->create();
    $ajeno = $otra->createToken(AccessTokens::NAME, ['*'], now()->subDay())->accessToken;

    $this->issue->handle($this->user);

    expect(PersonalAccessToken::query()->whereKey($ajeno->id)->exists())->toBeTrue();
});

/*
 * El token de recuperación tiene su propia caducidad, mucho más corta, y no debe
 * verse afectado mientras siga vivo: quien está a mitad de una recuperación no puede
 * perder el token con el que va a terminarla.
 */
it('no toca un token de recuperación que sigue vivo', function (): void {
    $recuperacion = $this->user->createToken(
        AccessTokens::RECOVERY_NAME,
        [AccessTokens::RECOVERY_ABILITY],
        now()->addMinutes(AccessTokens::RECOVERY_MINUTES),
    )->accessToken;

    $this->issue->handle($this->user);

    expect(PersonalAccessToken::query()->whereKey($recuperacion->id)->exists())->toBeTrue();
});
