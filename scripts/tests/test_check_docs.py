#!/usr/bin/env python3
"""Tests de las comprobaciones de documentación.

El criterio de aceptación de #62 no era «que el job exista», era que **detecte
cada caso roto a propósito**. Eso es lo que hay aquí: un fichero con un marcador
de conflicto plantado, otro con un byte NUL, un STATUS.md al que se le quita un
marcador de sección, una referencia a un documento que no está, y un cuerpo de
PR que cierra un issue sin tocar SPRINT_CONTEXT.

    python3 -m unittest discover -s scripts/tests
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent.parent


def _cargar():
    ruta = RAIZ / 'scripts' / 'check-docs.py'
    spec = importlib.util.spec_from_file_location('check_docs', ruta)
    modulo = importlib.util.module_from_spec(spec)
    sys.modules['check_docs'] = modulo
    spec.loader.exec_module(modulo)
    return modulo


docs = _cargar()

STATUS_MINIMO = '\n'.join(
    f'<!-- manual:{n} -->\ncontenido\n<!-- /manual:{n} -->' for n in docs.MANUAL_SECTIONS
)


class Arbol:
    """Un repositorio de prueba, con git de verdad porque el comando usa git ls-files."""

    def __init__(self, prueba: unittest.TestCase):
        self.base = Path(prueba.enterContext(tempfile.TemporaryDirectory()))
        subprocess.run(['git', 'init', '-q'], cwd=self.base, check=True)
        self.escribir(docs.STATUS, STATUS_MINIMO)
        self.escribir(docs.SPRINT_CONTEXT, 'punto de trabajo\n')
        prueba.enterContext(self.apuntando())

    def apuntando(self):
        """Hace que el comando mire este árbol y no el repositorio de verdad."""
        import contextlib

        @contextlib.contextmanager
        def cambiar():
            original = docs.ROOT
            docs.ROOT = self.base
            try:
                yield
            finally:
                docs.ROOT = original

        return cambiar()

    def escribir(self, nombre: str, contenido: str | bytes) -> Path:
        destino = self.base / nombre
        destino.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(contenido, bytes):
            destino.write_bytes(contenido)
        else:
            destino.write_text(contenido, encoding='utf-8')
        subprocess.run(['git', 'add', '-A'], cwd=self.base, check=True, capture_output=True)
        return destino

    def ficheros(self):
        return docs.tracked_files()


class BytesNul(unittest.TestCase):
    """La lección de #184: un byte NUL hace invisible un fichero para las auditorías."""

    def setUp(self):
        self.arbol = Arbol(self)

    def test_detecta_un_byte_nul_plantado(self):
        self.arbol.escribir('src/a.ts', b'const x = 1\nconst y = "a\x00b"\n')
        problemas = docs.check_nul_bytes(self.arbol.ficheros())
        self.assertEqual(len(problemas), 1)
        self.assertIn('src/a.ts:2', problemas[0])

    def test_no_marca_un_fichero_limpio(self):
        self.arbol.escribir('src/a.ts', 'const x = 1\n')
        self.assertEqual(docs.check_nul_bytes(self.arbol.ficheros()), [])

    def test_no_marca_un_binario_de_verdad(self):
        # Un PNG lleva bytes NUL por definición y no es un problema.
        self.arbol.escribir('docs/assets/x.png', b'\x89PNG\r\n\x1a\n\x00\x00\x00')
        self.assertEqual(docs.check_nul_bytes(self.arbol.ficheros()), [])


class MarcadoresDeConflicto(unittest.TestCase):
    def setUp(self):
        self.arbol = Arbol(self)

    def test_detecta_un_marcador_plantado(self):
        self.arbol.escribir('docs/x.md', 'antes\n<<<<<<< HEAD\nmío\n=======\nsuyo\n>>>>>>> otra\n')
        problemas = docs.check_conflict_markers(self.arbol.ficheros())
        self.assertEqual(len(problemas), 2, 'el de apertura y el de cierre')

    def test_no_confunde_un_titulo_de_markdown_con_un_conflicto(self):
        # `=======` subraya títulos en Markdown, así que no se mira: solo los
        # marcadores de siete `<` o `>`, que son inequívocos.
        self.arbol.escribir('docs/x.md', 'Un título\n=========\n\ntexto\n')
        self.assertEqual(docs.check_conflict_markers(self.arbol.ficheros()), [])


