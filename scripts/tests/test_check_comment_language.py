"""Tests for the comment-and-test-name language checker. See #291.

In English, unlike its neighbours in this directory, because the rule of 17 August
2026 applies to code written from then on — and a test file for the checker that
enforces that rule is the last place that should be exempt. The first draft of this
file was in Spanish and the checker flagged it, which is the best evidence it works.
"""

import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
COMMAND = ROOT / 'scripts' / 'check-comment-language.py'

_spec = importlib.util.spec_from_file_location('check_comment_language', COMMAND)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)


class SpanishDetection(unittest.TestCase):
    """What decides whether a line gets flagged."""

    def test_one_accent_is_enough(self):
        flagged, why = _module.is_spanish('la comprobacion se hace aqui'.replace('i', 'í', 1))
        self.assertTrue(flagged)
        self.assertIn('acento', why)

    def test_the_n_with_tilde_counts_too(self):
        self.assertTrue(_module.is_spanish('el año que viene')[0])

    def test_two_function_words_are_enough(self):
        flagged, why = _module.is_spanish('esto es para que se vea')
        self.assertTrue(flagged)
        self.assertIn('palabras', why)

    def test_a_single_function_word_is_not(self):
        """The threshold of two is what keeps false positives at zero."""
        self.assertFalse(_module.is_spanish('the parser reads del.txt and stops')[0])

    def test_ordinary_english_is_left_alone(self):
        for sentence in [
            'This is a comment about the vault key',
            'Returns null when the token has expired',
            'WHY THIS EXISTS: the previous version was born red',
            'no, son, hay, sin and con are ordinary English words',
            'The son of the parts is a strong code path',
        ]:
            with self.subTest(sentence=sentence):
                self.assertFalse(_module.is_spanish(sentence)[0], sentence)


class WhatCountsAsProse(unittest.TestCase):
    """Which lines yield text to inspect, and which do not."""

    def test_slash_comment(self):
        self.assertEqual(_module.candidates('  // hello there')[0][0], 'comentario')

    def test_hash_comment(self):
        self.assertEqual(_module.candidates('# a comment')[0][0], 'comentario')

    def test_block_continuation(self):
        self.assertEqual(_module.candidates(' * inside a block')[0][0], 'comentario')

    def test_python_docstring(self):
        """Python documents itself in docstrings, not in # comments."""
        self.assertEqual(_module.candidates('    """A summary line."""')[0][0], 'comentario')

    def test_test_name(self):
        kinds = [kind for kind, _ in _module.candidates("it('saves the new entry', () => {})")]
        self.assertIn('nombre de test', kinds)

    def test_python_test_name(self):
        kinds = [kind for kind, _ in _module.candidates('def test_saves_the_entry(self):')]
        self.assertIn('nombre de test', kinds)

    def test_plain_code_is_not_prose(self):
        self.assertEqual(_module.candidates('const total = items.length'), [])

    def test_an_empty_comment_yields_nothing(self):
        self.assertEqual(_module.candidates(' *'), [])


class WhichFilesAreInspected(unittest.TestCase):
    def test_code_files_are(self):
        for path in ['web/src/lib/api.ts', 'api/app/Models/User.php', 'scripts/x.py']:
            self.assertTrue(_module.looks_like_code(path), path)

    def test_documentation_is_not(self):
        """docs/ is Spanish on purpose: flagging it would be the worst false positive."""
        self.assertFalse(_module.looks_like_code('docs/planning/STATUS.md'))
        self.assertFalse(_module.looks_like_code('CLAUDE.md'))

    def test_dependencies_and_build_output_are_not(self):
        for path in ['web/node_modules/x/index.js', 'api/vendor/y/z.php', 'web/dist/a.js']:
            self.assertFalse(_module.looks_like_code(path), path)


class AgainstTheRealRepository(unittest.TestCase):
    """Where a badly chosen threshold actually shows."""

    def test_the_measurement_has_no_false_positives(self):
        """The number that decides whether anyone keeps running this. See #62."""
        result = subprocess.run(
            [sys.executable, str(COMMAND), '--measure'],
            capture_output=True, text=True, cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('falsos positivos 0.0 %', result.stdout)

    def test_over_the_whole_tree_it_still_sees_the_debt_of_290(self):
        """--all has to keep seeing what #290 is going to convert."""
        result = subprocess.run(
            [sys.executable, str(COMMAND), '--all'],
            capture_output=True, text=True, cwd=ROOT,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn('prosa en español', result.stderr)


if __name__ == '__main__':
    unittest.main()
