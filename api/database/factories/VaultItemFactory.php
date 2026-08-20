<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Vault;
use App\Models\VaultItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<VaultItem>
 */
class VaultItemFactory extends Factory
{
    /** @var class-string<VaultItem> */
    protected $model = VaultItem::class;

    public function definition(): array
    {
        return [
            'vault_id' => Vault::factory(),

            /*
             * Random bytes in base64. They represent nothing and do not need to: to the
             * server, a real item means nothing either. Generating something with
             * structure here would only serve to tempt somebody into writing code that
             * looks at it.
             */
            'ciphertext' => base64_encode(random_bytes(256)),
            'iv' => base64_encode(random_bytes(12)),

            // The version is decided by the client; 1 is Iteration 2's temporary
            // encoding. The register of versions is in
            // docs/architecture/FOUNDATION.md.
            'version' => 1,
        ];
    }
}