class MarcadoresDeSeccionManual(unittest.TestCase):
    """Lo único irrecuperable si alguien resuelve el conflicto de STATUS.md mal."""

    def setUp(self):
        self.arbol = Arbol(self)

    def test_con_los_seis_marcadores_no_dice_nada(self):
        self.assertEqual(docs.check_status_markers(), [])

    def test_detecta_que_falta_uno(self):
        self.arbol.escribir(docs.STATUS, STATUS_MINIMO.replace('<!-- manual:riesgos -->', ''))
        problemas = docs.check_status_markers()
        self.assertEqual(len(problemas), 1)
        self.assertIn('manual:riesgos', problemas[0])

    def test_detecta_que_falta_el_de_cierre(self):
        self.arbol.escribir(docs.STATUS, STATUS_MINIMO.replace('<!-- /manual:objetivo -->', ''))
        self.assertIn('/manual:objetivo', docs.check_status_markers()[0])


class ReferenciasADocumentos(unittest.TestCase):
    """La referencia de vite.config.ts a un documento que nunca existió."""

    def setUp(self):
        self.arbol = Arbol(self)

    def test_detecta_una_referencia_a_un_documento_que_no_existe(self):
        self.arbol.escribir('web/vite.config.ts', '// Ver docs/architecture/SEGURIDAD.md.\n')
        problemas = docs.check_doc_references(self.arbol.ficheros())
        self.assertEqual(len(problemas), 1)
        self.assertIn('SEGURIDAD.md', problemas[0])

    def test_la_encuentra_tambien_dentro_de_codigo_y_no_solo_en_markdown(self):
        # Es que el caso real estaba en un comentario de TypeScript, no en un enlace.
        self.arbol.escribir('api/app/X.php', '<?php\n// ver docs/nope.md\n')
        self.assertEqual(len(docs.check_doc_references(self.arbol.ficheros())), 1)

    def test_no_marca_una_referencia_que_si_existe(self):
        self.arbol.escribir('docs/GUIDE.md', 'reglas\n')
        self.arbol.escribir('docs/README.md', 'ver docs/GUIDE.md\n')
        self.assertEqual(docs.check_doc_references(self.arbol.ficheros()), [])


class SprintContextAlCerrarUnIssue(unittest.TestCase):
    """La Definition of Done que durante la Iteración 2 se saltó tres veces."""

    def test_un_pr_que_cierra_un_issue_y_no_lo_toca_falla(self):
        problemas = docs.check_sprint_context('Arregla cosas.\n\nCloses #42', ['web/src/a.ts'])
        self.assertTrue(problemas)
        self.assertIn('cierra un issue', problemas[0])

    def test_el_mismo_pr_pasa_si_lo_toca(self):
        self.assertEqual(
            docs.check_sprint_context('Closes #42', ['web/src/a.ts', docs.SPRINT_CONTEXT]), []
        )

    def test_un_pr_que_no_cierra_ningun_issue_no_exige_nada(self):
        self.assertEqual(docs.check_sprint_context('Un arreglo suelto.', ['web/src/a.ts']), [])

    def test_la_via_de_escape_funciona_y_exige_motivo(self):
        con_motivo = 'Closes #42\n\nSin SPRINT_CONTEXT: no cambia el punto de trabajo'
        self.assertEqual(docs.check_sprint_context(con_motivo, ['web/src/a.ts']), [])

    def test_la_via_de_escape_sin_motivo_no_vale(self):
        # Un check que se salta escribiendo una palabra mágica sin explicar por qué
        # es un check que no existe.
        self.assertTrue(docs.check_sprint_context('Closes #42\n\nSin SPRINT_CONTEXT:', ['a.ts']))


class FicherosQueMira(unittest.TestCase):
    """Un fichero recién escrito tiene que contar, aunque nadie lo haya añadido."""

    def setUp(self):
        self.arbol = Arbol(self)

    def test_ve_un_fichero_sin_rastrear(self):
        # Sin --others, `git ls-files` solo ve el índice y un fichero nuevo es
        # invisible. Pasó al escribir este comando: verde en local, cuatro
        # problemas en CI, porque allí ya estaba commiteado.
        destino = self.arbol.base / 'docs' / 'nuevo.md'
        destino.write_text('sin git add\n', encoding='utf-8')
        nombres = {str(p.relative_to(self.arbol.base)) for p in docs.tracked_files()}
        self.assertIn('docs/nuevo.md', nombres)

    def test_un_fichero_nuevo_con_byte_nul_no_se_escapa(self):
        destino = self.arbol.base / 'src' / 'nuevo.ts'
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(b'const x = "a\x00b"\n')
        self.assertEqual(len(docs.check_nul_bytes(docs.tracked_files())), 1)


class ElRepositorioDeVerdad(unittest.TestCase):
    def test_pasa_sus_propias_comprobaciones(self):
        proceso = subprocess.run([sys.executable, str(RAIZ / 'scripts' / 'check-docs.py')],
                                 cwd=RAIZ, capture_output=True, text=True)
        self.assertEqual(proceso.returncode, 0, proceso.stdout)


if __name__ == '__main__':
    unittest.main()
