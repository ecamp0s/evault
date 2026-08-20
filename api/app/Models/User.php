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
             * The recovery authentication hash is treated like the ordinary one: the
             * server never stores the value it receives. See ADR-010.
             */
            'recovery_auth_hash' => 'hashed',
        ];
    }

    /**
     * The vaults they belong to, personal or shared.
     *
     * Both ends of the relation declare the same pivot columns, and it is not avoidable
     * duplication: withPivot only affects the query being fired, so a column declared
     * in Vault::members() does not arrive when reading from here. Leaving it out breaks
     * nothing visible, it simply leaves the value null, which is the kind of failure
     * that shows up far from its cause.
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
     * Their personal vault. Every user has one from sign-up, and the table's unique
     * index guarantees they cannot have two.
     *
     * @return HasOne<Vault, $this>
     */
    public function personalVault(): HasOne
    {
        return $this->hasOne(Vault::class, 'personal_for_user_id');
    }
}
