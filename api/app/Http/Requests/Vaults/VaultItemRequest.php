<?php

declare(strict_types=1);

namespace App\Http\Requests\Vaults;

use App\Application\Vaults\VaultItemPayload;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Validation of an item's payload, for both creating and updating.
 *
 * It is the same class for both because the payload is atomic: ciphertext, nonce and
 * version are replaced together or not touched. A PATCH accepting the ciphertext alone
 * would leave an undecryptable row.
 *
 * What is NOT validated here is as deliberate as what is. It does not check that the
 * ciphertext is valid base64, nor that the iv has the length AES-GCM would call for,
 * nor that the version is among the known ones. Validating any of that would be the
 * server opining on a cryptographic format it cannot run, and it would block a newer
 * client writing a later schema. See docs/architecture/FOUNDATION.md.
 *
 * What is bounded is the size, because that is not interpreting the content but
 * defending the database.
 */
final class VaultItemRequest extends FormRequest
{
    /**
     * Ceiling of the blob in characters. Generous for what fits in an entry with long
     * notes, and far below what the longText column takes.
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
            // The ceiling is that of the unsignedSmallInteger column, so that an
            // overflow turns into a 422 and not into a database error.
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
