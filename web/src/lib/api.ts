import axios, { AxiosError } from 'axios'
import { skewFromHeader, useClockSkew } from '@/lib/vault/clockSkew'

/**
 * The application's single HTTP client.
 *
 * The base URL is RELATIVE, and that is ADR-016's decision: the API lives at `/api` of
 * the same origin that serves the SPA, so a `dist/` built once works served from any
 * hostname.
 *
 * It used to come from `VITE_API_URL`, which Vite substituted at build time and which
 * therefore ended up written inside the generated JavaScript: the artefact was specific
 * to one deployment. That broke when Tailscale arrived, which gives ONE DNS name per
 * machine — the same bundle had to answer over `evault.local` and over the tailnet's
 * name, and it could not. See ADR-016 §1 and issue #296.
 *
 * A consequence worth keeping in mind: the API is no longer reachable by a hostname of
 * its own. To talk to it outside the SPA one uses `https://<host>/api`, which is what
 * the SPA itself does.
 */
const baseURL = '/api'

export const api = axios.create({
  baseURL,
  headers: {
    // Without this Laravel can answer HTML on some errors, and the client would receive
    // a page where it expects JSON.
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

/**
 * Reads how far this device's clock is from the server's, off responses that were
 * coming anyway.
 *
 * IT IS HERE AND NOT IN A CALL OF ITS OWN because every response already carries a
 * `Date` header: this costs no request, no round trip and no change to any contract,
 * and it asks the server nothing. See `clockSkew.ts` for why the number matters — a
 * drifted clock produces TOTP codes that are correct for an instant that is not now,
 * and the symptom is «eVault is broken».
 *
 * ON ERRORS TOO, and that is not incidental: an expired session or a rate limit still
 * bring a response with its header, and a wrong clock does not fix itself while things
 * are going badly.
 *
 * NOTHING HERE FEEDS THE CODES. The skew is read to WARN and never to generate:
 * `totpCode` works off the local clock, always. Generating off the server's time would
 * tie the codes to there being a network — when TOTP exists precisely so there need not
 * be one — and would hide a clock that is breaking other things too.
 */
const noteClockSkew = (headers: unknown) => {
  const date = (headers as Record<string, unknown> | undefined)?.date
  const skew = skewFromHeader(date, Date.now())

  if (skew !== null) useClockSkew.getState().note(skew)
}

api.interceptors.response.use(
  (response) => {
    noteClockSkew(response.headers)

    return response
  },
  (error: unknown) => {
    if (error instanceof AxiosError) noteClockSkew(error.response?.headers)

    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  },
)

/**
 * The shape of the errors the API returns.
 *
 * It is the contract settled when issue #3 was closed: `message` for technical humans
 * and logs, `errors` keyed by field when they are validation errors.
 */
interface ErrorResponse {
  message?: string
  errors?: Record<string, string[]>
}

/**
 * An API error already interpreted, so that the screens do not have to rummage through
 * axios's structure.
 *
 * Important about the texts: the API's `message` values are for developers and are not
 * shown to the user. What gets shown is decided by the client, from the HTTP code and
 * the field key. See the contract comment in issue #5.
 */
export class ApiError extends Error {
  // Declared separately and not as constructor parameters with a modifier: the tsconfig
  // enables erasableSyntaxOnly, which forbids the TypeScript syntax that generates
  // runtime code instead of merely disappearing.
  readonly state: number | null
  readonly fieldErrors: Record<string, string[]>

  constructor(
    state: number | null,
    fieldErrors: Record<string, string[]>,
    technicalMessage: string,
  ) {
    super(technicalMessage)
    this.state = state
    this.fieldErrors = fieldErrors
    this.name = 'ApiError'
  }

  /** 422: the server refused some field. */
  get isValidation(): boolean {
    return this.state === 422
  }

  /** 401: wrong credentials or an invalid token. */
  get isCredentials(): boolean {
    return this.state === 401
  }

  /** No response: the API did not answer (down or no network). Since ADR-016 it shares
   *  an origin with the SPA, so CORS can no longer be the cause. */
  get isNetwork(): boolean {
    return this.state === null
  }
}

export function interpretError(error: unknown): ApiError {
  if (!(error instanceof AxiosError)) {
    return new ApiError(null, {}, error instanceof Error ? error.message : 'Error desconocido')
  }

  const response = error.response

  if (!response) {
    return new ApiError(null, {}, error.message)
  }

  const data = response.data as ErrorResponse | undefined

  return new ApiError(
    response.status,
    data?.errors ?? {},
    data?.message ?? error.message,
  )
}
