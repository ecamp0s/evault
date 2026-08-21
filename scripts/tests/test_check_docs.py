#!/usr/bin/env python3
"""Tests for the documentation checks.

The acceptance criterion of #62 was not «that the job exists», it was that it
**detects every case broken on purpose**. That is what is here: a file with a
conflict marker planted in it, another with a NUL byte, a STATUS.md with one
section marker taken out, a reference to a document that is not there, and a PR
body that closes an issue without touching SPRINT_CONTEXT.

    python3 -m unittest discover -s scripts/tests
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent


def _load():
    path = ROOT / 'scripts' / 'check-docs.py'
    spec = importlib.util.spec_from_file_location('check_docs', path)
    module = importlib.util.module_from_spec(spec)
    sys.modules['check_docs'] = module
    spec.loader.exec_module(module)
    return module


docs = _load()

MINIMAL_STATUS = '\n'.join(
    f'<!-- manual:{n} -->\ncontenido\n<!-- /manual:{n} -->' for n in docs.MANUAL_SECTIONS
)


class Tree:
    """A test repository, with real git because the command uses git ls-files."""

    def __init__(self, test: unittest.TestCase):
        self.base = Path(test.enterContext(tempfile.TemporaryDirectory()))
        subprocess.run(['git', 'init', '-q'], cwd=self.base, check=True)
        self.write(docs.STATUS, MINIMAL_STATUS)
        self.write(docs.SPRINT_CONTEXT, 'punto de trabajo\n')
        test.enterContext(self.pointing())

    def pointing(self):
        """Makes the command look at this tree and not at the real repository."""
        import contextlib

        @contextlib.contextmanager
        def swap():
            original = docs.ROOT
            docs.ROOT = self.base
            try:
                yield
            finally:
                docs.ROOT = original

        return swap()

    def write(self, name: str, content: str | bytes) -> Path:
        target = self.base / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            target.write_bytes(content)
        else:
            target.write_text(content, encoding='utf-8')
        subprocess.run(['git', 'add', '-A'], cwd=self.base, check=True, capture_output=True)
        return target

    def files(self):
        return docs.tracked_files()


class NulBytes(unittest.TestCase):
    """The lesson of #184: a NUL byte makes a file invisible to the audits."""

    def setUp(self):
        self.tree = Tree(self)

    def test_detects_a_planted_nul_byte(self):
        self.tree.write('src/a.ts', b'const x = 1\nconst y = "a\x00b"\n')
        problems = docs.check_nul_bytes(self.tree.files())
        self.assertEqual(len(problems), 1)
        self.assertIn('src/a.ts:2', problems[0])

    def test_does_not_flag_a_clean_file(self):
        self.tree.write('src/a.ts', 'const x = 1\n')
        self.assertEqual(docs.check_nul_bytes(self.tree.files()), [])

    def test_does_not_flag_a_real_binary(self):
        # A PNG carries NUL bytes by definition and is not a problem.
        self.tree.write('docs/assets/x.png', b'\x89PNG\r\n\x1a\n\x00\x00\x00')
        self.assertEqual(docs.check_nul_bytes(self.tree.files()), [])


class ConflictMarkers(unittest.TestCase):
    def setUp(self):
        self.tree = Tree(self)

    def test_detects_a_planted_marker(self):
        self.tree.write('docs/x.md', 'antes\n<<<<<<< HEAD\nmío\n=======\nsuyo\n>>>>>>> otra\n')
        problems = docs.check_conflict_markers(self.tree.files())
        self.assertEqual(len(problems), 2, 'the opening one and the closing one')

    def test_does_not_confuse_a_markdown_heading_with_a_conflict(self):
        # `=======` underlines headings in Markdown, so it is not looked at: only the
        # markers of seven `<` or `>`, which are unambiguous.
        self.tree.write('docs/x.md', 'Un título\n=========\n\ntexto\n')
        self.assertEqual(docs.check_conflict_markers(self.tree.files()), [])


