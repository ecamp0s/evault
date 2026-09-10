/**
 * A virtual authenticator with PRF, over the Chrome DevTools Protocol.
 *
 * WHY THIS EXISTS AND WHAT IT IS WORTH. Everything about the passkey up to now has been
 * tested against a double written by hand in the suite — one that returns the bytes we
 * decided it should. That proves what our code does WITH an answer; it proves nothing
 * about whether a real WebAuthn implementation gives that answer. jsdom has no
 * `navigator.credentials` and never will, so the only way to close that gap is a browser.
 *
 * CDP's `WebAuthn` domain has `hasPrf` since the extension shipped, so Chromium's own
 * implementation can be driven from a script with no extra dependency — which is what
 * keeps this in the same shape as the rest of `scripts/browser/`: the protocol raw, no
 * automation framework, nothing downloaded. See #281.
 *
 * WHAT IT STILL CANNOT SAY: that an iPhone behaves like this. A virtual authenticator is
 * Chromium's model of an authenticator, not Apple's, and iOS is documented to differ in
 * at least one way that matters (no extension data to external keys). That is why #568
 * ends on a real device and why this does not claim to replace it.
 */

/**
 * The authenticator this project needs, and every option is here because ADR-021 asks
 * for it rather than because it is a sensible default.
 *
 * `hasPrf` is the point of the file. `hasResidentKey` and `hasUserVerification` are what
 * `residentKey: 'required'` and `userVerification: 'required'` demand — without them the
 * browser refuses the call and the failure looks like our code being wrong. And
 * `isUserVerified` is what stands in for the finger: it says the verification SUCCEEDS,
 * which is the case worth automating; the one where somebody declines is a person
 * changing their mind and belongs in a unit test, not here.
 *
 * `internal` and not `usb`, because that is what a platform authenticator is — and
 * because iOS passes no extension data to external ones, so a `usb` authenticator with
 * PRF would be modelling a combination that does not exist on the device this is for.
 */
export const PASSKEY_AUTHENTICATOR = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  hasPrf: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
}

/**
 * Runs `work` with a virtual authenticator attached to this page, and takes it away
 * afterwards WHATEVER HAPPENS.
 *
 * The `finally` is not tidiness. A browser left with an authenticator attached makes the
 * next case pass for the wrong reason — it would find credentials nobody registered in
 * it — and that is the kind of failure that shows up as an unrelated test being
 * mysteriously green. The removal swallows its own errors because a session already
 * closed must not turn a real failure in `work` into a confusing one about cleanup.
 */
export async function withVirtualAuthenticator(session, work) {
  await session.send('WebAuthn.enable')

  const { authenticatorId } = await session.send('WebAuthn.addVirtualAuthenticator', {
    options: PASSKEY_AUTHENTICATOR,
  })

  try {
    return await work(authenticatorId)
  } finally {
    await session
      .send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
      .catch(() => {})
    await session.send('WebAuthn.disable').catch(() => {})
  }
}

/**
 * The credentials the virtual authenticator is holding.
 *
 * It is what lets a check say «the passkey was registered» without believing the
 * application's own screen about it — the browser is asked instead, which is a source
 * that cannot be wrong in the same direction as the code under test.
 */
export async function storedCredentials(session, authenticatorId) {
  const { credentials } = await session.send('WebAuthn.getCredentials', { authenticatorId })

  return credentials
}
