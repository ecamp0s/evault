# eVault

A **zero-knowledge** password manager: encryption happens in your browser, and
the server only ever stores ciphertext it cannot open. Not the operator, not
someone with database access, not someone intercepting traffic.

> **About this project.** It is not a commercial product and does not aim to be.
> It started as a personal tool and is built in the open with two goals: to run
> it myself on my own instance, and to make the code and the reasoning behind it
> readable. It is designed to be self-hosted.

<!--
  MAIN SCREENSHOT — pending.
  Vault list with several items, dark theme, captured on localhost:5173.
  Save to docs/assets/vault.png and replace this comment with:
  ![The eVault item list](docs/assets/vault.png)
-->

<!--
  DEMO — pending deployment. Replace with:
  ## Live demo
  A demo instance runs at https://demo.yourdomain.app
  All data is fictional and is wiped automatically. Do not enter real
  passwords: it is a public demo.
-->

---

## What it does

- **An encrypted personal vault.** Create, edit, delete and search credentials.
  Everything meaningful — service name, username, password, URL and notes —
  travels encrypted, and the server never sees any of it in plaintext.
- **A password generator** with control over length and character sets.
- **Clipboard copy** without the password ever being rendered on screen.
- **Automatic locking.** Reloading the page locks the vault, because the
  encryption key lives in memory only and is never persisted anywhere.
- **A recovery key.** A 256-bit secret, generated in your browser, that wraps the
  same vault key your master password wraps. Lose the password and you still get
  in — without the server ever holding anything it could open.
- **Changing the master password**, which is instant no matter how large the
  vault: nothing is re-encrypted, only re-wrapped.
- **Export and import.** An encrypted `.evault` file for backups and for moving
  between instances, and plain CSV so you can leave for another manager.
- **Server-side backups.** Two Artisan commands, `evault:backup` and
  `evault:restore`, in a format that restores across MySQL and SQLite alike.

## The security guarantee, concretely

This is the part that actually defines the project, so it is worth being precise
about what is promised and what is not.

**Your master password never leaves the device.** The browser derives two
separate values from it using PBKDF2-HMAC-SHA256 with 600,000 iterations, which
is OWASP's recommendation for this combination:

1. A **master key**, which stays in memory and never travels.
2. An **authentication hash**, derived from the master key using the password as
   salt, which is the only thing sent to the server. Reversing it would mean
   reversing HMAC-SHA256, so the server can verify who you are without ever being
   able to derive your key.

**The master key does not encrypt your data.** It wraps a random 256-bit vault
key, and that is what encrypts the content with AES-256-GCM. This indirection
buys two things: changing the master password becomes re-wrapping 32 bytes rather
than re-encrypting the entire vault, and sharing a vault between several people
fits the model without redesigning it — the same key is wrapped once per member.

**The server stores no readable metadata.** The `vault_items` table has no column
for name, username or URL. If the service name travelled in plaintext, the server
would know which sites you hold accounts with, which is precisely the metadata a
password manager must not leak. All the server knows is how many items exist and
when they were last touched.

**The session token is never persisted.** Not in `localStorage`, not in
`sessionStorage`, not in cookies, not in IndexedDB. The reason is not that
`localStorage` is insecure in the abstract, but that the encryption key cannot be
persisted by any means: a reload requires re-entering the master password
regardless, so persisting the token would only keep alive a session incapable of
displaying anything.

### Verify it yourself

None of the above has to be taken on trust. With the project running:

```bash
# Save a credential through the UI, then look at what reached the database.
# None of the strings you typed appear anywhere.
php artisan tinker --execute="dd(DB::table('vault_items')->first());"
```

And in your browser's developer tools: the network tab shows that the registration
and login request bodies carry a base64 hash where the password would be expected,
and the storage tab shows no token saved anywhere.

### What this does not protect against

No browser-based password manager protects against a compromised server serving
modified JavaScript: whoever controls the code running in your browser can capture
the master password before any derivation happens. Client-side encryption protects
the database and the traffic, not the integrity of the delivered code. This is the
underlying reason serious password managers ship a browser extension and a native
app, whose code is signed and distributed through a store.

## Architecture

A monorepo holding two projects that deploy separately and communicate only over
HTTP with bearer tokens:

| Directory | Contents |
|---|---|
| `api/` | Laravel 13 — stateless REST API |
| `web/` | React 19 — the SPA where all cryptography happens |
| `docs/` | Architecture, decisions and planning |

