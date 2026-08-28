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

    def test_a_whole_spanish_sentence_with_no_accent_in_it(self):
        """#393, and the line is the one that was actually in the tree.

        `// Base UI compone con render y no con asChild como Radix.` sat in
        `UserMenu.tsx` while `--all` reported the tree clean, because not one of its
        words was on the list: `como`, `con`, `compone`, `y` and `no` were all missing.
        Spanish with no accent in it scored zero.

        Written with the real sentence and not a made-up one, because what has to keep
        working is this shape — a short technical line where the only Spanish is the
        joining words.
        """
        real = 'Base UI compone con `render` y no con `asChild` como Radix.'

        self.assertTrue(_module.is_spanish(real)[0], real)

    def test_the_word_list_does_not_flag_english_about_tailwind(self):
        """`y` is left out on purpose, and this is what it would have cost.

        `space-y-2` and `gap-y-4` are all over this codebase, and the word extractor
        sees a bare `y` inside them. Adding it was measured and it flagged nothing new,
        so it would have been cost with no benefit.
        """
        english = 'The list used to space them with `space-y-2` on the <ul>, which does nothing'

        self.assertFalse(_module.is_spanish(english)[0], english)

    def test_a_single_function_word_is_not(self):
        """The threshold of two is what keeps false positives at zero."""
        self.assertFalse(_module.is_spanish('the parser reads del.txt and stops')[0])

    def test_ordinary_english_is_left_alone(self):
        for sentence in [
            'This is a comment about the vault key',
            'Returns null when the token has expired',
            'WHY THIS EXISTS: the previous version was born red',
            'no, hay, sin and algo are ordinary English words',
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

    def test_an_executable_with_no_extension_is(self):
        """#324's blind spot, and it was a real one, not a hypothesis.

        `scripts/hooks/pre-push` carries no suffix, so deciding by extension left it
        out — and it sat in the tree with twenty Spanish comment lines while `--all`
        answered «sin problemas en el árbol entero». The reassuring zero of #184,
        this time inside the only checker the language rule has left.
        """
        self.assertTrue(_module.looks_like_code('scripts/hooks/pre-push'))

    def test_a_file_with_no_extension_and_no_shebang_is_not(self):
        """The shebang is what says «this is code», and guessing by name needs a list."""
        self.assertFalse(_module.looks_like_code('LICENSE'))
        self.assertFalse(_module.looks_like_code('docker/web/Caddyfile'))


class CountingComment(unittest.TestCase):
    """What the census counts, which is not the same as what the checker flags."""

    def test_it_counts_comment_lines_whatever_the_language(self):
        source = '// one\n// dos\nconst x = 1\n'
        self.assertEqual(_module.comment_lines(source), 2)

    def test_code_is_not_comment(self):
        self.assertEqual(_module.comment_lines('const x = 1\nreturn x\n'), 0)

    def test_test_names_are_left_out(self):
        """A test name never goes missing on its own: the test goes with it, and the
        suite says so louder than any census could."""
        self.assertEqual(_module.comment_lines("it('saves the entry', () => {})\n"), 0)

    def test_a_block_counts_its_closer_too(self):
        """Two lines of prose and the `*/`, which `COMMENT` reads as a comment holding
        a slash. Harmless for a comparison — both sides count it — and written down
        here so the absolute number is not mistaken for lines of prose."""
        source = '/**\n * why this is here\n * and why it stays\n */\n'
        self.assertEqual(_module.comment_lines(source), 3)


class HowMuchMayBeLost(unittest.TestCase):
    """The threshold, which was measured and not guessed. See #316."""

    def test_a_faithful_conversion_fits_under_it(self):
        """Measured on two real files: keyInMemory.ts lost 7,1 % and unlock.ts 0 %."""
        self.assertGreaterEqual(_module.allowed_loss(28), 2)

    def test_small_files_get_a_floor_and_not_just_a_percentage(self):
        """Without it, twelve comment lines could lose a whole block under 15 %."""
        self.assertEqual(_module.allowed_loss(4), _module.CENSUS_FLOOR)

    def test_a_deleted_block_does_not_fit_under_it(self):
        """The case the census exists for: six lines gone out of twenty-eight."""
        self.assertLess(_module.allowed_loss(28), 6)

    def test_the_allowance_grows_with_the_file(self):
        self.assertGreater(_module.allowed_loss(200), _module.allowed_loss(28))

    def test_the_escape_needs_a_reason(self):
        """A way out with no reason written is a way out that gets used by default."""
        self.assertIsNone(_module.CENSUS_ESCAPE.search('Censo:'))
        self.assertIsNotNone(_module.CENSUS_ESCAPE.search('Censo: el bloque se retira'))


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

    def test_over_the_whole_tree_it_finds_nothing_left(self):
        """INVERTED IN #323, and the inversion is the point of the iteration.

        It used to assert a return code of 1: `--all` had to keep seeing the 3.993
        lines #290 was going to convert, because a checker that stopped seeing a
        debt that was still there would be worse than none. The six layers
        converted them, so the same command now has to come back empty — and that
        is what the CI runs on every PR since this issue.

        If it ever goes red again, the question is not how to make it pass: it is
        which file went back to being written in Spanish.
        """
        result = subprocess.run(
            [sys.executable, str(COMMAND), '--all'],
            capture_output=True, text=True, cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_all_looks_at_a_file_that_git_does_not_track_yet(self):
        """#395, and the mirror of a hole this file had already closed once.

        `--all` walked `git ls-files`, which lists only what is tracked. So running it
        before `git add` — which is exactly when somebody runs it, over the files they
        just wrote — came back green about those very files.

        The same mistake had been found and fixed in the OTHER mode, and its comment is
        still there saying a brand new file «would sail past this in local use». It was
        fixed for the diff and not for the tree.

        This writes a real file in the tree and removes it afterwards, rather than
        faking the listing: what is being checked is that the command walks what git
        reports, and mocking git would check the mock.
        """
        intruder = ROOT / 'web' / 'src' / 'lib' / 'vault' / 'untracked_for_this_test.ts'
        intruder.write_text('// Una línea de prosa española recién escrita.\n', encoding='utf-8')

        try:
            result = subprocess.run(
                [sys.executable, str(COMMAND), '--all'],
                capture_output=True, text=True, cwd=ROOT,
            )
        finally:
            intruder.unlink()

        self.assertEqual(result.returncode, 1, 'un fichero nuevo sin añadir pasó desapercibido')
        self.assertIn('untracked_for_this_test.ts', result.stdout + result.stderr)

    def test_the_census_is_clean_on_an_unchanged_tree(self):
        """It has to be quiet when nothing was lost, or nobody will run it.

        Against HEAD and not against the default base, which is `origin/master`:
        the tree of a branch is not «unchanged» while the branch is doing its work,
        so comparing against master would turn this red for any PR that legitimately
        deletes a file — this very one deleted five. What is meant here is that the
        census keeps quiet when there is nothing to report, and comparing the tree
        with itself is what says that.
        """
        result = subprocess.run(
            [sys.executable, str(COMMAND), '--census', '--base', 'HEAD'],
            capture_output=True, text=True, cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('ningún fichero pierde comentario', result.stdout)


if __name__ == '__main__':
    unittest.main()


class BlocksItUsedToWalkPast(unittest.TestCase):
    """The hole #366 was filed on, and the shape it had.

    The checker walked line by line and only ever saw lines that BEGIN with a
    comment marker. Two kinds of prose were therefore invisible: JSX comments,
    whose line starts with `{`, and the continuation lines of any `/* … */`
    written without leading asterisks.

    That was not a hypothetical. Measured when this was fixed: **196 lines
    across 16 files had never been read**, and nine of them were still in
    Spanish, having survived the whole conversion of Iteration 10 by being
    invisible to the very thing that declared it finished.
    """

    def flagged(self, lines: list[str]) -> list[str]:
        """What `findings` reports for one file's worth of lines."""
        return _module.findings([('a.tsx', line) for line in lines])

    def test_a_jsx_comment_on_one_line(self):
        self.assertTrue(self.flagged(['{/* el número no baila */}']))

    def test_the_continuation_of_a_jsx_comment(self):
        """The first line English, the rest not — a conversion left half done."""
        found = self.flagged([
            '{/* DropdownMenuLabel has to live inside a Group: on its own,',
            '    Base UI lanza un error que deja la página en blanco. */}',
        ])
        self.assertEqual(len(found), 1)
        self.assertIn('página', found[0])

    def test_the_continuation_of_a_plain_block(self):
        found = self.flagged([
            '/*',
            '| Feature tests run against the TestCase, with',
            '| la base de datos recreada en cada test, así que nunca toca MySQL.',
            '*/',
        ])
        self.assertEqual(len(found), 1)

    def test_code_after_the_block_closes_is_not_prose(self):
        """Where the state has to stop, or every line below a comment is prose."""
        self.assertFalse(self.flagged([
            '/* An English comment */',
            'const camino = "/una/ruta/en/español"',
        ]))

    def test_a_block_opened_and_closed_on_one_line_leaves_nothing_open(self):
        self.assertFalse(self.flagged([
            '/* fine */',
            'const x = 1 // fine too',
            'const y = "el número"',
        ]))

    def test_the_state_does_not_leak_into_the_next_file(self):
        """A file that ends mid-block must not make the next one's code prose."""
        found = _module.findings([
            ('a.tsx', '/* an English comment that never closes'),
            ('b.tsx', 'const camino = "el número de la vault"'),
        ])
        self.assertFalse(found)

    def test_a_line_inside_a_block_it_never_saw_open_is_not_reported(self):
        """The safe direction, and the one limit that remains in diff mode.

        A hunk arrives without what came before it, so the state starts closed.
        Not reporting is the right way to be wrong here: it is what the checker
        did always, and inventing a block would flag ordinary code.
        """
        self.assertFalse(self.flagged(['    la línea suelta de un bloque que no se vio abrir']))
