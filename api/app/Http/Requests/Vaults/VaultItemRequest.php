<?php

declare(strict_types=1);

namespace App\Http\Requests\Vaults;

use App\Application\Vaults\VaultItemPayload;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validación del payload de un item, para el alta y para la actualización.
 *
 * Es la misma clase para las dos porque el payload es atómico: texto cifrado,
 * nonce y versión se sustituyen juntos o no se tocan. Un PATCH que aceptara solo
 * el ciphertext dejaría una fila indescifrable.
 *
 * Lo que aquí NO se valida es tan deliberado como lo que sí. No se comprueba que
 * el ciphertext sea base64 válido, ni que el iv tenga la longitud que
 * correspondería a AES-GCM, ni que la versión esté entre las conocidas. Validar
 * cualquiera de esas cosas sería que el servidor opine sobre un formato
 * criptográfico que no puede ejecutar, y bloquearía a un cliente más nuevo que
 * escribiera un esquema posterior. Ver docs/architecture/FOUNDATION.md.
 *
 * Lo que sí se acota es el tamaño, porque eso no es interpretar el contenido sino
 * defender la base de datos.
 */
final class VaultItemRequest extends FormRequest
{
    /**
     * Techo del blob en caracteres. Holgado para lo que cabe en una entrada con
     * notas largas, y muy por debajo de lo que admite la columna longText.
     */
    private const int MAX_CIPHERTEXT = 131072;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'ciphertext' => ['required', 'string', 'max:'.self::MAX_CIPHERTEXT],
            'iv' => ['required', 'string', 'max:255'],
            // El techo es el de la columna unsignedSmallInteger, para que un
            // desbordamiento se convierta en un 422 y no en un error de base de
            // datos.
            'version' => ['required', 'integer', 'min:1', 'max:65535'],
        ];
    }

    public function payload(): VaultItemPayload
    {
        return new VaultItemPayload(
            ciphertext: $this->string('ciphertext')->toString(),
            iv: $this->string('iv')->toString(),
            version: $this->integer('version'),
        );
    }
}