The API holds no session: vault context travels explicitly on every request, and
services validate membership without consulting any server-side state.
Authentication uses bearer tokens rather than cookies, which is what will let a
native app or a browser extension consume the same API unchanged.

### Decisions

Architecture decisions are recorded as ADRs, each with the alternatives that were
rejected and why. They are immutable: when a decision changes, a new ADR
supersedes the old one rather than editing it.

| ADR | Decision |
|---|---|
| [001](docs/architecture/decisions/ADR-001-zero-knowledge.md) | Zero-knowledge: encryption happens on the client |
| [002](docs/architecture/decisions/ADR-002-react-vault-filament-admin.md) | React for the vault, since server-side rendering would break the guarantee |
| [003](docs/architecture/decisions/ADR-003-monorepo-api-y-spa.md) | Monorepo with separate API and SPA |
| [004](docs/architecture/decisions/ADR-004-multi-tenancy-sin-spatie-teams.md) | Multi-tenancy with explicit context, without Spatie teams |
| [005](docs/architecture/decisions/ADR-005-arquitectura-self-hosteable.md) | Self-hostable from the first commit |
| [006](docs/architecture/decisions/ADR-006-typescript-6.md) | TypeScript 6 rather than 7, with a concrete blocker behind it |
| [007](docs/architecture/decisions/ADR-007-token-de-sesion-en-memoria.md) | The session token lives in memory only |
| [008](docs/architecture/decisions/ADR-008-arquitectura-de-claves.md) | Key architecture: a master key that wraps a vault key |
| [009](docs/architecture/decisions/ADR-009-proyecto-personal-y-publico.md) | No longer a SaaS: a self-hosted personal instance and a public repository |
| [010](docs/architecture/decisions/ADR-010-clave-de-recuperacion.md) | A recovery key that wraps the same vault key, so losing the master password has a way out |
| [011](docs/architecture/decisions/ADR-011-formato-de-export-e-import.md) | Export and import: an encrypted, self-describing backup format, and plain CSV so you can leave |
| [012](docs/architecture/decisions/ADR-012-estrategia-de-despliegue.md) | Deployment: Docker Compose over a private network, because HTTPS is a requirement for the app to run at all — not a hardening step |

## Stack

**API** — PHP 8.4, Laravel 13, Sanctum, MySQL 8 or SQLite. Tests with Pest 5,
static analysis with Larastan at level `max` with no baseline.

**Web** — React 19, TypeScript 6, Vite 8, Tailwind 4 with shadcn/ui, TanStack
Query, Zustand, Zod and React Router 8. Tests with Vitest 4 and Testing Library.

**Cryptography** — the browser's native WebCrypto, with no third-party
dependencies. PBKDF2-HMAC-SHA256 at 600,000 iterations and AES-256-GCM. Argon2id
was rejected because it would require third-party WebAssembly executing in the
same origin that holds the key, and that attack surface does not pay for the
improvement.

## Running it locally

### With Docker (recommended)

The only requirement is Docker. Nothing else — no PHP, no Composer, no Node, no
database server on your machine.

```bash
git clone git@github.com:ecamp0s/evault.git && cd evault && docker compose up --build
```

Then open **http://app.evault.localhost** and register. The application key,
the `.env` files and the database migrations are all handled on first boot, so
there is no setup step to forget.

> **Why that hostname and not `localhost:8080`.** The Web Crypto API only exists in
> secure contexts. The spec treats any host ending in `.localhost` as trustworthy,
> so `crypto.subtle` is available over plain `http` with no certificate. On a
> hostname without that property there is no registration, no login and no
> encryption at all — see [ADR-012](docs/architecture/decisions/ADR-012-estrategia-de-despliegue.md).

If port 80 is already taken on your machine, set another one — the API URL is baked
into the frontend at build time, so this needs a rebuild rather than just a restart:

```bash
HTTP_PORT=8090 docker compose up --build
```

The app is then at `http://app.evault.localhost:8090`. Copy `.env.example` to `.env`
to make it permanent.

Deploying this to an actual server is a different matter, and TLS stops being
optional there. That is
[ADR-012](docs/architecture/decisions/ADR-012-estrategia-de-despliegue.md).

### Without Docker

Requirements: PHP 8.4, Composer, and **Node 24 or newer** — the 23.x line does not
satisfy the engine ranges several dependencies declare, and `npm install` will warn
repeatedly. There is an `.nvmrc`, so `nvm use` inside `web/` picks the right one. No
database server needed: it defaults to SQLite.

