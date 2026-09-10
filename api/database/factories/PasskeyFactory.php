<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Passkey;
use App\Models\User;
use App\Models\Vault;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Passkey>
 */
class PasskeyFactory extends Factory
{
    /** @var class-string<Passkey> */
    protected $model = Passkey::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'vault_id' => Vault::factory(),

            /*
             * Random bytes in base64, like an item's ciphertext and for the same
             * reason: to the server these mean nothing, and giving them structure here
             * would only tempt somebody into writing code that reads them.
             */
            'credential_id' => base64_encode(random_bytes(16)),
            'auth_hash' => base64_encode(random_bytes(32)),
            'wrapped_key' => base64_encode(random_bytes(48)),
            'wrapped_key_iv' => base64_encode(random_bytes(12)),

            'label' => 'iPhone',

            // A hostname, because that is what a relying party id is. See #578.
            'rp_id' => 'evault.local',
        ];
    }
}
