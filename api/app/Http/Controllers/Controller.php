<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;

abstract class Controller
{
    /**
     * El usuario de una petición ya autenticada.
     *
     * Las rutas que llaman aquí van tras auth:sanctum, así que nunca llegan sin
     * usuario. La comprobación existe porque el tipo de retorno de user() no lo
     * garantiza, y estrecharlo con una excepción es preferible a asumirlo.
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
