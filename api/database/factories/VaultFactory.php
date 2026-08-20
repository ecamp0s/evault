<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Vault>
 */
class VaultFactory extends Factory
{
    /** @var class-string<Vault> */
    protected $model = Vault::class;

    public function definition(): array
    {
        return [
            'name' => fake()->words(2, true),
            'personal_for_user_id' => null,
        ];
    }

    /**
     * A user's personal vault, with their membership as its owner.
     *
     * A shortcut for setting up a test's scenario. The real creation is done by
     * App\Application\Vaults\CreatePersonalVault, which is what gets exercised when
     * what is being tested is the creation and not what comes after.
     *
     * The wrapped key is a literal and not a real key, because the server cannot tell
     * one from another. See ADR-008.
     */
    public function personalFor(User $user): static
    {
        return $this->state(['personal_for_user_id' => $user->id])
            ->afterCreating(function (Vault $vault) use ($user): void {
                $vault->members()->attach($user->id, [
                    'role' => VaultRole::Owner->value,
                    'wrapped_key' => 'clave-envuelta-de-prueba',
                    'wrapped_key_iv' => 'nonce-de-prueba',
                ]);
            });
    }
}
