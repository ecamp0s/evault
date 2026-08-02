<?php

namespace Database\Factories;

use App\Application\Vaults\CreatePersonalVault;
use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    /**
     * El usuario con su vault personal ya creado.
     *
     * En producción todo usuario tiene vault desde el registro, pero la factory
     * no lo crea sola a propósito. Hacerlo por defecto metería escrituras
     * invisibles en dos tablas más en cada test que solo quiere un usuario, y
     * enturbiaría cualquier aserción sobre el número de vaults. Un test que
     * necesite la invariante la pide, y si se olvida falla de forma ruidosa, que
     * es justo lo que se quiere.
     *
     * La clave envuelta que se escribe no es una clave de verdad ni lo pretende:
     * el servidor no puede distinguir una de otra, así que en los tests basta un
     * literal reconocible. Quien necesite comprobar qué se guardó, la pasa.
     */
    public function conVaultPersonal(?WrappedVaultKey $wrappedKey = null): static
    {
        $clave = $wrappedKey ?? new WrappedVaultKey(
            ciphertext: 'clave-envuelta-de-prueba',
            iv: 'nonce-de-prueba',
        );

        return $this->afterCreating(
            fn (User $user) => app(CreatePersonalVault::class)->handle($user->id, $clave)
        );
    }
}
