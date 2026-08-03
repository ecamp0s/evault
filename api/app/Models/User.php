<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'recovery_auth_hash'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            /*
             * El hash de autenticación de recuperación se trata igual que el
             * normal: el servidor nunca guarda el valor que recibe. Ver ADR-010.
             */
            'recovery_auth_hash' => 'hashed',
        ];
    }

    /**
     * Los vaults a los que pertenece, sean personales o compartidos.
     *
     * Los dos extremos de la relación declaran las mismas columnas del pivot, y no
     * es duplicación evitable: withPivot solo afecta a la consulta que se lanza, así
     * que una columna declarada en Vault::members() no llega al leer desde aquí.
     * Omitirla no rompe nada visible, simplemente deja el valor a null, que es la
     * clase de fallo que aparece lejos de su causa.
     *
     * @return BelongsToMany<Vault, $this, VaultMember, 'pivot'>
     */
    public function vaults(): BelongsToMany
    {
        return $this->belongsToMany(Vault::class, 'vault_members')
            ->using(VaultMember::class)
            ->withPivot(
                'role',
                'wrapped_key',
                'wrapped_key_iv',
                'recovery_wrapped_key',
                'recovery_wrapped_key_iv',
            )
            ->withTimestamps();
    }

    /**
     * Su vault personal. Todo usuario tiene uno desde el registro, y el índice
     * único de la tabla garantiza que no puede tener dos.
     *
     * @return HasOne<Vault, $this>
     */
    public function personalVault(): HasOne
    {
        return $this->hasOne(Vault::class, 'personal_for_user_id');
    }
}
