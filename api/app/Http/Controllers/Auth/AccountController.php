<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Application\Auth\DeleteAccount;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\DeleteAccountRequest;
use Illuminate\Http\Response;

/**
 * Deleting the account. See ADR-024.
 *
 * No logic here: the proof of identity is checked by the service, where it cannot be
 * skipped (ADR-024 §4). The answer is 204 and the token that asked is already gone.
 */
final class AccountController extends Controller
{
    public function destroy(DeleteAccountRequest $request, DeleteAccount $deleteAccount): Response
    {
        $deleteAccount->handle(
            userId: $this->authenticatedUser($request)->id,
            authHash: $request->string('current_password')->toString(),
            email: $request->string('email')->toString(),
        );

        return response()->noContent();
    }
}
