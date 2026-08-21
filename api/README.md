# eVault — the API

The Laravel API. **It stores ciphertext it cannot open**, and that is the whole
of its job: under the zero-knowledge model of
[ADR-001](../docs/architecture/decisions/ADR-001-zero-knowledge.md) the
encryption happens in the browser, so what arrives here is an opaque blob. The
server never sees a master password, a vault key or the contents of an item.

What it does hold is what it needs to route and authorise: accounts, vaults,
memberships, and each item's ciphertext with its nonce. For what the product does
and what it guarantees, see the [root README](../README.md).

## Running it

Needs **PHP 8.4** and Composer. No database server required: it defaults to
SQLite.

```bash
composer install && cp .env.example .env && php artisan key:generate && php artisan migrate && php artisan serve
```

`migrate` will notice that `database/database.sqlite` does not exist yet and
offer to create it — accept.

`php artisan serve` is for development only. A deployment goes behind Caddy;
see [docs/operations/DEPLOYMENT.md](../docs/operations/DEPLOYMENT.md).

## The commands

| | |
|---|---|
| `php artisan test` | the suite, Pest against in-memory SQLite |
| `composer analyse` | Larastan at level `max`, no baseline |
| `php artisan migrate:fresh --seed` | a database from scratch |
| `php artisan evault:backup` | a backup that restores across MySQL and SQLite alike |
| `php artisan evault:restore` | and its other half |

The tests never touch the development database: they run on in-memory SQLite.

## Where things are

| | |
|---|---|
| `app/Application/` | the application services — `Auth`, `Vaults`, `Backup`. Each one has a `handle()` taking explicit ids and never reads the session |
| `app/Http/` | controllers, form requests, resources and middleware |
| `app/Models/` | `User`, `Vault`, `VaultItem`, `VaultMember` |
| `routes/api.php` | every route, all of them under `/api` |
| `tests/Feature/` | the suite, including the cross-tenant isolation tests |

The tenant context travels **explicitly in every call** and never in the session,
because the API is stateless — that is
[ADR-004](../docs/architecture/decisions/ADR-004-multi-tenancy-sin-spatie-teams.md),
and it is a deliberate divergence from the project this pattern comes from.

## Two things worth knowing before changing something here

**The migration filenames are not renamed.** Laravel stores the full string as a
value in the `migrations` table and uses it to know what has been applied, so
renaming an already-run migration makes it believe there is a new one pending and
that the applied one vanished. On a clean database nothing happens; on a deployed
instance it does. Decided in #160.

**The API emits no CORS headers, and `tests/Feature/ApiCorsTest.php` checks
exactly that.** Since [ADR-016](../docs/architecture/decisions/ADR-016-un-solo-origen-para-la-spa-y-la-api.md)
the SPA and the API share an origin, so there is nothing to allow. That test was
kept when the configuration was removed on purpose: whoever meets a cross-origin
error in the future has a one-line remedy in front of them that works first time
and opens the API to any page in the victim's browser.

## Documentation

The project's documentation lives in [`docs/`](../docs/) and is written in
Spanish. Code — identifiers, comments and test names — is in English; the text
the user reads is in Spanish. Start at [docs/README.md](../docs/README.md), and
read [docs/architecture/FOUNDATION.md](../docs/architecture/FOUNDATION.md) before
touching the data model.
