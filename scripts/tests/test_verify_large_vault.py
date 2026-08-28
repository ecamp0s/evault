#!/usr/bin/env python3
"""Tests for the limits of the large-vault bench, `scripts/browser/limits.mjs`.

What is tested here is the part that decides, not the part that drives a
browser: given a set of measurements, which findings come out and whether the
run goes red. The measuring itself needs Chromium, a dev server and an API, and
lives in `verify-large-vault.mjs --smoke`.

**Why this file exists at all.** #348 is a check written *before* the fixes it
watches, and the one thing it must not do is agree with whatever the code
happens to do. Two properties are worth pinning down so they cannot drift:

1. The measurements taken while planning Iteration 11 — the real ones, from a
   real vault of 370 entries — have to come out RED. A bench that goes green on
   the code it was written to measure is not measuring it.
2. A clock limit on its own must NOT fail the run. That asymmetry is the whole
   reason this is usable on more than one machine, and it is exactly the kind of
   rule someone tightens later "for consistency" without seeing what it costs.

    python3 -m unittest discover -s scripts/tests
"""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
LIMITS = ROOT / 'scripts' / 'browser' / 'limits.mjs'

# One real run of the bench against `master`, 21 August 2026, 370 entries. Not
# rounded and not hand-written: this is what the command printed, and it is the
# state of the code the bench was built to describe.
#
# The counts match the figures measured by hand while planning the iteration —
# 27.464 px, 7.839 nodes, two requests per delete, two per imported entry. The
# clocks do NOT: the import took 60 s here against 4 min 19 s by hand, on the
# same machine under a different load. Which is the case for the counts deciding
# and the clocks only informing, made by the numbers rather than argued.
AS_MEASURED = {
    'entries': 370,
    'small': {'totalMs': 978, 'paintMs': 94, 'searchMs': 26, 'domNodes': 279,
              'documentHeight': 900, 'rows': 10,
              'userMenu': {'found': True, 'top': 840, 'windowHeight': 900, 'insideWindow': True},
              'dialogFocus': {'returned': True, 'landedOn': 'Editar Banco'}},
    'large': {'totalMs': 1497, 'paintMs': 668, 'searchMs': 272, 'domNodes': 7839,
              'documentHeight': 27524, 'rows': 370,
              'userMenu': {'found': True, 'top': 27464, 'windowHeight': 900, 'insideWindow': False},
              # The focus did not come back, which is what #360 measured before fixing it.
              'dialogFocus': {'returned': False, 'landedOn': 'el body'}},
    'delete': {'requests': 2, 'ms': 437},
    'import': {'previewed': 370, 'requests': 740, 'ms': 60200},
}

# The same vault once Iteration 11 has done its work: the DOM no longer grows,
# writing costs one request, and the user menu is where a person can reach it.
AS_INTENDED = {
    'entries': 370,
    'small': {'totalMs': 980, 'paintMs': 20, 'searchMs': 18, 'domNodes': 279,
              'documentHeight': 900, 'rows': 10,
              'userMenu': {'found': True, 'top': 840, 'windowHeight': 900, 'insideWindow': True},
              'dialogFocus': {'returned': True, 'landedOn': 'Editar Banco'}},
    'large': {'totalMs': 1010, 'paintMs': 34, 'searchMs': 27, 'domNodes': 402,
              'documentHeight': 900, 'rows': 14,
              'userMenu': {'found': True, 'top': 840, 'windowHeight': 900, 'insideWindow': True},
              'dialogFocus': {'returned': True, 'landedOn': 'Editar Banco'}},
    'delete': {'requests': 1, 'ms': 120},
    'import': {'previewed': 370, 'requests': 371, 'ms': 9000},
}


def evaluate(measurements: dict) -> dict:
    """Runs the real module over measurements and returns its findings."""
    script = (
        f"import {{ evaluate, failed }} from {json.dumps(LIMITS.as_posix())}\n"
        f"const m = {json.dumps(measurements)}\n"
        "const findings = evaluate(m)\n"
        "console.log(JSON.stringify({ findings, failed: failed(findings) }))\n"
    )
    process = subprocess.run(
        ['node', '--input-type=module', '-e', script],
        capture_output=True, text=True, cwd=ROOT,
    )
    if process.returncode != 0:
        raise AssertionError(process.stderr.strip())

    return json.loads(process.stdout)


def find(result: dict, check_id: str) -> dict:
    return next(f for f in result['findings'] if f['id'] == check_id)


def altered(base: dict, **changes) -> dict:
    """A copy of `base` with one nested section replaced."""
    copy = json.loads(json.dumps(base))
    for section, values in changes.items():
        copy[section].update(values)
    return copy