```bash
git clone git@github.com:ecamp0s/evault.git && cd evault
```

```bash
cd api && composer install && cp .env.example .env && php artisan key:generate && php artisan migrate && php artisan serve
```

`migrate` will notice that `database/database.sqlite` does not exist yet and offer
to create it — accept, the default is yes.

In a second terminal:

```bash
cd web && npm install && cp .env.example .env && npm run dev
```

Open **http://localhost:5173** and register.

> **Do not skip `cp .env.example .env`.** The SPA reads the API URL from the
> environment and refuses to start without it. If you skip it, the dev server stops
> with an explanation rather than serving a broken page.

> **The hostname matters.** The Web Crypto API only exists in secure contexts, so
> over plain `http://` the application needs a host that is `localhost` or ends in
> `.localhost` — otherwise there is no registration, no login and no encryption.
> Both are treated as trustworthy by the spec, which is why `app.evault.localhost`
> works without a certificate and why this project's own environment uses it. Any
> other hostname needs HTTPS.

### Filling it with something to look at

A brand new vault is empty, which makes it hard to tell what the thing actually
does. There is a sample vault in the repository:

**[`examples/sample-vault.evault`](examples/sample-vault.evault)** — seven made-up
credentials. Register with any email and password you like, then **Import** on the
empty vault screen, pick that file, and use this as the file password:

```
evault-sample-do-not-reuse
```

It is a throwaway password for a file full of fake data. Do not reuse it for
anything, and do not put real passwords in a vault you unlocked with a password
published on the internet.

**And here is the part worth pausing on.** The obvious way to ship sample data
would be a database seeder. That is impossible here, and not as an oversight — the
server *cannot* create a vault entry with content in it. Encryption happens in your
browser with a key derived from a password the server never sees, so there is
nothing it could encrypt with. The project's own `DatabaseSeeder` says as much
without saying it: it creates a user with an empty vault, because that is all it
can do.

So the only way to hand you sample data is to hand you an encrypted file and the
password that opens it. The mechanism is the same export any user can produce, and
the same import that reads it back. If you want one concrete demonstration that the
zero-knowledge claim on this page is structural rather than decorative, it is this
one: not even the author can put data in your database.

## Quality

| | |
|---|---|
| API tests | 230, Pest against in-memory SQLite |
| Web tests | 367, Vitest and Testing Library |
| Static analysis | Larastan at level `max`, no baseline |
| CI | Lint, build, tests and analysis on every PR |

```bash
cd api && php artisan test && composer analyse
cd web && npm run test:run && npm run lint
```

Two rules followed here explain part of the suite: when the interface makes a
promise about security, a test is written that fails if that promise stops being
true; and watching a test pass is not treated as evidence that it works, so
critical tests are verified by deliberately breaking the code. That check has
already exposed tests that detected nothing.

## What it doesn't do, and why

- **The server still cannot recover your master password.** That is not a missing
  feature, it is a direct consequence of the model: if the server could help you
  recover access, it could gain access itself. The recovery key is the mitigation,
  and it works precisely because the server plays no part in it — the key is
  generated in your browser and the server only ever stores what that key wraps.
  Lose both the password and the recovery key and the data is gone, by design.
- **Rotating the master password does not revoke the recovery key.** This is
  worth stating plainly because it is counter-intuitive. The vault key does not
  change when you rotate, so the recovery wrapper still opens. If you suspect the
  recovery key was compromised, generate a new one — changing your password is not
  enough. The UI says so where it matters.
- **There are no shared vaults or organisations.** The data model accommodates
  them without redesign, but they require asymmetric cryptography and there are
  no users who need them.
- **There are no native apps or browser extension** yet. The API is ready for
  them: token authentication and configurable origins.
- **There is no admin panel.** It was dropped once this stopped being a product
  with users to administer.

## Documentation

| Document | What it is |
|---|---|
| [docs/README.md](docs/README.md) | Index and reading order |
| [docs/architecture/FOUNDATION.md](docs/architecture/FOUNDATION.md) | Data model and the encrypted payload contract |
| [docs/architecture/decisions/](docs/architecture/decisions/) | The eleven ADRs |
| [docs/development/SETUP.md](docs/development/SETUP.md) | Detailed development environment |
| [docs/planning/](docs/planning/) | Backlog, status and iteration history |

Note: this README is in English; the documentation it links to is written in
Spanish, as is the prose throughout the codebase. Identifiers, filenames and
types are in English.

## License

MIT — see [LICENSE](LICENSE).
