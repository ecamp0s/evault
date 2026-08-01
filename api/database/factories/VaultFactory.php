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
     * El vault personal de un usuario, con su pertenencia como propietario.
     *
     * Atajo para montar el escenario de un test. El alta de verdad la hace
     * App\Application\Vaults\CreatePersonalVault, que es lo que se ejercita
     * cuando lo que se prueba es el alta y no lo que viene después.
     */
    public function personalDe(User $user): static
    {
        return $this->state(['personal_for_user_id' => $user->id])
            ->afterCreating(function (Vault $vault) use ($user): void {
                $vault->members()->attach($user->id, ['role' => VaultRole::Owner->value]);
            });
    }
}
