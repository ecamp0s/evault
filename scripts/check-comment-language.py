#!/usr/bin/env python3
"""Flags comments and test names written in Spanish among the lines a change ADDS.

WHY THIS EXISTS — #291. The language rule changed on 17 August 2026: code goes in
English, comments and test names included. Nothing checked the new half.
`check-identifiers.py` looks at identifiers and nothing looks at prose, so in the
first two days of the rule fourteen Spanish comment lines went in without a word.
This project already knows what happens to a rule that is only written down:
`check-identifiers.py` exists because stating the rule was not enough three times
running (#153, #160, #189).

IT LOOKS AT ADDED LINES, NOT AT THE TREE, and that is the whole design. There are
3.904 Spanish comment lines waiting for the conversion of #290, so a checker over the
tree would be born red — and #62 already taught this project that a check born red
gets ignored whole, and then it is not there on the day it matters. What is already
written does not fail it; what is new does.

When #290 finishes, `--all` becomes the mode to run, and no second checker has to be
written.

DETECTING A LANGUAGE IN SHORT PROSE IS HARDER THAN IN IDENTIFIERS, and a false
positive costs more than a miss: a checker that cries wolf gets bypassed, and then it
protects nothing. So the evidence is graded, and the thresholds were measured against
a real corpus of this repository rather than guessed. See `--measure`.

Usage:
  scripts/check-comment-language.py               # added lines vs origin/master
  scripts/check-comment-language.py --base REF    # added lines vs REF (CI passes one)
  scripts/check-comment-language.py --all         # the whole tree, for #290's progress
  scripts/check-comment-language.py --measure     # precision against the known corpus

Exit codes:
  0  nothing in Spanish among the added lines
  1  something found, or the comparison could not be made
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Files whose contents are code. Documentation lives in Spanish on purpose.
CODE_SUFFIXES = {'.ts', '.tsx', '.php', '.py', '.sh', '.mjs', '.js'}

# Anything under these never counts: dependencies and build output are not ours.
EXCLUDED_PARTS = {'node_modules', 'vendor', 'dist', 'build', '.git'}

"""
Prose markers.

The triple quotes are there because Python's prose lives in docstrings, not in `#`
comments — `status.py`, `check-docs.py` and every test file in this repository
document themselves that way. Leaving them out was an early hole here, found when
this checker read its own test file and called it English.

KNOWN LIMIT, stated rather than discovered later: only the FIRST line of a multi-line
docstring is seen in diff mode, because a single added line carries no clue about
whether it sits inside one. In practice that first line is the summary and the one
most likely to be written in Spanish, but a middle line can slip through. `--all` has
the whole file and does not have this problem.
"""
COMMENT = re.compile(r'^\s*(//|/\*+|\*|#|"""|\'\'\')\s?(?P<text>.*?)("""|\'\'\')?\s*$')

# it('...'), describe("..."), test(`...`), def test_something
TEST_NAME = re.compile(
    r"""(?:\b(?:it|test|describe)\s*(?:\.\w+)?\s*\(\s*['"`](?P<name>[^'"`]{4,})
      | \bdef\s+test_(?P<py>\w{4,}))""",
    re.VERBOSE,
)

# Characters that do not occur in English text. One is enough.
STRONG = re.compile(r'[áéíóúñÁÉÍÓÚÑ¿¡]')

"""
Spanish function words that are NOT English words.

Deliberately missing, and each one for a reason found while measuring: `no`, `son`,
`hay`, `sin` and `con` are ordinary English words; `a`, `y`, `o`, `al`, `lo` and `le`
are too short to survive acronyms and identifiers quoted inside prose. Leaving them
out costs a little recall and buys the thing that matters more — that a green run
means something.
"""
WEAK = frozenset("""
    que para porque cuando donde esto esta estos estas ese esa eso
    pero aunque mientras entonces sino tanto
    del las los una unas unos sus cual cuales
    desde hasta sobre entre hacia
    ser es era son estar puede pueden hace hacen tiene tienen
    todo toda todos todas mismo misma
""".split())

WORDS = re.compile(r"[a-záéíóúñü]+", re.IGNORECASE)


def is_spanish(text: str) -> tuple[bool, str]:
    """Graded evidence: one strong signal, or two weak ones in the same line."""
    if STRONG.search(text):
        return True, f'acento o ñ: {STRONG.search(text).group()!r}'

    found = sorted({w.lower() for w in WORDS.findall(text) if w.lower() in WEAK})
    if len(found) >= 2:
        return True, 'palabras españolas: ' + ', '.join(found[:4])

    return False, ''


def looks_like_code(path: str) -> bool:
    parts = set(Path(path).parts)
    return Path(path).suffix in CODE_SUFFIXES and not (parts & EXCLUDED_PARTS)


def run(*args: str) -> str:
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f'{" ".join(args)}: {result.stderr.strip()}')
    return result.stdout


