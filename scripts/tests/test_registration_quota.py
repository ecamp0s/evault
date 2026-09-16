#!/usr/bin/env python3
"""Tests for the registration quota check, `checkRegistrationQuota` in scripts/browser/vault.mjs.

It exists because of #667: a verifier that ran out of the per-IP registration limit (#25)
failed minutes in, looking like the feature under test, and the limit it faced was written
wrong in three documents. What is tested here is the verdict — whether a run starts — from
what the API's headers say, with the API replaced by prepared answers. Whether a real API
answers with those headers is checked against one, in the PR of #667.

And the budget that keeps each verifier's declared count true: `register()` spends one
reserved registration per account, and fails a run that registers more than it declared.

    python3 -m unittest discover -s scripts/tests
"""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
HELPER = ROOT / 'scripts' / 'browser' / 'vault.mjs'


def run_node(script: str) -> dict:
    finished = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    if finished.returncode != 0:
        raise AssertionError(finished.stderr)
    return json.loads(finished.stdout.strip().splitlines()[-1])


def verdict(needed: int, *, status: int = 422, headers: dict | None = None, network_error: bool = False) -> dict:
    """Runs the check against one prepared answer and returns what it decided."""
    answer = 'throw new TypeError("fetch failed")' if network_error else (
        f'return new Response("{{}}", {{ status: {status}, headers: {json.dumps(headers or {})} }})'
    )
    return run_node(f"""
        import {{ checkRegistrationQuota }} from {json.dumps(HELPER.as_uri())}
        const calls = []
        const fetchImpl = async (url, init) => {{ calls.push({{ url, method: init.method, body: init.body }}); {answer} }}
        const result = await checkRegistrationQuota('http://localhost:5173', {needed}, fetchImpl)
        console.log(JSON.stringify({{ ...result, calls }}))
    """)


class TheVerdict(unittest.TestCase):
    def test_a_run_the_quota_holds_starts(self):
        result = verdict(8, headers={'X-RateLimit-Limit': '1000', 'X-RateLimit-Remaining': '998'})
        self.assertTrue(result['ok'])
        self.assertIn('998 of 1000', result['message'])

    def test_exactly_enough_is_enough(self):
        self.assertTrue(verdict(4, headers={'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '4'})['ok'])

    def test_one_short_does_not_start_and_says_what_to_do(self):
        result = verdict(4, headers={'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '3'})
        self.assertFalse(result['ok'])
        self.assertIn('registers 4', result['message'])
        self.assertIn('3 more', result['message'])
        self.assertIn('THROTTLE_REGISTER_ATTEMPTS', result['message'])
        self.assertIn('SETUP.md', result['message'])

    def test_an_exhausted_limit_says_how_long_to_wait(self):
        result = verdict(1, status=429, headers={'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '0', 'Retry-After': '1800'})
        self.assertFalse(result['ok'])
        self.assertIn('30 min', result['message'])

    def test_no_rate_limit_headers_is_not_read_as_plenty(self):
        """An answer without the headers is some other server, not a limit that is not there.

        Reading the absent headers as «no limit» would start a run against the wrong API,
        which is the reassuring zero this repository keeps finding.
        """
        result = verdict(1, status=404, headers={})
        self.assertFalse(result['ok'])
        self.assertIn('no rate-limit headers', result['message'])

    def test_no_answer_at_all_says_the_api_is_not_there(self):
        result = verdict(1, network_error=True)
        self.assertFalse(result['ok'])
        self.assertIn('does not answer', result['message'])

    def test_it_asks_the_registration_endpoint_with_an_empty_body(self):
        """An empty body is refused by validation, so no account is created to ask."""
        call = verdict(1, headers={'X-RateLimit-Limit': '10', 'X-RateLimit-Remaining': '9'})['calls'][0]
        self.assertEqual(call, {'url': 'http://localhost:5173/api/auth/register', 'method': 'POST', 'body': '{}'})


class TheBudget(unittest.TestCase):
    def spend(self, declared: int | None, registrations: int) -> dict:
        check = '' if declared is None else f"""
            await checkRegistrationQuota('http://x', {declared}, async () =>
              new Response('{{}}', {{ status: 422, headers: {{ 'X-RateLimit-Limit': '1000', 'X-RateLimit-Remaining': '999' }} }}))
        """
        return run_node(f"""
            import {{ checkRegistrationQuota, spendRegistration }} from {json.dumps(HELPER.as_uri())}
            {check}
            let spent = 0
            try {{
              for (let i = 0; i < {registrations}; i++) {{ spendRegistration(); spent++ }}
              console.log(JSON.stringify({{ spent, error: null }}))
            }} catch (error) {{
              console.log(JSON.stringify({{ spent, error: error.message }}))
            }}
        """)

    def test_a_run_may_register_what_it_declared(self):
        self.assertEqual(self.spend(3, 3), {'spent': 3, 'error': None})

    def test_one_more_than_declared_fails_at_that_registration(self):
        result = self.spend(3, 4)
        self.assertEqual(result['spent'], 3)
        self.assertIn('more accounts than it declared', result['error'])

    def test_without_a_check_nothing_is_limited(self):
        self.assertEqual(self.spend(None, 20), {'spent': 20, 'error': None})


if __name__ == '__main__':
    unittest.main()
