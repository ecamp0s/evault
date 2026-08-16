#!/usr/bin/env python3
"""Comprobaciones de documentación y de higiene del repositorio.

Existe por el issue #62, y su problema de fondo no era que faltara un check:
era que **la ausencia de un check no significaba nada**. Un PR de solo
documentación no disparaba ningún job, y un PR en conflicto tampoco, porque
GitHub no ejecuta los workflows de un PR que no puede mergear. Los dos síntomas
eran idénticos.

Lo que este comando comprueba sale, una a una, de cosas que ya pasaron:

- **Marcadores de conflicto**, porque el conflicto en `STATUS.md` es estructural:
  el bot lo regenera en `master` cada vez que se mergea algo.
- **Los seis marcadores de sección manual de `STATUS.md`**, que es lo único
  irrecuperable si alguien resuelve ese conflicto quedándose con la versión del
  bot.
- **Bytes NUL en ficheros de texto**, que es #184: uno en `import.ts` lo hizo
  invisible para `grep` durante tres días y sobrevivió a una migración entera y
  a la evaluación de un criterio de salida.
- **Referencias a documentos que no existen**, que es la referencia de
  `vite.config.ts` a `docs/architecture/SEGURIDAD.md`, rota desde que se escribió.
- **Que un PR que cierra un issue toque `SPRINT_CONTEXT.md`**, que la Definition
  of Done exige y que durante la Iteración 2 se saltó tres veces seguidas.

Uso:
    scripts/check-docs.py                      # todas las comprobaciones locales
    scripts/check-docs.py --pr-body FICHERO --changed-files FICHERO
                                               # añade la regla de SPRINT_CONTEXT
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

# Las seis secciones que `status.py` preserva al regenerar. Si desaparece una, el
# generador la rellena con su valor por defecto y el trabajo escrito a mano se
# pierde sin que nada falle.
MANUAL_SECTIONS = ('objetivo', 'salida', 'riesgos')

# Extensiones que son binarias por definición y donde un byte NUL es normal.
BINARY_SUFFIXES = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2',
                   '.ttf', '.otf', '.zip', '.gz', '.evault'}

# Una referencia a un documento del repositorio, en Markdown o dentro de un
# comentario de código. Se exige que el fichero exista.
DOC_REFERENCE = re.compile(r'(?<![\w/.-])(docs/[\w./-]+\.md)')

# La convención del proyecto para que GitHub cierre el issue al mergear.
CLOSES = re.compile(r'\bCloses #(\d+)', re.IGNORECASE)

# La vía de escape, que tiene que llevar motivo: un check que no se puede saltar
# cuando toca acaba ignorándose entero.
ESCAPE = re.compile(r'^Sin SPRINT_CONTEXT:\s*\S+', re.MULTILINE)


def tracked_files() -> list[Path]:
    """Los ficheros del repositorio, rastreados y sin rastrear.

    `--others --exclude-standard` no es un adorno: sin ellos `git ls-files` solo
    ve lo que ya está en el índice, y un fichero recién escrito es INVISIBLE para
    este comando hasta que alguien lo añade. Pasó al escribirlo: en local decía
    «todo en orden» y en CI encontró cuatro problemas, porque en CI el fichero ya
    estaba commiteado. Es la misma familia que #184 — un fichero que el auditor
    no mira— con otra causa.

    `--exclude-standard` respeta .gitignore, así que node_modules, vendor y dist
    quedan fuera sin tener que listarlos.
    """
    salida = subprocess.run(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        cwd=ROOT, capture_output=True, check=True,
    )
    return [ROOT / n.decode() for n in salida.stdout.split(b'\0') if n]


def is_text(path: Path) -> bool:
    return path.suffix.lower() not in BINARY_SUFFIXES


def check_nul_bytes(files: list[Path]) -> list[str]:
    """Un byte NUL convierte un fichero de texto en invisible para las auditorías."""
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
    """`<<<<<<<` y `>>>>>>>` son inequívocos; `=======` también subraya títulos en Markdown."""
    problems = []
    for path in files:
        if not is_text(path):
            continue
        for number, line in enumerate(path.read_bytes().split(b'\n'), start=1):
            if line.startswith(b'<<<<<<<') or line.startswith(b'>>>>>>>'):
                problems.append(f'{path.relative_to(ROOT)}:{number}: marcador de conflicto sin resolver')
    return problems


def check_status_markers() -> list[str]:
    """Sin sus marcadores, `status.py` rellena las secciones manuales con el valor por defecto."""
    path = ROOT / STATUS
    if not path.exists():
        return [f'{STATUS}: no existe']
    text = path.read_text(encoding='utf-8')
    missing = [
        f'{STATUS}: falta el marcador <!-- {borde}manual:{nombre} -->'
        for nombre in MANUAL_SECTIONS
        for borde in ('', '/')
        if f'<!-- {borde}manual:{nombre} -->' not in text
    ]
    return missing


# Los dos ficheros que HABLAN de referencias rotas y por tanto las contienen: este
# comando, que las documenta, y sus tests, que las plantan a propósito. Excluirlos
# es lo mismo que hace cualquier linter con sus propias fixtures.
#
# La alternativa era un marcador de supresión, y se descartó: en prosa se resuelve
# mejor no nombrando la ruta muerta —así se reescribió el criterio 7 de STATUS.md—,
# y un mecanismo de supresión general invita a usarlo para callar hallazgos reales.
SELF_REFERENTIAL = ('scripts/check-docs.py', 'scripts/tests/test_check_docs.py')


def check_doc_references(files: list[Path]) -> list[str]:
    """Una referencia a un documento que no existe envejece sin que se note."""
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


def check_sprint_context(pr_body: str, changed: list[str]) -> list[str]:
    """La Definition of Done pide actualizar SPRINT_CONTEXT.md al cerrar un issue.

    Se comprueba que el fichero se ha tocado, no lo que dice: el contenido es
    criterio humano y no se puede generar. Es la distinción con STATUS.md, que sí
    es generado porque su fuente de verdad está en GitHub.
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
    ]

    if options.pr_body is not None:
        body = options.pr_body.read_text(encoding='utf-8') if options.pr_body.exists() else ''
        changed = []
        if options.changed_files is not None and options.changed_files.exists():
            changed = options.changed_files.read_text(encoding='utf-8').split()
        checks.append(('SPRINT_CONTEXT.md al cerrar un issue', check_sprint_context(body, changed)))

    total = 0
    for nombre, problems in checks:
        marca = '✗' if problems else '✓'
        print(f'{marca} {nombre}: {len(problems) or "sin problemas"}')
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
