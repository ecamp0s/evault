import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { ApiError, api, interpretError } from './api'
import { useClockSkew } from '@/lib/vault/clockSkew'

/**
 * Builds an AxiosError with a response, like the one produced by a request that reached
 * the server and came back with an error code.
 */
function errorWithResponse(state: number, data: unknown): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = {
    status: state,
    statusText: '',
    data: data,
    headers,
    config: { headers },
  }

  return error
}

describe('interpretError', () => {
  it('pulls the per-field errors out of a 422', () => {
    const result = interpretError(
      errorWithResponse(422, {
        message: 'The email has already been taken.',
        errors: { email: ['The email has already been taken.'] },
      }),
    )

    expect(result).toBeInstanceOf(ApiError)
    expect(result.state).toBe(422)
    expect(result.isValidation).toBe(true)
    expect(result.fieldErrors).toEqual({
      email: ['The email has already been taken.'],
    })
  })

  it('recognises a 401 as a credentials error', () => {
    const result = interpretError(
      errorWithResponse(401, { message: 'Las credenciales no son válidas.' }),
    )

    expect(result.isCredentials).toBe(true)
    expect(result.isValidation).toBe(false)
    expect(result.fieldErrors).toEqual({})
  })

  /*
   * The case that gets forgotten most: the request did not even arrive. It happens with
   * the API down or with no network at all, and it has to be told apart from a server
   * error because the message to the user is a different one.
   */
  it('treats the absence of a response as a network error', () => {
    const withoutResponse = new AxiosError('Network Error')

    const result = interpretError(withoutResponse)

    expect(result.isNetwork).toBe(true)
    expect(result.state).toBeNull()
    expect(result.isCredentials).toBe(false)
  })

  it('wraps an error that does not come from axios', () => {
    const result = interpretError(new Error('algo se rompió'))

    expect(result).toBeInstanceOf(ApiError)
    expect(result.isNetwork).toBe(true)
    expect(result.message).toBe('algo se rompió')
  })

  it('wraps something that is not even an Error', () => {
    const result = interpretError('una cadena suelta')

    expect(result).toBeInstanceOf(ApiError)
    expect(result.state).toBeNull()
  })

  it('does not break if the error body comes in empty', () => {
    const result = interpretError(errorWithResponse(500, undefined))

    expect(result.state).toBe(500)
    expect(result.fieldErrors).toEqual({})
    expect(result.isValidation).toBe(false)
    expect(result.isNetwork).toBe(false)
  })
})

/**
 * THE INTERCEPTOR THAT READS THE CLOCK, and why it is worth a test of its own.
 *
 * A drifted device produces TOTP codes that are correct for an instant that is not now,
 * and every service rejects them. `ADR-017` §5.4 asked that the implementation be able to
 * tell that apart from eVault being broken, and the whole mechanism is this: reading the
 * `Date` header of responses that were coming anyway.
 *
 * The interceptor is registered when the module loads, so these cases drive it through
 * the real `api` instance instead of reimplementing it.
 */
describe('reading the clock off the responses', () => {
  const SERVER = 'Mon, 01 Sep 2026 10:00:00 GMT'

  beforeEach(() => {
    useClockSkew.setState({ skewMs: null })
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse(SERVER) + 90_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Runs a response through the interceptors the module registered on `api`. */
  const throughInterceptor = async (headers: Record<string, string>) => {
    const handlers = (api.interceptors.response as unknown as {
      handlers: { fulfilled: (r: unknown) => unknown }[]
    }).handlers

    for (const handler of handlers) await handler.fulfilled({ headers })
  }

  it('notes how far this device is from the server', async () => {
    await throughInterceptor({ date: SERVER })

    expect(useClockSkew.getState().skewMs).toBe(90_000)
  })

  /*
   * A response with no readable header leaves the skew as it was rather than writing a
   * zero: a zero would state that the clocks agree, which is exactly what has not been
   * measured.
   */
  it('leaves it alone when there is no header to read', async () => {
    await throughInterceptor({})

    expect(useClockSkew.getState().skewMs).toBeNull()
  })
})
