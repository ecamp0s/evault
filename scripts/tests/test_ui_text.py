#!/usr/bin/env python3
"""Tests for the visible-text dump, `scripts/ui-text.mjs`.

The first ones it has, and #323 is why: the tool arrived in Iteration 6 next to
`check-identifiers.py`, which did have tests, and it never got any of its own.
When the checker was retired this one stayed —it does not watch the language
rule, it compares interface text before and after a rename— so what was left was
a tool with a job and no net.

**And it is not a tool one can afford to have quietly broken.** It is what the
acceptance criterion of #320 rested on, and what said, six times over, that a
conversion changed no visible text. A dump that silently stopped seeing JSX
would answer «identical» to every question, which is the same failure as a grep
that skips a file with a NUL byte in it (#184): a reassuring zero.

    python3 -m unittest discover -s scripts/tests
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = ROOT / 'scripts' / 'ui-text.mjs'

# The dump needs TypeScript's own compiler, which lives in web/node_modules. Without
# `npm ci` there is nothing to parse with, and these tests would fail for a reason
# that has nothing to do with the tool. The tooling job installs it, so over there
# they do run: see the `repositorio` workflow.
TYPESCRIPT = ROOT / 'web' / 'node_modules' / 'typescript'


def dump(files: dict[str, str]) -> list[str]:
    """Runs the command over files written for the occasion, and returns its lines."""
    with tempfile.TemporaryDirectory() as directory:
        base = Path(directory)
        listing = []
        for name, content in files.items():
            target = base / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding='utf-8')
            listing.append(str(target))

        process = subprocess.run(
            ['node', str(SCRIPT)],
            input='\n'.join(listing),
            capture_output=True, text=True, cwd=ROOT,
        )

    if process.returncode != 0:
        raise AssertionError(process.stderr.strip())

    return process.stdout.split('\n')[:-1]


@unittest.skipUnless(TYPESCRIPT.exists(), 'hace falta npm ci en web/')
class WhatItDumps(unittest.TestCase):
    def test_it_dumps_a_string_literal(self):
        self.assertIn('Guardar', dump({'a.ts': "const label = 'Guardar'\n"}))

    def test_it_dumps_jsx_text(self):
        lines = dump({'a.tsx': 'export const A = () => <p>Tu vault está bloqueada</p>\n'})
        self.assertIn('Tu vault está bloqueada', lines)

    def test_it_dumps_the_pieces_of_a_template_split_by_an_interpolation(self):
        """This is the case that gives the tool its reason to exist — #115.

        A phrase broken across an interpolation is the one a line-by-line audit
        does not see, because neither half reads as a sentence.
        """
        lines = dump({'a.ts': 'const t = `Quedan ${n} segundos para el bloqueo`\n'})
        self.assertIn('Quedan ', lines)
        self.assertIn(' segundos para el bloqueo', lines)

    def test_it_does_not_dump_comments(self):
        """A regex would not tell them apart, and that is why this goes through the AST.

        If comments came out, the six conversion layers of #290 would each have
        shown thousands of differences and the comparison would have been useless.
        """
        lines = dump({'a.ts': "// Guardar la entrada\nconst x = 1\n"})
        # An empty dump still prints one empty line, so what is asserted is that
        # nothing was found and not that the output is zero bytes.
        self.assertEqual([line for line in lines if line], [])


@unittest.skipUnless(TYPESCRIPT.exists(), 'hace falta npm ci en web/')
class HowItAnswers(unittest.TestCase):
    def test_the_output_is_sorted_so_moving_a_string_is_not_a_difference(self):
        lines = dump({'a.tsx': "const a = 'zeta'\nconst b = 'alfa'\n"})
        self.assertEqual(lines, sorted(lines))

    def test_it_reads_several_files_into_a_single_dump(self):
        lines = dump({'a.ts': "const a = 'uno'\n", 'b.ts': "const b = 'dos'\n"})
        self.assertIn('uno', lines)
        self.assertIn('dos', lines)

    def test_a_file_that_does_not_parse_fails_instead_of_dumping_less(self):
        """The failure mode that matters: a shorter dump looks exactly like no change.

        Anything that stops it from measuring has to be loud, because the answer
        it gives —«identical»— is the same one a correct run gives.
        """
        with self.assertRaises(AssertionError) as caught:
            dump({'a.ts': 'const x = (((\n'})
        self.assertIn('no se pudo parsear', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
