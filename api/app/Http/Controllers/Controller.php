<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;

abstract class Controller
{
    /**
     * The user of an already authenticated request.
     *
     * The routes that call here sit behind auth:sanctum, so they never arrive without a
     * user. The check exists because the return type of user() does not guarantee it,
     * and narrowing it with an exception beats assuming it.
     *
     * @throws AuthenticationException
     */
    protected function authenticatedUser(Request $request): User
    {
        $user = $request->user();

        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        return $user;
    }
}
