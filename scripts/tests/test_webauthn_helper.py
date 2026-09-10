#!/usr/bin/env python3
"""Tests for the virtual-authenticator helper, `scripts/browser/webauthn.mjs`.

What is tested here is the part that decides, not the part that drives a browser:
what options the authenticator is asked for, and whether it is taken away when the
work fails. Driving Chromium belongs to `verify-passkey.mjs`.

**Why the removal deserves a test of its own.** A browser left with an authenticator
attached makes the NEXT case pass for the wrong reason — it finds credentials nobody
registered in it — and that surfaces as an unrelated check being mysteriously green.
It is the same family as the reassuring zero of #184: a result that looks like
success and means nothing.

**And why the options do.** `hasPrf` is the whole point of the file, and
`hasUserVerification` is what `ADR-021` §2.4 rests on: without it a virtual
authenticator would happily answer without verifying anybody, and a check built on
that would be agreeing with the code for the wrong reason (#265). These are pinned
against literal values, not against the constant, so moving one has to break a test —
the failure ADR-018 §4 warns about and that the nineteen tests on SHORT_BELOW cost
this project once.

    python3 -m unittest discover -s scripts/tests
"""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
HELPER = ROOT / 'scripts' / 'browser' / 'webauthn.mjs'


def run_node(script: str) -> dict:
    """Runs a snippet against the helper with a fake CDP session, and reads its JSON."""
    finished = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True,
        text=True,
        cwd=ROOT,
        timeout=60,
    )

    if finished.returncode != 0:
        raise AssertionError(f'node failed: {finished.stderr}')

    return json.loads(finished.stdout)


FAKE_SESSION = """
import { withVirtualAuthenticator, PASSKEY_AUTHENTICATOR } from './scripts/browser/webauthn.mjs'

const calls = []
const session = {
  send: (method, params) => {
    calls.push({ method, params })
    return Promise.resolve(method === 'WebAuthn.addVirtualAuthenticator'
      ? { authenticatorId: 'auth-1' }
      : {})
  },
}
"""


class VirtualAuthenticatorOptions(unittest.TestCase):
    def test_asks_for_prf(self) -> None:
        """Without this the whole file is pointless: no PRF, nothing to derive from."""
        result = run_node(FAKE_SESSION + """
        await withVirtualAuthenticator(session, async () => {})
        const added = calls.find((c) => c.method === 'WebAuthn.addVirtualAuthenticator')
        console.log(JSON.stringify(added.params.options))
        """)

        self.assertIs(result['hasPrf'], True)

    def test_asks_for_user_verification(self) -> None:
        """ADR-021 §2.4 rests on the authenticator having verified the user.

        An authenticator that answers without verifying anybody would let a check pass
        over a guarantee that was not being exercised.
        """
        result = run_node(FAKE_SESSION + """
        await withVirtualAuthenticator(session, async () => {})
        const added = calls.find((c) => c.method === 'WebAuthn.addVirtualAuthenticator')
        console.log(JSON.stringify(added.params.options))
        """)

        self.assertIs(result['hasUserVerification'], True)
        self.assertIs(result['isUserVerified'], True)

    def test_asks_for_a_resident_key(self) -> None:
        """`residentKey: 'required'` is what lets a device find a credential it never
        registered — the criterion that proves keeping the wrapper on the server was
        right. Without this the browser refuses the call."""
        result = run_node(FAKE_SESSION + """
        await withVirtualAuthenticator(session, async () => {})
        const added = calls.find((c) => c.method === 'WebAuthn.addVirtualAuthenticator')
        console.log(JSON.stringify(added.params.options))
        """)

        self.assertIs(result['hasResidentKey'], True)

    def test_is_a_platform_authenticator(self) -> None:
        """`internal` and not `usb`: iOS passes no extension data to external keys, so
        a `usb` authenticator with PRF would model a combination that does not exist on
        the device this is for."""
        result = run_node(FAKE_SESSION + """
        await withVirtualAuthenticator(session, async () => {})
        const added = calls.find((c) => c.method === 'WebAuthn.addVirtualAuthenticator')
        console.log(JSON.stringify(added.params.options))
        """)

        self.assertEqual(result['transport'], 'internal')


class TheAuthenticatorIsAlwaysRemoved(unittest.TestCase):
    def test_removed_after_the_work_succeeds(self) -> None:
        result = run_node(FAKE_SESSION + """
        await withVirtualAuthenticator(session, async () => 'listo')
        console.log(JSON.stringify(calls.map((c) => c.method)))
        """)

        self.assertIn('WebAuthn.removeVirtualAuthenticator', result)

    def test_removed_when_the_work_throws(self) -> None:
        """The one that matters. A failure mid-way must not leave the browser holding
        credentials that make the next case green for the wrong reason."""
        result = run_node(FAKE_SESSION + """
        await withVirtualAuthenticator(session, async () => { throw new Error('falló') })
          .catch(() => {})
        console.log(JSON.stringify(calls.map((c) => c.method)))
        """)

        self.assertIn('WebAuthn.removeVirtualAuthenticator', result)

    def test_the_original_failure_is_the_one_that_travels(self) -> None:
        """Cleanup must not replace the real error with a confusing one about cleanup."""
        result = run_node(FAKE_SESSION + """
        const failure = await withVirtualAuthenticator(session, async () => {
          throw new Error('lo que de verdad falló')
        }).catch((error) => error.message)
        console.log(JSON.stringify({ failure }))
        """)

        self.assertEqual(result['failure'], 'lo que de verdad falló')

    def test_a_session_that_is_already_gone_does_not_mask_the_failure(self) -> None:
        """Removing over a closed session throws, and that must not become the error the
        caller sees."""
        result = run_node("""
        import { withVirtualAuthenticator } from './scripts/browser/webauthn.mjs'

        const session = {
          send: (method) => {
            if (method === 'WebAuthn.addVirtualAuthenticator') {
              return Promise.resolve({ authenticatorId: 'auth-1' })
            }
            if (method.startsWith('WebAuthn.remove') || method === 'WebAuthn.disable') {
              return Promise.reject(new Error('la sesión ya estaba cerrada'))
            }
            return Promise.resolve({})
          },
        }

        const failure = await withVirtualAuthenticator(session, async () => {
          throw new Error('lo que de verdad falló')
        }).catch((error) => error.message)
        console.log(JSON.stringify({ failure }))
        """)

        self.assertEqual(result['failure'], 'lo que de verdad falló')

    def test_the_returned_value_travels(self) -> None:
        result = run_node(FAKE_SESSION + """
        const value = await withVirtualAuthenticator(session, async (id) => id)
        console.log(JSON.stringify({ value }))
        """)

        self.assertEqual(result['value'], 'auth-1')


if __name__ == '__main__':
    unittest.main()
