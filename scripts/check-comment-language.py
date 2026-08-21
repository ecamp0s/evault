#!/usr/bin/env python3
"""Flags comments and test names written in Spanish. THE ONLY CHECKER OF THE LANGUAGE RULE.

WHY THIS EXISTS — #291. The language rule changed on 17 August 2026: code goes in
English, comments and test names included. Nothing checked the new half. The
identifier checker looked at identifiers and nothing looked at prose, so in the
first two days of the rule fourteen Spanish comment lines went in without a word.
This project already knows what happens to a rule that is only written down: that
checker existed because stating the rule was not enough three times running (#153,
#160, #189).

AND SINCE #323 IT IS ALONE, because `check-identifiers.py` was retired: with the
boundary between languages running BETWEEN files instead of inside them, there was
nothing left for it to watch. What used to be split in two — identifiers there,
prose here — is one rule now, and this is what holds it.

IT WAS BORN LOOKING AT ADDED LINES AND NOW IT LOOKS AT THE TREE, and that order was
the design. There were 3.993 Spanish comment lines waiting for the conversion of
#290, so a checker over the tree would have been born red — and #62 already taught
this project that a check born red gets ignored whole, and then it is not there on
the day it matters. The six layers converted them, #323 retired the four files that
held the last 158, and from that commit the CI runs `--all`.

DETECTING A LANGUAGE IN SHORT PROSE IS HARDER THAN IN IDENTIFIERS, and a false
positive costs more than a miss: a checker that cries wolf gets bypassed, and then it
protects nothing. So the evidence is graded, and the thresholds were measured against
a real corpus of this repository rather than guessed. See `--measure`.

THE CENSUS IS THE OTHER HALF, added in #316, and it guards the opposite mistake.
Everything above flags Spanish prose, so a comment that is DELETED rather than
translated takes its own finding away with it and this checker applauds. Over the
3.993 lines of #290, spread across six pull requests nobody will read line by line,
the only net in place would reward the worst possible outcome. `--census` counts
comment lines per file and fails when one loses them.

Usage:
  scripts/check-comment-language.py               # added lines vs origin/master
  scripts/check-comment-language.py --base REF    # added lines vs REF (CI passes one)
  scripts/check-comment-language.py --all         # the whole tree, which is what CI runs
  scripts/check-comment-language.py --census      # comment lines kept, vs origin/master
  scripts/check-comment-language.py --measure     # precision against the known corpus

Exit codes:
  0  nothing in Spanish among the added lines, or no file lost comment
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


"""
Text quoted between angle quotes does not count as prose of this file.

FOUND WHILE CONVERTING lib/vault IN #317, and it was about to cost real information.
`search.ts` explains in English how accents are stripped, and it cannot explain it
without the examples: «cafe» has to find «Café», and «ano» also finding «año» is the
price the comment argues is worth paying. Every one of those quotes tripped the strong
signal, so a converted file kept being flagged — and the way to silence it would have
been deleting the examples, which is exactly the loss #316 exists to prevent.

MEASURED BEFORE BEING ADOPTED, against the same corpus as everything else here: with
quotes stripped, the false positives stay at 0 of 351 and the detection over Spanish
files does not drop a single line. It costs nothing and buys the case above, because
a comment written in Spanish is not Spanish only inside its quotes.

It applies to test names too, and for the same case: `search.test.ts` has one that
reads «strips that tilde too, so «espanol» finds «Español»». Rewriting it without the
examples would leave a test whose name no longer says what it checks.
"""
QUOTED = re.compile(r'«[^»]*»')


def is_spanish(text: str) -> tuple[bool, str]:
    """Graded evidence: one strong signal, or two weak ones in the same line."""
    if STRONG.search(text):
        return True, f'acento o ñ: {STRONG.search(text).group()!r}'

    found = sorted({w.lower() for w in WORDS.findall(text) if w.lower() in WEAK})
    if len(found) >= 2:
        return True, 'palabras españolas: ' + ', '.join(found[:4])

    return False, ''


def looks_like_code(path: str) -> bool:
    """Whether this file's prose falls under the language rule.

    AND IT ALSO LOOKS AT FILES WITH NO EXTENSION, which is #324's finding and not a
    detail: `scripts/hooks/pre-push` is an executable without a suffix, so by
    extension alone it was invisible here — and it sat in the tree with twenty
    Spanish comment lines while `--all` reported «sin problemas en el árbol entero».
    A checker that gives a reassuring zero over a file it never opened is the
    failure of #184 all over again, this time in the only net the rule has left.

    What identifies them is the shebang, because that is what makes them code:
    guessing by name would need a list, and a list is one more thing to keep.
    """
    parts = set(Path(path).parts)
    if parts & EXCLUDED_PARTS:
        return False
    if Path(path).suffix in CODE_SUFFIXES:
        return True
    return not Path(path).suffix and has_shebang(path)


def has_shebang(path: str) -> bool:
    """Reads only the first two bytes: this runs over every file in the tree."""
    try:
        with open(ROOT / path, 'rb') as handle:
            return handle.read(2) == b'#!'
    except OSError:
        return False


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
        name = match.group('name') or match.group('py').replace('_', ' ')
        out.append(('nombre de test', QUOTED.sub(' ', name)))

    comment = COMMENT.match(line)
    if comment and comment.group('text').strip():
        out.append(('comentario', QUOTED.sub(' ', comment.group('text'))))
    return out


"""
How much comment a file may lose before this complains.

NOT GUESSED — MEASURED, which is what #316 asks for. Two files of `lib/vault` were
converted by hand, rewriting the argument in English rather than running the text
through a translator, and the comment count moved like this:

    keyInMemory.ts   28 -> 26 lines   7.1 % fewer
    unlock.ts        24 -> 24 lines   0.0 % fewer