class WhatItSaysAboutTheMeasuredVault(unittest.TestCase):
    """The state of the code when #348 was written. It has to be red."""

    def test_the_run_fails(self):
        self.assertTrue(evaluate(AS_MEASURED)['failed'])

    def test_every_defect_of_the_iteration_is_named(self):
        result = evaluate(AS_MEASURED)
        red = {f['id'] for f in result['findings'] if not f['ok']}
        self.assertEqual(
            red,
            {'user-menu', 'dom-growth', 'import-requests', 'delete-requests',
             'dialog-focus', 'paint-growth', 'search-growth'},
        )

    def test_it_says_how_far_the_user_menu_is(self):
        """A finding that does not carry its number cannot be acted on."""
        self.assertIn('27464', find(evaluate(AS_MEASURED), 'user-menu')['detail'])

    def test_it_says_how_many_requests_the_import_fired(self):
        detail = find(evaluate(AS_MEASURED), 'import-requests')['detail']
        self.assertIn('740', detail)
        self.assertIn('372', detail)


class WhatItSaysOnceTheWorkIsDone(unittest.TestCase):
    """And it has to be able to come out green, or it is an ornament."""

    def test_the_run_passes(self):
        result = evaluate(AS_INTENDED)
        self.assertFalse(result['failed'], msg=[f['detail'] for f in result['findings'] if not f['ok']])

    def test_nothing_is_red(self):
        self.assertTrue(all(f['ok'] for f in evaluate(AS_INTENDED)['findings']))


class WhichFindingsDecide(unittest.TestCase):
    """Counts decide; clocks inform. The asymmetry is the point, see limits.mjs."""

    def test_a_slow_machine_alone_does_not_fail_the_run(self):
        slow = altered(AS_INTENDED, large={**AS_INTENDED['large'], 'paintMs': 900, 'searchMs': 400})
        result = evaluate(slow)

        self.assertFalse(find(result, 'paint-growth')['ok'])
        self.assertFalse(find(result, 'search-growth')['ok'])
        self.assertFalse(result['failed'], 'a clock limit must not fail the run on its own')

    def test_a_count_alone_does_fail_the_run(self):
        regressed = altered(AS_INTENDED, delete={'requests': 2, 'ms': 120})
        self.assertTrue(evaluate(regressed)['failed'])

    def test_the_clock_findings_are_marked_as_not_deciding(self):
        result = evaluate(AS_INTENDED)
        deciding = {f['id'] for f in result['findings'] if f['structural']}
        self.assertEqual(
            deciding,
            {'user-menu', 'dom-growth', 'import-requests', 'delete-requests', 'dialog-focus'},
        )


class WhereTheLinesAre(unittest.TestCase):
    """The exact borders, because an off-by-one here reads as 'it works'."""

    def test_one_refresh_at_the_end_is_allowed(self):
        ok = altered(AS_INTENDED, **{'import': {'previewed': 370, 'requests': 372, 'ms': 9000}})
        self.assertTrue(find(evaluate(ok), 'import-requests')['ok'])

    def test_one_more_than_that_is_not(self):
        over = altered(AS_INTENDED, **{'import': {'previewed': 370, 'requests': 373, 'ms': 9000}})
        self.assertFalse(find(evaluate(over), 'import-requests')['ok'])

    def test_a_dom_that_doubles_passes_and_one_that_triples_does_not(self):
        doubled = altered(AS_INTENDED, large={**AS_INTENDED['large'], 'domNodes': 558})
        tripled = altered(AS_INTENDED, large={**AS_INTENDED['large'], 'domNodes': 838})

        self.assertTrue(find(evaluate(doubled), 'dom-growth')['ok'])
        self.assertFalse(find(evaluate(tripled), 'dom-growth')['ok'])

    def test_two_timings_under_the_noise_floor_are_not_divided(self):
        """4 ms against 11 is a ×2.8 made of scheduling jitter, not of work.

        Without this floor the check would start failing at random exactly when
        the list gets virtualised — which is the moment it is supposed to go
        green, and the surest way to teach someone to re-run it until it does.
        """
        jittery = altered(
            AS_INTENDED,
            small={**AS_INTENDED['small'], 'paintMs': 4},
            large={**AS_INTENDED['large'], 'paintMs': 11},
        )
        finding = find(evaluate(jittery), 'paint-growth')

        self.assertTrue(finding['ok'])
        # It says so instead of printing a ratio. Asserting the absence of «×» would
        # not work and would not mean much either: every detail ends with the margin
        # it was judged against, and that margin is written «×3».
        self.assertIn('sin nada que comparar', finding['detail'])

    def test_the_ceiling_fails_even_when_the_ratio_is_flat(self):
        """Both ends terrible keeps the ratio at 1, and that must not read as fine."""
        uniformly_slow = altered(
            AS_INTENDED,
            small={**AS_INTENDED['small'], 'paintMs': 3200},
            large={**AS_INTENDED['large'], 'paintMs': 3400},
        )
        self.assertFalse(find(evaluate(uniformly_slow), 'paint-growth')['ok'])


class WhatItAlwaysReports(unittest.TestCase):
    def test_a_passing_check_is_reported_too(self):
        """«Measured and fine» and «not measured» must not look alike in a report."""
        result = evaluate(AS_INTENDED)
        self.assertEqual(len(result['findings']), 7)
        for finding in result['findings']:
            self.assertTrue(finding['detail'], f'{finding["id"]} carries no number')
            self.assertTrue(finding['title'], f'{finding["id"]} has no title')


if __name__ == '__main__':
    unittest.main()
