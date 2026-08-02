<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\VaultFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * El tenant del producto: un contenedor de secretos con sus miembros. Ver
 * ADR-004.
 *
 * El identificador es un UUIDv7, que HasUuids genera ordenado por tiempo, así
 * que el índice se comporta como uno secuencial sin serlo de cara al exterior.
 * El sello temporal que lleva dentro no añade ninguna fuga, porque created_at ya
 * está en claro en la misma fila.
 *
 * @property string $id
 * @property string $name
 * @property int|null $personal_for_user_id
 * @property VaultMember $pivot cuando se llega al vault a través de la pertenencia
 */
#[Fillable(['name', 'personal_for_user_id'])]
class Vault extends Model
{
    /** @use HasFactory<VaultFactory> */
    use HasFactory, HasUuids;

    /**
     * Los miembros del vault, con su rol y su clave envuelta en el pivot.
     *
     * La clave envuelta se declara aquí porque sin withPivot no llega, y lo que no
     * llega no se puede devolver: es el dato con el que cada miembro abre esta
     * vault. Ver ADR-008.
     *
     * @return BelongsToMany<User, $this, VaultMember, 'pivot'>
     */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'vault_members')
            ->using(VaultMember::class)
            ->withPivot('role', 'wrapped_key', 'wrapped_key_iv')
            ->withTimestamps();
    }

    /**
     * Las entradas que contiene. El servidor no puede leer ninguna.
     *
     * @return HasMany<VaultItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(VaultItem::class);
    }

    /**
     * El usuario del que este vault es el personal, si lo es de alguien.
     *
     * @return BelongsTo<User, $this>
     */
    public function personalFor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'personal_for_user_id');
    }

    /**
     * Ser personal no es una columna booleana sino la existencia de esa
     * relación. Los clientes lo reciben como un booleano derivado.
     */
    public function isPersonal(): bool
    {
        return $this->personal_for_user_id !== null;
    }
}
