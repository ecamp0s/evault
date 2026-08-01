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
#[Hidden(['password', 'remember_token'])]
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
        ];
    }

    /**
     * Los vaults a los que pertenece, sean personales o compartidos.
     *
     * @return BelongsToMany<Vault, $this, VaultMember, 'pivot'>
     */
    public function vaults(): BelongsToMany
    {
        return $this->belongsToMany(Vault::class, 'vault_members')
            ->using(VaultMember::class)
            ->withPivot('role')
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
