<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Application\Auth\LoginUser;
use App\Application\Auth\LogoutUser;
use App\Application\Auth\RegisterUser;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Los cuatro endpoints del ciclo de autenticación. Aquí no hay lógica: se traduce
 * la petición a una llamada al servicio de aplicación y el resultado a JSON.
 */
final class AuthController extends Controller
{
    public function register(RegisterRequest $request, RegisterUser $registerUser): JsonResponse
    {
        $result = $registerUser->handle(
            name: $request->string('name')->toString(),
            email: $request->string('email')->toString(),
            password: $request->string('password')->toString(),
        );

        return response()->json([
            'data' => [
                'user' => UserResource::make($result->user),
                'token' => $result->token,
            ],
        ], 201);
    }

    public function login(LoginRequest $request, LoginUser $loginUser): JsonResponse
    {
        $result = $loginUser->handle(
            email: $request->string('email')->toString(),
            password: $request->string('password')->toString(),
        );

        return response()->json([
            'data' => [
                'user' => UserResource::make($result->user),
                'token' => $result->token,
            ],
        ]);
    }

    public function logout(Request $request, LogoutUser $logoutUser): Response
    {
        $user = $this->authenticatedUser($request);

        /*
         * Siempre es un PersonalAccessToken con identificador: config/sanctum.php
         * deja la lista de guards vacía, así que no hay autenticación por sesión
         * que pueda producir aquí un TransientToken, que es el otro caso posible y
         * el único que no tendría id. Hay un test que falla si eso cambia.
         */
        $logoutUser->handle($user->id, $user->currentAccessToken()->id);

        return response()->noContent();
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'data' => ['user' => UserResource::make($this->authenticatedUser($request))],
        ]);
    }

    /**
     * Las rutas que llaman aquí van tras auth:sanctum, así que nunca llegan sin
     * usuario. La comprobación existe porque el tipo de retorno de user() no lo
     * garantiza, y estrecharlo con una excepción es preferible a asumirlo.
     *
     * @throws AuthenticationException
     */
    private function authenticatedUser(Request $request): User
    {
        $user = $request->user();

        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        return $user;
    }
}
