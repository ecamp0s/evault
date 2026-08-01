<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * La fila de pertenencia entre un usuario y un vault.
 *
 * Existe sobre todo para que el rol llegue tipado como VaultRole en vez de como
 * una cadena suelta cuando se lee a través de la relación. Las escrituras siguen
 * haciéndose con attach() sobre la relación.
 *
 * Aviso: la tabla tiene clave primaria compuesta, así que los métodos de Eloquent
 * que asumen una clave única —find, whereKey y compañía— no sirven aquí. Para
 * buscar, filtrar por vault_id y user_id.
 *
 * @property VaultRole $role
 */
class VaultMember extends Pivot
{
    protected $table = 'vault_members';

    public $incrementing = false;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => VaultRole::class,
        ];
    }
}