def added_lines(base: str) -> list[tuple[str, str]]:
    """(file, text) for every line the change adds, in code files only.

    --unified=0 so context lines never leak in: flagging a line somebody merely
    happened to touch near would be the fastest way to make this checker resented.
    """
    try:
        merge_base = run('git', 'merge-base', base, 'HEAD').strip()
    except RuntimeError:
        merge_base = base

    """
    Against the WORKING TREE and not against HEAD, and this cost a mutation to find.
    Comparing `merge_base..HEAD` only sees what is already committed, so running this
    before committing — which is when it is useful — reported a clean bill on a file
    that had just been given a Spanish comment. Green while broken is the worst
    result a checker can produce.

    In CI it makes no difference: there everything is committed already.
    """
    diff = run('git', 'diff', '--unified=0', '--no-color', merge_base)

    lines: list[tuple[str, str]] = []
    current = ''
    for line in diff.splitlines():
        if line.startswith('+++ b/'):
            current = line[6:]
        elif line.startswith('+') and not line.startswith('+++') and looks_like_code(current):
            lines.append((current, line[1:]))

    """
    And whole new files that git has not been told about yet.

    `git diff` does not see untracked files at all, so a brand new file written
    entirely in Spanish would sail past this in local use — which is precisely when
    somebody is about to commit one. Found while writing the tests for this very
    script, in a new file that was not staged.
    """
    for path in run('git', 'ls-files', '--others', '--exclude-standard').splitlines():
        if looks_like_code(path):
            try:
                text = (ROOT / path).read_text(encoding='utf-8', errors='replace')
            except OSError:
                continue
            lines.extend((path, line) for line in text.splitlines())

    return lines


def tree_lines() -> list[tuple[str, str]]:
    lines: list[tuple[str, str]] = []
    for path in run('git', 'ls-files').splitlines():
        if not looks_like_code(path):
            continue
        try:
            text = (ROOT / path).read_text(encoding='utf-8', errors='replace')
        except OSError:
            continue
        lines.extend((path, line) for line in text.splitlines())
    return lines


def findings(lines: list[tuple[str, str]]) -> list[str]:
    problems = []
    for path, line in lines:
        for kind, text in candidates(line):
            spanish, why = is_spanish(text)
            if spanish:
                problems.append(f'{path}: {kind} en español ({why})\n      {text.strip()[:90]}')
    return problems


def candidates(line: str) -> list[tuple[str, str]]:
    """The two kinds of prose this rule covers, from one line of source."""
    out = []
    match = TEST_NAME.search(line)
    if match:
        out.append(('nombre de test', match.group('name') or match.group('py').replace('_', ' ')))

    comment = COMMENT.match(line)
    if comment and comment.group('text').strip():
        out.append(('comentario', comment.group('text')))
    return out


def measure() -> int:
    """Precision and recall against files whose language is known.

    Not decoration: #291 asks for the false-positive rate to be measured and written
    down rather than assumed, because that number is what decides whether anyone keeps
    running this.
    """
    english = ['scripts/auto-lock/cdp.mjs', 'scripts/auto-lock/vault.mjs',
               'scripts/verify-auto-lock.mjs', 'scripts/check-cert-expiry.sh',
               'scripts/check-backup-freshness.sh']
    spanish = ['web/src/lib/vault/autoLock.ts', 'web/src/components/AutoLock.tsx',
               'api/app/Providers/AppServiceProvider.php', 'scripts/check-docs.py']

    def count(paths):
        total = flagged = 0
        for path in paths:
            for line in (ROOT / path).read_text(encoding='utf-8').splitlines():
                for _, text in candidates(line):
                    total += 1
                    flagged += bool(is_spanish(text)[0])
        return total, flagged

    english_total, english_flagged = count(english)
    spanish_total, spanish_flagged = count(spanish)

    print(f'  ficheros en inglés:  {english_flagged} marcadas de {english_total}'
          f'  -> falsos positivos {100 * english_flagged / max(english_total, 1):.1f} %')
    print(f'  ficheros en español: {spanish_flagged} marcadas de {spanish_total}'
          f'  -> detectadas       {100 * spanish_flagged / max(spanish_total, 1):.1f} %')
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='origin/master')
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--measure', action='store_true')
    options = parser.parse_args()

    if options.measure:
        return measure()

    try:
        lines = tree_lines() if options.all else added_lines(options.base)
    except RuntimeError as error:
        print(f'✗ no se pudo leer el diff: {error}', file=sys.stderr)
        return 1

    problems = findings(lines)
    scope = 'el árbol entero' if options.all else f'las líneas añadidas sobre {options.base}'

    if not problems:
        print(f'✓ comentarios y nombres de test en inglés: sin problemas en {scope}')
        return 0

    print(f'✗ prosa en español en {scope}: {len(problems)}', file=sys.stderr)
    for problem in problems[:40]:
        print(f'    {problem}', file=sys.stderr)
    if len(problems) > 40:
        print(f'    … y {len(problems) - 40} más', file=sys.stderr)

    print('\n  La regla es del 17 de agosto de 2026 y está en CLAUDE.md: el código va en',
          file=sys.stderr)
    print('  inglés, comentarios y nombres de test incluidos. Al editar un fichero que ya',
          file=sys.stderr)
    print('  está en español, lo que se AÑADE va en inglés y lo que ya estaba se queda.',
          file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