class ManualSectionMarkers(unittest.TestCase):
    """The only thing that cannot be recovered if somebody resolves STATUS.md's conflict badly."""

    def setUp(self):
        self.tree = Tree(self)

    def test_with_the_six_markers_it_says_nothing(self):
        self.assertEqual(docs.check_status_markers(), [])

    def test_detects_that_one_is_missing(self):
        self.tree.write(docs.STATUS, MINIMAL_STATUS.replace('<!-- manual:riesgos -->', ''))
        problems = docs.check_status_markers()
        self.assertEqual(len(problems), 1)
        self.assertIn('manual:riesgos', problems[0])

    def test_detects_that_the_closing_one_is_missing(self):
        self.tree.write(docs.STATUS, MINIMAL_STATUS.replace('<!-- /manual:objetivo -->', ''))
        self.assertIn('/manual:objetivo', docs.check_status_markers()[0])


class DocumentReferences(unittest.TestCase):
    """vite.config.ts's reference to a document that never existed."""

    def setUp(self):
        self.tree = Tree(self)

    def test_detects_a_reference_to_a_document_that_does_not_exist(self):
        self.tree.write('web/vite.config.ts', '// Ver docs/architecture/SEGURIDAD.md.\n')
        problems = docs.check_doc_references(self.tree.files())
        self.assertEqual(len(problems), 1)
        self.assertIn('SEGURIDAD.md', problems[0])

    def test_it_also_finds_it_inside_code_and_not_only_in_markdown(self):
        # Because the real case was in a TypeScript comment, not in a link.
        self.tree.write('api/app/X.php', '<?php\n// ver docs/nope.md\n')
        self.assertEqual(len(docs.check_doc_references(self.tree.files())), 1)

    def test_does_not_flag_a_reference_that_does_exist(self):
        self.tree.write('docs/GUIDE.md', 'reglas\n')
        self.tree.write('docs/README.md', 'ver docs/GUIDE.md\n')
        self.assertEqual(docs.check_doc_references(self.tree.files()), [])


class SprintContextOnClosingAnIssue(unittest.TestCase):
    """The Definition of Done that during Iteration 2 was skipped three times."""

    def test_a_pr_that_closes_an_issue_and_does_not_touch_it_fails(self):
        problems = docs.check_sprint_context('Arregla cosas.\n\nCloses #42', ['web/src/a.ts'])
        self.assertTrue(problems)
        self.assertIn('cierra un issue', problems[0])

    def test_the_same_pr_passes_if_it_touches_it(self):
        self.assertEqual(
            docs.check_sprint_context('Closes #42', ['web/src/a.ts', docs.SPRINT_CONTEXT]), []
        )

    def test_a_pr_that_closes_no_issue_demands_nothing(self):
        self.assertEqual(docs.check_sprint_context('Un arreglo suelto.', ['web/src/a.ts']), [])

    def test_the_way_out_works_and_demands_a_reason(self):
        with_reason = 'Closes #42\n\nSin SPRINT_CONTEXT: no cambia el punto de trabajo'
        self.assertEqual(docs.check_sprint_context(with_reason, ['web/src/a.ts']), [])

    def test_the_way_out_without_a_reason_is_no_good(self):
        # A check that is skipped by writing a magic word without explaining why is a
        # check that does not exist.
        self.assertTrue(docs.check_sprint_context('Closes #42\n\nSin SPRINT_CONTEXT:', ['a.ts']))


class FilesItLooksAt(unittest.TestCase):
    """A freshly written file has to count, even though nobody has added it."""

    def setUp(self):
        self.tree = Tree(self)

    def test_it_sees_an_untracked_file(self):
        # Without --others, `git ls-files` only sees the index and a new file is
        # invisible. It happened while writing this command: green locally, four
        # problems in CI, because over there it was already committed.
        target = self.tree.base / 'docs' / 'nuevo.md'
        target.write_text('sin git add\n', encoding='utf-8')
        names = {str(p.relative_to(self.tree.base)) for p in docs.tracked_files()}
        self.assertIn('docs/nuevo.md', names)

    def test_a_new_file_with_a_nul_byte_does_not_get_away(self):
        target = self.tree.base / 'src' / 'nuevo.ts'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b'const x = "a\x00b"\n')
        self.assertEqual(len(docs.check_nul_bytes(docs.tracked_files())), 1)


class TheRealRepository(unittest.TestCase):
    def test_it_passes_its_own_checks(self):
        process = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'check-docs.py')],
                                 cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(process.returncode, 0, process.stdout)


if __name__ == '__main__':
    unittest.main()