English is shorter than Spanish, so a faithful conversion does shrink a little when
the lines are re-wrapped. Demanding the same count would push people to pad, which is
worse than losing a line. The margin is a bit over twice the worst case measured.

THE FLOOR MATTERS MORE THAN THE PERCENTAGE for small files: without it, a file with
twelve comment lines could quietly drop one whole block and stay under 15 %.
"""
CENSUS_TOLERANCE = 0.15
CENSUS_FLOOR = 3

# The way out, which has to carry a reason: a check nobody can pass when the loss is
# deliberate — #323 deletes a file on purpose — is a check that gets bypassed whole.
CENSUS_ESCAPE = re.compile(r'^Censo:\s*\S+', re.MULTILINE)


def comment_lines(text: str) -> int:
    """Comment lines in one file, in any language.

    Test names are deliberately NOT counted. A test name does not go missing on its
    own — the test goes with it — and the suite already fails loudly when a case
    disappears. Counting them here would only add noise from tests legitimately
    merged or split.

    THE CLOSING `*/` COUNTS, because `COMMENT` reads it as a comment holding a slash.
    Left as it is on purpose: fixing it would mean touching the pattern the main mode
    depends on, whose precision is measured, and the census compares two counts taken
    the same way — so a closer present on both sides cancels out. What it does mean is
    that the absolute number runs a little above the lines that carry prose.
    """
    return sum(1 for line in text.splitlines()
               for kind, _ in candidates(line) if kind == 'comentario')


def census_at(ref: str) -> dict[str, int]:
    """Comment lines per file as of `ref`."""
    counts = {}
    for path in run('git', 'ls-tree', '-r', '--name-only', ref).splitlines():
        if not looks_like_code(path):
            continue
        try:
            counts[path] = comment_lines(run('git', 'show', f'{ref}:{path}'))
        except RuntimeError:
            continue
    return counts


def census_now() -> dict[str, int]:
    """Comment lines per file in the WORKING TREE.

    The working tree and not HEAD, for the same reason `added_lines` reads it: this is
    useful before committing, and a census that only sees committed work would give a
    clean bill to a file whose comments were just deleted.
    """
    counts = {}
    listing = run('git', 'ls-files') + run('git', 'ls-files', '--others', '--exclude-standard')
    for path in listing.splitlines():
        if not looks_like_code(path):
            continue
        try:
            counts[path] = comment_lines((ROOT / path).read_text(encoding='utf-8', errors='replace'))
        except OSError:
            continue
    return counts


def allowed_loss(before: int) -> int:
    """How many lines this file may lose without a word."""
    return max(CENSUS_FLOOR, round(before * CENSUS_TOLERANCE))


def census(base: str, pr_body: Path | None) -> int:
    """Fails when a file loses comment, which is how a conversion goes wrong quietly."""
    try:
        merge_base = run('git', 'merge-base', base, 'HEAD').strip()
    except RuntimeError:
        merge_base = base

    try:
        before = census_at(merge_base)
    except RuntimeError as error:
        print(f'✗ no se pudo leer el censo de {base}: {error}', file=sys.stderr)
        return 1

    after = census_now()

    losses = []
    for path, was in sorted(before.items()):
        now = after.get(path, 0)
        gone = was - now
        if gone > allowed_loss(was):
            missing = ' (fichero borrado)' if path not in after else ''
            losses.append((path, was, now, gone, missing))

    total_before = sum(before.values())
    total_after = sum(after.get(path, 0) for path in before)
    added = sum(count for path, count in after.items() if path not in before)

    print(f'  comentario en los ficheros que ya existían: {total_before} -> {total_after} líneas'
          f' ({total_after - total_before:+d})')
    if added:
        print(f'  y {added} líneas en ficheros nuevos')

    if not losses:
        print(f'✓ censo de comentarios: ningún fichero pierde comentario sobre {base}')
        return 0

    escaped = pr_body is not None and CENSUS_ESCAPE.search(pr_body.read_text(encoding='utf-8'))
    mark = '⚠' if escaped else '✗'
    print(f'{mark} ficheros que pierden comentario sobre {base}: {len(losses)}', file=sys.stderr)
    for path, was, now, gone, missing in losses[:40]:
        print(f'    {path}{missing}: {was} -> {now} líneas, {gone} menos'
              f' (se permitían {allowed_loss(was)})', file=sys.stderr)
    if len(losses) > 40:
        print(f'    … y {len(losses) - 40} más', file=sys.stderr)

    if escaped:
        print('\n  El cuerpo del PR lo justifica con «Censo:», así que esto no bloquea.',
              file=sys.stderr)
        return 0

    print('\n  Convertir un comentario al inglés no lo acorta tanto: medido sobre dos',
          file=sys.stderr)
    print('  ficheros de lib/vault, un 7,1 % y un 0 %. Una caída mayor suele ser un',
          file=sys.stderr)
    print('  comentario BORRADO en vez de traducido, y eso se lleva por delante lo que',
          file=sys.stderr)
    print('  #290 quiere conservar. Si la pérdida es deliberada, escribe en el cuerpo',
          file=sys.stderr)
    print('  del PR una línea «Censo: <motivo>».', file=sys.stderr)
    return 1


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
    parser.add_argument('--census', action='store_true')
    parser.add_argument('--measure', action='store_true')
    parser.add_argument('--pr-body', type=Path, default=None)
    options = parser.parse_args()

    if options.measure:
        return measure()

    if options.census:
        return census(options.base, options.pr_body)

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
