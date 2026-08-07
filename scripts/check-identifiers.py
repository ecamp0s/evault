#!/usr/bin/env python3
"""Comprueba que los identificadores del código estén en inglés.

CLAUDE.md fija la regla: lo que ejecuta la máquina va en inglés, lo que lee una
persona va en español. Este comando la comprueba, y existe porque afirmarla no
bastaba: el criterio de salida 7 de la Iteración 4 dio por hecho que se cumplía
y quedaban más de cien identificadores en español (#153), y el inventario que
salió de ahí se quedó corto tres veces seguidas (#160).

CÓMO DECIDE SI UN IDENTIFICADOR ESTÁ EN INGLÉS

Parte el identificador en palabras y exige que CADA UNA esté en la lista de
`identifiers/english.txt`. Lo que no reconoce, lo reporta.

Es una lista de permitidos y no de prohibidos, y la diferencia es la razón de
ser de este comando. Una lista de palabras españolas prohibidas falla en
silencio: la que no esté escrita pasa, y nadie se entera. Una lista de palabras
inglesas permitidas falla ruidosamente: lo que no esté escrito se reporta, y
meter una palabra española en el fichero de inglés es un acto visible que queda
en el diff de un PR. Un comprobador que omite en silencio devuelve un cero
tranquilizador y es peor que no tener comprobador (#184).

El precio es que una palabra inglesa nueva y legítima se reporta hasta que
alguien la añade. Es el precio correcto: obliga a decidir, en vez de decidir por
omisión.

LO QUE NO COMPRUEBA, Y HAY QUE SABERLO

Vocabulario, no gramática. `useVaultPersonal` son tres palabras inglesas en
orden español, y pasa. Para eso no hay comando: hace falta leerlo.

QUÉ MIRA

Identificadores DECLARADOS, extraídos con el analizador real de cada lenguaje
—el AST de TypeScript, el lexer de PHP, el módulo `ast` de Python— y no con
expresiones regulares, que es como el inventario de #160 se quedó en 27 cuando
eran más de cien: no veía el destructuring.

No mira literales de cadena. No son identificadores, y ahí es donde viven las
claves de configuración y los nombres de ruta, que son datos. Dejarlos fuera por
construcción es más seguro que excluirlos uno a uno.

Uso:
    scripts/check-identifiers.py                 # producción; falla si encuentra algo
    scripts/check-identifiers.py --all           # producción y tests
    scripts/check-identifiers.py --area web      # solo un área
    scripts/check-identifiers.py --unknown-words # las palabras a curar, una por línea
    scripts/check-identifiers.py --json          # para consumir desde otro proceso
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(__file__).resolve().parent / 'identifiers'

# Partir un identificador en palabras: SCREAMING_SNAKE, camelCase, PascalCase,
# snake_case y los acrónimos pegados a una palabra (APIKey -> API, Key).
WORDS = re.compile(r'[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|[0-9]+')

# Los campos del blob. No son identificadores: son las claves de lo que hay
# cifrado dentro de cada item ya guardado, porque el contenido se serializa con
# JSON.stringify y se cifra tal cual. Renombrarlos rompe los items existentes y
# ningún compilador avisa. Documentado en CLAUDE.md y en web/src/lib/vault/types.ts.
#
# Solo se excluyen donde son el contrato —el destructuring de `item.content` y
# los miembros de la interfaz ItemContent—, nunca dentro de un identificador
# compuesto. Así `olvidarUsuario` y el parámetro `nombre` de `descargar()` siguen
# saliendo, que es lo correcto: esos sí son español nuestro.
BLOB_FIELDS = frozenset({'nombre', 'usuario', 'password', 'url', 'notas'})


class MeasurementError(Exception):
    """Algo impidió medir. Nunca se convierte en un cero: se propaga y rompe."""


def is_unknown(word: str, english: set[str]) -> bool:
    """Una palabra que no se reconoce como inglesa.

    Los dígitos y las letras sueltas no son palabras de ningún idioma: `base64`,
    `toBase32` y las variables de bucle `i`, `n` o `x` no dicen nada sobre en qué
    idioma está escrito el código. Se dejan pasar aquí y no en la lista, porque
    meterlas allí las convertiría en «inglés», que es falso.
    """
    if word.isdigit() or len(word) == 1:
        return False
    return word.lower() not in english


@dataclass(frozen=True)
class Area:
    """Un trozo del árbol con su extractor y su naturaleza."""

    name: str
    extractor: str  # 'ts' | 'php' | 'python' | 'workflow'
    patterns: tuple[str, ...]
    tests: bool = False
    exclude: tuple[str, ...] = ()


# El ámbito. Es lo que más se ha equivocado en este proyecto, así que va
# explícito y con el motivo de cada exclusión al lado.
#
# NO es «web/src y api/app». Ese ámbito, más estrecho que la regla que decía
# comprobar, es exactamente lo que hundió el criterio de salida 7: dejaba fuera
# web/vite.config.ts, que es código igual y además decide cómo se construye lo
# que se despliega. Y dejaba fuera scripts/, que es donde más español hay.
AREAS: tuple[Area, ...] = (
    Area(
        name='web',
        extractor='ts',
        patterns=('web/src/**/*.ts', 'web/src/**/*.tsx', 'web/*.config.ts'),
        # `web/src/test/**` a secas no vale: en pathlib, `**` al final encaja con
        # directorios y no con los ficheros de dentro, así que los helpers de test
        # se colaban en el área de producción. Encontrado ejecutándolo, no leyéndolo.
        exclude=('web/src/**/*.test.ts', 'web/src/**/*.test.tsx', 'web/src/test/**/*'),
    ),
    Area(
        name='web-tests',
        extractor='ts',
        patterns=('web/src/**/*.test.ts', 'web/src/**/*.test.tsx', 'web/src/test/**/*.ts'),
        tests=True,
    ),
    Area(
        name='api',
        extractor='php',
        # database/migrations queda fuera y no es un olvido: el nombre de una
        # migración aplicada es el valor que Laravel guarda en la tabla
        # `migrations` para saber qué está ejecutado. Renombrarlo hace que crea
        # que hay una migración nueva sin aplicar y que la aplicada desapareció.
        # Es la misma categoría que los campos del blob: parece identificador y
        # es dato. Decidido en #160; las migraciones nuevas se escriben en
        # inglés, que ya se venía haciendo.
        patterns=('api/app/**/*.php', 'api/config/**/*.php', 'api/routes/**/*.php',
                  'api/database/factories/**/*.php', 'api/database/seeders/**/*.php'),
    ),
    Area(
        name='api-tests',
        extractor='php',
        patterns=('api/tests/**/*.php',),
        tests=True,
    ),
    Area(
        name='scripts',
        extractor='python',
        patterns=('scripts/*.py',),
    ),
    Area(
        name='workflows',
        extractor='workflow',
        # Solo los identificadores: los id de job y de step. Los `name:` NO se
        # miran, y es deliberado: son el texto que una persona lee en la interfaz
        # de Actions, así que por la regla de CLAUDE.md van en español. Además
        # GitHub nombra el check por el `name:`, de modo que renombrar un id no
        # toca ningún check requerido.
        patterns=('.github/workflows/*.yml', '.github/workflows/*.yaml'),
    ),
)


@dataclass
class Finding:
    file: str
    line: int
    identifier: str
    words: list[str]


@dataclass
class Report:
    area: str
    files: int = 0
    identifiers: int = 0
    findings: list[Finding] = field(default_factory=list)


def load_english() -> set[str]:
    path = DATA / 'english.txt'
    if not path.exists():
        raise MeasurementError(f'falta la lista de palabras inglesas: {path}')
    words = set()
    for line in path.read_text(encoding='utf-8').splitlines():
        clean = line.split('#', 1)[0].strip().lower()
        if clean:
            words.add(clean)
    if not words:
        raise MeasurementError(f'{path} está vacío: sin lista no hay medición')
    return words


def files_of(area: Area, base: Path = ROOT) -> list[Path]:
    found: set[Path] = set()
    for pattern in area.patterns:
        found.update(p for p in base.glob(pattern) if p.is_file())
    for pattern in area.exclude:
        found.difference_update(base.glob(pattern))
    return sorted(found)


def display(path: Path, base: Path) -> str:
    """La ruta como se enseña: relativa a la raíz, o absoluta si cae fuera."""
    try:
        return str(path.relative_to(base))
    except ValueError:
        return str(path)


def run_extractor(command: list[str], stdin: str, what: str) -> dict:
    process = subprocess.run(command, input=stdin, capture_output=True, text=True, cwd=ROOT)
    if process.returncode != 0:
        raise MeasurementError(f'{what} falló con código {process.returncode}:\n{process.stderr.strip()}')
    try:
        return json.loads(process.stdout)
    except json.JSONDecodeError as error:
        raise MeasurementError(f'{what} no devolvió JSON: {error}') from error


def extract_ts(files: list[Path]) -> dict[str, list[dict]]:
    stdin = '\n'.join(str(f) for f in files)
    return run_extractor(['node', 'scripts/identifiers/extract_ts.mjs'], stdin,
                         'el extractor de TypeScript')


def extract_php(files: list[Path]) -> dict[str, list[dict]]:
    stdin = '\n'.join(str(f) for f in files)
    return run_extractor(['php', 'scripts/identifiers/extract_php.php'], stdin,
                         'el extractor de PHP')


def extract_python(files: list[Path]) -> dict[str, list[dict]]:
    """Identificadores declarados en Python, con el módulo `ast` de la stdlib."""
    output: dict[str, list[dict]] = {}
    for path in files:
        relative = str(path)
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except (SyntaxError, UnicodeDecodeError) as error:
            raise MeasurementError(f'{relative}: no se pudo parsear ({error})') from error
        found: list[dict] = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                found.append({'name': node.name, 'line': node.lineno})
            elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                found.append({'name': node.id, 'line': node.lineno})
            elif isinstance(node, ast.arg):
                found.append({'name': node.arg, 'line': node.lineno})
        output[relative] = found
    return output


# Un id de job va con dos espacios de sangría bajo `jobs:`; uno de step, tras `- id:`.
JOB_ID = re.compile(r'^  ([A-Za-z_][\w-]*):\s*$')
STEP_ID = re.compile(r'^\s*-?\s*id:\s*([A-Za-z_][\w-]*)\s*$')
# Las claves del esquema de Actions no las escribimos nosotros.
SCHEMA_KEYS = {'on', 'jobs', 'env', 'defaults', 'permissions', 'concurrency', 'run', 'push',
               'pull_request', 'schedule', 'workflow_dispatch', 'workflow_call', 'inputs', 'secrets'}


def extract_workflow(files: list[Path]) -> dict[str, list[dict]]:
    output: dict[str, list[dict]] = {}
    for path in files:
        relative = str(path)
        found: list[dict] = []
        inside_jobs = False
        for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), start=1):
            if line and not line[0].isspace() and not line.startswith('#'):
                inside_jobs = line.startswith('jobs:')
                continue
            if inside_jobs and (match := JOB_ID.match(line)) and match.group(1) not in SCHEMA_KEYS:
                found.append({'name': match.group(1), 'line': number})
            elif match := STEP_ID.match(line):
                found.append({'name': match.group(1), 'line': number})
        output[relative] = found
    return output


EXTRACTORS = {
    'ts': extract_ts,
    'php': extract_php,
    'python': extract_python,
    'workflow': extract_workflow,
}


def is_blob_contract(entry: dict) -> bool:
    """El identificador es un campo del blob donde el blob es el contrato.

    `shorthand` marca el destructuring sin renombrar —`const { nombre } = item.content`—
    y `dataKey` los miembros de una interfaz, que es donde vive `ItemContent`.
    Fuera de esos dos sitios, un `nombre` es español nuestro y tiene que salir.
    """
    return entry['name'] in BLOB_FIELDS and (entry.get('shorthand') or entry.get('dataKey'))


def review(area: Area, english: set[str], base: Path = ROOT) -> Report:
    files = files_of(area, base)
    report = Report(area=area.name, files=len(files))
    if not files:
        return report

    extracted = EXTRACTORS[area.extractor](files)

    # Un extractor que devuelve menos ficheros de los que se le dieron ha omitido
    # alguno, y omitir en silencio es el fallo que este comando existe para no
    # repetir. Se comprueba en vez de confiar.
    expected = {str(f) for f in files}
    if set(extracted) != expected:
        missing = sorted(expected - set(extracted))
        raise MeasurementError(
            f'el extractor de «{area.name}» omitió {len(missing)} fichero(s): {missing[:5]}')

    for path, identifiers in sorted(extracted.items()):
        shown = display(Path(path), base)
        seen: set[str] = set()
        for entry in identifiers:
            name = entry['name']
            if name in seen or is_blob_contract(entry):
                continue
            seen.add(name)
            report.identifiers += 1
            unknown = [w for w in WORDS.findall(name) if is_unknown(w, english)]
            if unknown:
                report.findings.append(Finding(shown, entry['line'], name, unknown))
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description='Comprueba que los identificadores estén en inglés.')
    parser.add_argument('--all', action='store_true', help='incluir también los ficheros de test')
    parser.add_argument('--area', action='append', help='revisar solo estas áreas')
    parser.add_argument('--json', action='store_true', help='salida en JSON')
    parser.add_argument('--unknown-words', action='store_true',
                        help='listar las palabras no reconocidas, para curar english.txt')
    options = parser.parse_args()

    try:
        english = load_english()
        areas = [a for a in AREAS if options.all or not a.tests]
        if options.area:
            requested = set(options.area)
            unknown_areas = requested - {a.name for a in AREAS}
            if unknown_areas:
                raise MeasurementError(f'áreas desconocidas: {sorted(unknown_areas)}')
            areas = [a for a in areas if a.name in requested]
        reports = [review(area, english) for area in areas]
    except MeasurementError as error:
        print(f'ERROR: {error}', file=sys.stderr)
        print('No medir no es medir cero: esto NO cuenta como comprobación superada.', file=sys.stderr)
        return 2

    if options.unknown_words:
        words = sorted({w.lower() for r in reports for f in r.findings for w in f.words})
        print('\n'.join(words))
        return 0

    total = sum(len(r.findings) for r in reports)

    if options.json:
        print(json.dumps({
            'total': total,
            'areas': [{'area': r.area, 'files': r.files, 'identifiers': r.identifiers,
                       'findings': [vars(f) for f in r.findings]} for r in reports],
        }, ensure_ascii=False, indent=2))
        return 1 if total else 0

    for report in reports:
        print(f'{report.area}: {len(report.findings)} de {report.identifiers} '
              f'identificadores en {report.files} ficheros')
        for finding in report.findings:
            print(f'  {finding.file}:{finding.line}  {finding.identifier}'
                  f'  ({", ".join(finding.words)})')
        print()

    if total:
        print(f'{total} identificadores con palabras no reconocidas como inglesas.')
        print('Si alguna es inglesa y legítima, añádela a scripts/identifiers/english.txt.')
        return 1

    print('Cero identificadores con palabras no reconocidas como inglesas.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
