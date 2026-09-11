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
import re
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


class RelativeLinks(unittest.TestCase):
    """#663: moving text to another folder broke its relative links, and nothing said so."""

    def setUp(self):
        self.tree = Tree(self)

    def test_detects_a_link_that_broke_when_its_text_moved(self):
        # The real case: written from docs/planning/, moved into docs/planning/archive/.
        self.tree.write('docs/planning/archive/ITERACION_16.md', 'ver [el archivo](archive/ITERACION_16.md)\n')
        problems = docs.check_relative_links(self.tree.files())
        self.assertEqual(len(problems), 1)
        self.assertIn('archive/ITERACION_16.md', problems[0])

    def test_resolves_against_the_file_and_not_the_root(self):
        self.tree.write('docs/architecture/decisions/ADR-001.md', 'decisión\n')
        self.tree.write('docs/planning/archive/X.md', '[ADR](../../architecture/decisions/ADR-001.md)\n')
        self.assertEqual(docs.check_relative_links(self.tree.files()), [])

    def test_the_anchor_is_not_part_of_the_path(self):
        self.tree.write('docs/GUIDE.md', '# Reglas\n')
        self.tree.write('docs/README.md', '[reglas](GUIDE.md#reglas) y [aquí](#arriba)\n')
        self.assertEqual(docs.check_relative_links(self.tree.files()), [])

    def test_external_links_are_not_its_business(self):
        self.tree.write('docs/README.md', '[GitHub](https://github.com/x) [correo](mailto:a@b.c)\n')
        self.assertEqual(docs.check_relative_links(self.tree.files()), [])

    def test_a_link_inside_a_code_fence_is_an_example(self):
        self.tree.write('docs/README.md', '```md\n[ejemplo](no-existe.md)\n```\n')
        self.assertEqual(docs.check_relative_links(self.tree.files()), [])


class ReadmesThatAreStillATemplate(unittest.TestCase):
    """#325: two of them lasted nine iterations in the directories people open first."""

    def setUp(self):
        self.tree = Tree(self)

    def test_it_flags_a_readme_that_never_names_the_project(self):
        self.tree.write(
            'web/README.md',
            '# React + TypeScript + Vite\n\nThis template provides a minimal setup.\n',
        )
        problems = docs.check_readmes_are_ours(self.tree.files())
        self.assertEqual(len(problems), 1)
        self.assertIn('web/README.md', problems[0])

    def test_it_does_not_flag_one_that_does(self):
        self.tree.write('web/README.md', '# eVault — the web client\n\nThe React SPA.\n')
        self.assertEqual(docs.check_readmes_are_ours(self.tree.files()), [])

    def test_it_looks_at_every_readme_and_not_only_the_root_one(self):
        """The two that were wrong were precisely not the root one."""
        self.tree.write('README.md', '# eVault\n')
        self.tree.write('api/README.md', '# Laravel\n\nLaravel is a web application framework.\n')
        problems = docs.check_readmes_are_ours(self.tree.files())
        self.assertEqual(len(problems), 1)
        self.assertIn('api/README.md', problems[0])

    def test_other_documents_are_not_asked_to_name_it(self):
        """Only READMEs: a document about one detail has no reason to say eVault."""
        self.tree.write('docs/development/SETUP.md', 'PHP 8.4, Node 24.\n')
        self.assertEqual(docs.check_readmes_are_ours(self.tree.files()), [])


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


class TheWorkflowCanActuallyReadTheWayOut(unittest.TestCase):
    """The escape hatch has to be usable by the path that produces it. See #576.

    `check_sprint_context` says that writing «Sin SPRINT_CONTEXT: <motivo>» in the PR
    body lets it pass, and the tests above prove the function honours that. What they
    cannot see is that the workflow has to RE-READ the body for any of it to matter.

    With the default `pull_request` types —opened, synchronize, reopened— editing the
    body fired nothing, and `gh run rerun` reuses the original event payload, so the
    check read the old body and failed again with the same message. A correct
    instruction, impossible to follow by the path that produced it: the same shape as
    #553.

    This is a test over a YAML file, which is unusual here and earns its place: the
    failure it prevents is somebody tidying `types` away and silently restoring a
    message that lies.
    """

    WORKFLOW = ROOT / '.github' / 'workflows' / 'repo.yml'

    def trigger(self) -> str:
        """The `pull_request:` block, up to the next key at the same indentation."""
        text = self.WORKFLOW.read_text(encoding='utf-8')
        start = text.index('  pull_request:')
        rest = text[start + len('  pull_request:'):]
        end = re.search(r'^  \S', rest, re.MULTILINE)

        return rest[: end.start()] if end else rest

    def test_it_listens_for_an_edited_body(self):
        self.assertIn('edited', self.trigger())

    def test_it_still_listens_for_the_three_it_would_have_by_default(self):
        # Declaring `types` REPLACES the defaults. Leaving one out would take the check
        # off the PRs that need it most — the new ones.
        for event in ('opened', 'synchronize', 'reopened'):
            self.assertIn(event, self.trigger(), f'falta {event}')


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
