<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        // Con vault personal, igual que si se hubiera registrado por la API: sin
        // él, probar cualquier cosa de la vault en local no llegaría a arrancar.
        User::factory()->withPersonalVault()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
        ]);
    }
}
