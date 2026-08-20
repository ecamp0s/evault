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
     * The user with their personal vault already created.
     *
     * In production every user has a vault from sign-up, but the factory does not
     * create it on its own, on purpose. Doing so by default would slip invisible writes
     * into two more tables in every test that only wants a user, and would muddy any
     * assertion about the number of vaults. A test that needs the invariant asks for it,
     * and if it forgets it fails loudly, which is exactly what is wanted.
     *
     * The wrapped key written is not a real key and does not pretend to be: the server
     * cannot tell one from another, so in the tests a recognisable literal is enough.
     * Whoever needs to check what was stored passes it in.
     */
    public function withPersonalVault(?WrappedVaultKey $wrappedKey = null): static
    {
        $key = $wrappedKey ?? new WrappedVaultKey(
            ciphertext: 'clave-envuelta-de-prueba',
            iv: 'nonce-de-prueba',
        );

        return $this->afterCreating(
            fn (User $user) => app(CreatePersonalVault::class)->handle($user->id, $key)
        );
    }
}
