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

        // With a personal vault, just as if they had signed up through the API:
        // without it, trying anything about the vault locally would not get started.
        User::factory()->withPersonalVault()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
        ]);
    }
}
