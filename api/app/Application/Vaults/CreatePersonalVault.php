<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\Vault;
use App\Models\VaultRole;
use Illuminate\Support\Facades\DB;

/**
 * Alta del vault personal de un usuario y de su pertenencia como propietario.
 *
 * Recibe el identificador por parámetro y no toca la sesión ni el usuario
 * autenticado, siguiendo ADR-004: la API es stateless y el contexto viaja
 * explícito en cada llamada.
 *
 * El nombre lo pone el servidor y es un literal fijo. La política de idioma del
 * proyecto deja los textos de cara al usuario en manos del cliente, así que este
 * valor es una etiqueta interna, no algo pensado para pintarse tal cual.
 *
 * Aviso para cuando lleguen las vaults compartidas: el nombre es una columna en
 * claro, legible por el servidor. Hoy no dice nada porque siempre vale lo mismo,
 * pero un nombre escrito por el usuario sí sería un metadato, y habrá que decidir
 * entonces si viaja dentro del blob.
 */
final readonly class CreatePersonalVault
{
    private const string NOMBRE = 'Personal';

    public function handle(int $userId): Vault
    {
        return DB::transaction(function () use ($userId): Vault {
            /*
             * Idempotente a propósito: si ya existe, se devuelve el que hay en
             * vez de estrellarse contra el índice único. Un reintento del alta no
             * debe convertirse en un 500, y así el servicio también sirve para
             * reparar un usuario que se hubiera quedado sin vault.
             *
             * lockForUpdate cierra la ventana entre esta consulta y el insert,
             * igual que hace RegisterUser con la unicidad del correo. La garantía
             * de verdad es el índice único; esto solo evita llegar hasta él.
             */
            $existente = Vault::query()
                ->where('personal_for_user_id', $userId)
                ->lockForUpdate()
                ->first();

            if ($existente instanceof Vault) {
                return $existente;
            }

            $vault = Vault::query()->create([
                'name' => self::NOMBRE,
                'personal_for_user_id' => $userId,
            ]);

            $vault->members()->attach($userId, ['role' => VaultRole::Owner->value]);

            return $vault;
        });
    }
}
