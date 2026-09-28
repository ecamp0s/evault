<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Application\Auth\ListSessions;
use App\Application\Auth\RevokeOtherSessions;
use App\Application\Auth\RevokeSession;
use App\Http\Controllers\Controller;
use App\Http\Resources\SessionResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The account's open sessions: list them, close one, or close all the others
 * (ADR-018 §2.5, #711).
 *
 * The current token always has an id here, for the reason AuthController::logout
 * writes down: there is no session guard that could produce a TransientToken.
 */
final class SessionController extends Controller
{
    public function index(Request $request, ListSessions $listSessions): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        $sessions = $listSessions->handle($user->id, $user->currentAccessToken()->id);

        return response()->json(['data' => SessionResource::collection($sessions)]);
    }

    public function destroy(Request $request, int $session, RevokeSession $revokeSession): Response
    {
        $revokeSession->handle($this->authenticatedUser($request)->id, $session);

        return response()->noContent();
    }

    public function destroyOthers(Request $request, RevokeOtherSessions $revokeOtherSessions): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        $closed = $revokeOtherSessions->handle($user->id, $user->currentAccessToken()->id);

        return response()->json(['data' => ['closed' => $closed]]);
    }
}
