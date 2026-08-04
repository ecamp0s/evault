<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Vault;
use App\Models\VaultItem;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;

/*
 * Este es el test que defiende el contrato del blob. Si alguna vez falla porque
 * alguien añadió una columna, la pregunta que hay que hacerse no es cómo
 * actualizarlo, sino si ese dato puede estar en claro en el servidor.
 *
 * La lista es exhaustiva y está ordenada como la migración. Ver ADR-001 y
 * docs/architecture/FOUNDATION.md.
 */
it('no tiene ninguna columna con significado para el usuario', function (): void {
    expect(Schema::getColumnListing('vault_items'))->toBe([
        'id',
        'vault_id',
        'ciphertext',
        'iv',
        'version',
        'created_at',
        'updated_at',
    ]);
});

/*
 * El criterio central del issue: el servidor guarda y devuelve exactamente lo que
 * le dieron. Se prueba con bytes aleatorios de verdad, no con texto, porque lo que
 * puede romperse es precisamente lo que no es texto legible.
 */
it('devuelve el blob byte a byte, sin interpretarlo', function (): void {
    $bytes = random_bytes(2048);
    $payload = base64_encode($bytes);

    $item = VaultItem::factory()->create(['ciphertext' => $payload]);

    $recuperado = VaultItem::query()->whereKey($item->id)->sole();

    expect($recuperado->ciphertext)->toBe($payload)
        ->and(base64_decode($recuperado->ciphertext, true))->toBe($bytes);
});

/*
 * Un blob que se parece a otra cosa. El riesgo real no es que alguien decida
 * interpretar el contenido a propósito, sino que una capa intermedia lo haga sola
 * por reconocer una forma familiar.
 */
it('no interpreta un blob que parezca JSON u otra cosa conocida', function (): void {
    $sospechosos = [
        '{"name":"esto no es un objeto","password":"tampoco"}',
        '<?php echo "hola"; ?>',
        "con\0bytes\nnulos\ty saltos",
        'ÁÉÍÓÚ ñ 漢字 🔐',
        '',
    ];

    foreach ($sospechosos as $payload) {
        $item = VaultItem::factory()->create(['ciphertext' => $payload]);

        expect($item->fresh()?->ciphertext)->toBe($payload);
    }
});

it('admite un blob grande sin truncarlo', function (): void {
    // Por encima de los 64 kB donde se quedaría un text, que es el motivo de que
    // la columna sea longText.
    $payload = base64_encode(random_bytes(96 * 1024));

    $item = VaultItem::factory()->create(['ciphertext' => $payload]);

    expect($item->fresh()?->ciphertext)->toBe($payload);
});

it('no se puede crear un item sin vault', function (): void {
    expect(fn () => VaultItem::factory()->create(['vault_id' => null]))
        ->toThrow(QueryException::class);
});

it('no se puede crear un item en un vault que no existe', function (): void {
    expect(fn () => VaultItem::factory()->create([
        'vault_id' => '019fbe85-0000-7000-8000-000000000000',
    ]))->toThrow(QueryException::class);
});

it('borrar el vault se lleva sus items', function (): void {
    $vault = Vault::factory()->create();
    VaultItem::factory()->count(3)->create(['vault_id' => $vault->id]);

    $this->assertDatabaseCount('vault_items', 3);

    $vault->delete();

    $this->assertDatabaseCount('vault_items', 0);
});

/*
 * El encadenado completo: borrar la cuenta se lleva el vault personal y, con él,
 * todo lo que contiene. Es lo que hace que dar de baja a un usuario no deje
 * secretos huérfanos en la base de datos.
 */
it('borrar al usuario se lleva los items de su vault personal', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    VaultItem::factory()->count(2)->create(['vault_id' => $user->personalVault?->id]);

    $user->delete();

    $this->assertDatabaseCount('vaults', 0);
    $this->assertDatabaseCount('vault_items', 0);
});

it('guarda la versión del esquema tal cual, sin validarla', function (): void {
    // Una versión que este servidor no conoce. Debe admitirla igual: un cliente
    // más nuevo tiene que poder escribir un esquema que el servidor no ejecuta.
    $item = VaultItem::factory()->create(['version' => 99]);

    expect($item->fresh()?->version)->toBe(99);
});

it('el identificador es un uuid y no un entero', function (): void {
    $item = VaultItem::factory()->create();

    expect($item->id)->toBeString()
        ->and(Str::isUuid($item->id))->toBeTrue();
});

it('los items pertenecen al vault y se llegan desde él', function (): void {
    $vault = Vault::factory()->create();
    $other = Vault::factory()->create();

    $item = VaultItem::factory()->create(['vault_id' => $vault->id]);
    VaultItem::factory()->count(2)->create(['vault_id' => $other->id]);

    expect($vault->items)->toHaveCount(1)
        ->and($vault->items->first()?->id)->toBe($item->id)
        ->and($item->vault->id)->toBe($vault->id);
});
