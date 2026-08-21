#!/usr/bin/env python3
"""Documentation and repository hygiene checks.

It exists because of issue #62, and its underlying problem was not that a check
was missing: it was that **the absence of a check meant nothing**. A
documentation-only PR fired no job, and neither did a conflicted PR, because
GitHub does not run the workflows of a PR it cannot merge. The two symptoms were
identical.

What this command checks comes, one by one, from things that already happened:

- **Conflict markers**, because the conflict in `STATUS.md` is structural: the
  bot regenerates it on `master` every time something is merged.
- **The six manual section markers of `STATUS.md`**, which are the only thing
  that cannot be recovered if somebody resolves that conflict by keeping the
  bot's version.
- **NUL bytes in text files**, which is #184: one in `import.ts` made it
  invisible to `grep` for three days and survived a whole migration and the
  evaluation of an exit criterion.
- **References to documents that do not exist**, which is `vite.config.ts`'s
  reference to `docs/architecture/SEGURIDAD.md`, broken since it was written.
  Naming it here is allowed by SELF_REFERENTIAL below.
- **That a PR closing an issue touches `SPRINT_CONTEXT.md`**, which the
  Definition of Done requires and which during Iteration 2 was skipped three
  times in a row.
- **A README that never names the project**, which is #325: `web/README.md` was
  Vite's template and `api/README.md` was Laravel's, for nine iterations, in the
  two directories anybody looking at the code opens first.

Usage:
    scripts/check-docs.py                      # all the local checks
    scripts/check-docs.py --pr-body FILE --changed-files FILE
                                               # adds the SPRINT_CONTEXT rule
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

STATUS = 'docs/planning/STATUS.md'
SPRINT_CONTEXT = 'docs/planning/SPRINT_CONTEXT.md'

# The six sections `status.py` preserves when regenerating. If one disappears, the
# generator fills it with its default value and the work written by hand is lost
# without anything failing.
MANUAL_SECTIONS = ('objetivo', 'salida', 'riesgos')

# Extensions that are binary by definition and where a NUL byte is normal.
BINARY_SUFFIXES = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2',
                   '.ttf', '.otf', '.zip', '.gz', '.evault'}

# A reference to a document of the repository, in Markdown or inside a code
# comment. The file is required to exist.
DOC_REFERENCE = re.compile(r'(?<![\w/.-])(docs/[\w./-]+\.md)')

# The project's convention for GitHub to close the issue on merging.
CLOSES = re.compile(r'\bCloses #(\d+)', re.IGNORECASE)

# The way out, which has to carry a reason: a check that cannot be skipped when it
# should be ends up being ignored entirely.
ESCAPE = re.compile(r'^Sin SPRINT_CONTEXT:\s*\S+', re.MULTILINE)


def tracked_files() -> list[Path]:
    """The repository's files, both tracked and untracked.

    `--others --exclude-standard` is no ornament: without them `git ls-files` only
    sees what is already in the index, and a freshly written file is INVISIBLE to
    this command until somebody adds it. It happened while writing it: locally it
    said «todo en orden» and in CI it found four problems, because in CI the file
    was already committed. It is the same family as #184 —a file the auditor does
    not look at— with another cause.

    `--exclude-standard` respects .gitignore, so node_modules, vendor and dist are
    left out without having to be listed.
    """
    output = subprocess.run(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        cwd=ROOT, capture_output=True, check=True,
    )
    return [ROOT / n.decode() for n in output.stdout.split(b'\0') if n]


def is_text(path: Path) -> bool:
    return path.suffix.lower() not in BINARY_SUFFIXES


def check_nul_bytes(files: list[Path]) -> list[str]:
    """A NUL byte turns a text file invisible to the audits."""
    problems = []
    for path in files:
        if not is_text(path):
            continue
        raw = path.read_bytes()
        if b'\x00' in raw:
            line = raw[: raw.index(b'\x00')].count(b'\n') + 1
            problems.append(f'{path.relative_to(ROOT)}:{line}: byte NUL en un fichero de texto')
    return problems


def check_conflict_markers(files: list[Path]) -> list[str]:
    """`<<<<<<<` and `>>>>>>>` are unambiguous; `=======` also underlines Markdown headings."""
    problems = []
    for path in files:
        if not is_text(path):
            continue
        for number, line in enumerate(path.read_bytes().split(b'\n'), start=1):
            if line.startswith(b'<<<<<<<') or line.startswith(b'>>>>>>>'):
                problems.append(f'{path.relative_to(ROOT)}:{number}: marcador de conflicto sin resolver')
    return problems


def check_status_markers() -> list[str]:
    """Without its markers, `status.py` fills the manual sections with the default value."""
    path = ROOT / STATUS
    if not path.exists():
        return [f'{STATUS}: no existe']
    text = path.read_text(encoding='utf-8')
    missing = [
        f'{STATUS}: falta el marcador <!-- {edge}manual:{name} -->'
        for name in MANUAL_SECTIONS
        for edge in ('', '/')
        if f'<!-- {edge}manual:{name} -->' not in text
    ]
    return missing


# The two files that TALK about broken references and therefore contain them: this
# command, which documents them, and its tests, which plant them on purpose.
# Excluding them is the same thing any linter does with its own fixtures.
#
# The alternative was a suppression marker, and it was discarded: in prose it is
# better solved by not naming the dead path —that is how criterion 7 of STATUS.md
# was rewritten—, and a general suppression mechanism invites being used to silence
# real findings.
SELF_REFERENTIAL = ('scripts/check-docs.py', 'scripts/tests/test_check_docs.py')


def check_doc_references(files: list[Path]) -> list[str]:
    """A reference to a document that does not exist ages without being noticed."""
    problems = []
    for path in files:
        if not is_text(path) or path.suffix in {'.lock', '.json'}:
            continue
        if str(path.relative_to(ROOT)) in SELF_REFERENTIAL:
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        for reference in set(DOC_REFERENCE.findall(text)):
            if not (ROOT / reference).exists():
                problems.append(f'{path.relative_to(ROOT)}: referencia a «{reference}», que no existe')
    return problems


def check_readmes_are_ours(files: list[Path]) -> list[str]:
    """A README that never names the project is still its generator's template.

    IT IS #325, AND IT LASTED NINE ITERATIONS. `web/README.md` was Vite's template
    —«This template provides a minimal setup…»— and `api/README.md` was Laravel's,
    logo and Packagist badges included, in a public repository whose second purpose
    is that somebody reads it while judging technical judgement. They are the first
    thing GitHub shows on entering `web/` or `api/`, and they said, without meaning
    to, that nobody had looked at those directories.

    WHY A POSITIVE PROPERTY AND NOT A LIST OF KNOWN TEMPLATES. A list of forbidden
    phrases —«Getting Started with Create React App», «Laravel is a web application
    framework»— fails in silence for the generator nobody listed, and this project
    already paid for that lesson with `english.txt` in Iteration 6: an allowlist
    reports what it does not know, a denylist reports only what somebody remembered.
    No generator's template names eVault. Whatever `mobile/` or `extension/` arrive
    carrying the day they exist, this notices.
    """
    problems = []
    for path in files:
        if path.name != 'README.md':
            continue
        if 'eVault' not in path.read_text(encoding='utf-8'):
            problems.append(
                f'{path.relative_to(ROOT)}: no nombra el proyecto en ninguna parte. '
                '¿Sigue siendo la plantilla de su generador?'
            )
    return problems


def check_sprint_context(pr_body: str, changed: list[str]) -> list[str]:
    """The Definition of Done asks for SPRINT_CONTEXT.md to be updated on closing an issue.

    What is checked is that the file has been touched, not what it says: the content
    is human judgement and cannot be generated. That is the distinction with
    STATUS.md, which is generated because its source of truth is in GitHub.
    """
    if not CLOSES.search(pr_body):
        return []
    if ESCAPE.search(pr_body):
        return []
    if SPRINT_CONTEXT in changed:
        return []
    return [
        f'el PR cierra un issue y no toca {SPRINT_CONTEXT}.',
        '  La Definition of Done pide actualizarlo al cerrar un issue.',
        '  Si de verdad no cambia nada del punto de trabajo, escribe en el cuerpo del PR',
        '  una línea «Sin SPRINT_CONTEXT: <motivo>» y este check te deja pasar.',
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description='Comprobaciones de documentación del repositorio.')
    parser.add_argument('--pr-body', type=Path, help='fichero con el cuerpo del PR')
    parser.add_argument('--changed-files', type=Path, help='fichero con los ficheros tocados, uno por línea')
    options = parser.parse_args()

    files = tracked_files()

    checks: list[tuple[str, list[str]]] = [
        ('bytes NUL en ficheros de texto', check_nul_bytes(files)),
        ('marcadores de conflicto sin resolver', check_conflict_markers(files)),
        ('marcadores de sección manual de STATUS.md', check_status_markers()),
        ('referencias a documentos inexistentes', check_doc_references(files)),
        ('READMEs que siguen siendo la plantilla de su generador', check_readmes_are_ours(files)),
    ]

    if options.pr_body is not None:
        body = options.pr_body.read_text(encoding='utf-8') if options.pr_body.exists() else ''
        changed = []
        if options.changed_files is not None and options.changed_files.exists():
            changed = options.changed_files.read_text(encoding='utf-8').split()
        checks.append(('SPRINT_CONTEXT.md al cerrar un issue', check_sprint_context(body, changed)))

    total = 0
    for name, problems in checks:
        mark = '✗' if problems else '✓'
        print(f'{mark} {name}: {len(problems) or "sin problemas"}')
        for problem in problems:
            print(f'    {problem}')
        total += len(problems)

    if total:
        print(f'\n{total} problema(s).')
        return 1

    print('\nTodo en orden.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
