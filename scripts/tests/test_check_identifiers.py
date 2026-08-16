#!/usr/bin/env python3
"""Tests del comprobador de identificadores.

Existen por un motivo concreto y no por completitud: quien escribe el
comprobador es quien tiene que cumplir el criterio que mide, y entonces el
criterio se mide a sí mismo. Es lo que pasó con el inventario del issue #160, que
se quedó corto tres veces seguidas. La mitigación es plantar identificadores a
propósito y comprobar que salen.

Se ejecutan sin dependencias:

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
    """El módulo tiene un guion en el nombre, así que no se puede importar sin más."""
    ruta = RAIZ / 'scripts' / 'check-identifiers.py'
    spec = importlib.util.spec_from_file_location('check_identifiers', ruta)
    modulo = importlib.util.module_from_spec(spec)
    sys.modules['check_identifiers'] = modulo
    spec.loader.exec_module(modulo)
    return modulo


chk = _cargar()

# Un vocabulario mínimo, para que los tests no dependan de cómo evolucione
# english.txt. Lo que se prueba es el mecanismo, no la lista real.
INGLES = {'use', 'state', 'item', 'content', 'name', 'download', 'file', 'type',
          'read', 'export', 'editing', 'set', 'changes', 'filter', 'build', 'limits',
          'saved'}


class ParteEnPalabras(unittest.TestCase):
    def test_parte_camel_case_y_pascal_case(self):
        self.assertEqual(chk.WORDS.findall('useVaultPersonal'), ['use', 'Vault', 'Personal'])
        self.assertEqual(chk.WORDS.findall('ItemContent'), ['Item', 'Content'])

    def test_parte_screaming_snake_case(self):
        self.assertEqual(chk.WORDS.findall('CAMPOS_DEL_FORMULARIO'), ['CAMPOS', 'DEL', 'FORMULARIO'])

    def test_separa_el_acronimo_de_la_palabra_que_le_sigue(self):
        self.assertEqual(chk.WORDS.findall('APIKey'), ['API', 'Key'])


class PalabraDesconocida(unittest.TestCase):
    def test_una_palabra_que_no_esta_en_la_lista_es_desconocida(self):
        self.assertTrue(chk.is_unknown('formulario', INGLES))

    def test_una_palabra_de_la_lista_no_lo_es(self):
        self.assertFalse(chk.is_unknown('item', INGLES))
        self.assertFalse(chk.is_unknown('ITEM', INGLES), 'la comparación va en minúsculas')

    def test_los_digitos_y_las_letras_sueltas_no_son_de_ningun_idioma(self):
        # `base64` y `toBase32` no dicen nada sobre el idioma, ni las variables de bucle.
        self.assertFalse(chk.is_unknown('64', INGLES))
        self.assertFalse(chk.is_unknown('i', INGLES))


class Arbol:
    """Un árbol de prueba con un área que lo apunta."""

    def __init__(self, prueba: unittest.TestCase, extractor: str, patron: str):
        self.base = Path(prueba.enterContext(tempfile.TemporaryDirectory()))
        self.area = chk.Area(name='prueba', extractor=extractor, patterns=(patron,))

    def escribir(self, nombre: str, contenido: str | bytes) -> Path:
        destino = self.base / nombre
        destino.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(contenido, bytes):
            destino.write_bytes(contenido)
        else:
            destino.write_text(contenido, encoding='utf-8')
        return destino

    def revisar(self):
        return chk.review(self.area, INGLES, base=self.base)

    def marcados(self) -> set[str]:
        return {h.identifier for h in self.revisar().findings}


class TypeScript(unittest.TestCase):
    def setUp(self):
        self.arbol = Arbol(self, 'ts', 'src/*.ts')

    def test_detecta_un_identificador_en_espanol_plantado_a_proposito(self):
        self.arbol.escribir('src/a.ts', 'export const formulario = 1\n')
        self.assertIn('formulario', self.arbol.marcados())

    def test_no_marca_uno_en_ingles(self):
        self.arbol.escribir('src/a.ts', 'export const itemContent = 1\n')
        self.assertEqual(self.arbol.marcados(), set())

    def test_ve_el_destructuring_que_ninguna_busqueda_de_const_veia(self):
        # Es la tercera causa de que el inventario de #160 se quedara en 27:
        # buscar `const X =` no encuentra esto.
        self.arbol.escribir('src/a.ts', 'const [edicion, setEdicion] = useState()\n')
        self.assertEqual(self.arbol.marcados(), {'edicion', 'setEdicion'})

    def test_ve_los_parametros(self):
        self.arbol.escribir('src/a.ts', 'export function download(contenido: string) {}\n')
        self.assertIn('contenido', self.arbol.marcados())

    def test_ve_los_getters_y_los_setters(self):
        # Faltaban, y se notó leyendo y no ejecutando: `esDeValidacion` en
        # lib/api.ts es un getter y el comprobador lo daba por bueno. Encontrado
        # al hacer #179, después de que #189 publicara un recuento corto.
        self.arbol.escribir('src/a.ts', 'export class C {\n'
                                        '  get esDeValidacion() { return true }\n'
                                        '  set otroCampo(v: number) {}\n'
                                        '}\n')
        self.assertEqual(self.arbol.marcados(), {'esDeValidacion', 'otroCampo'})

    def test_un_fichero_que_no_se_puede_parsear_rompe_la_medicion(self):
        # No medir no puede parecerse a medir cero.
        self.arbol.escribir('src/a.ts', 'const roto = (((\n')
        with self.assertRaises(chk.MeasurementError):
            self.arbol.revisar()


class ByteNul(unittest.TestCase):
    """La lección de #184, convertida en test.

    `web/src/lib/vault/import.ts` llevaba un byte NUL, y la auditoría que se hizo
    con `grep` lo omitió sin avisar. Ninguna auditoría vio ese fichero desde que
    se creó, y por eso sobrevivió a la migración de #115 y a la evaluación del
    criterio de salida 7.

    El test NO comprueba qué hace `grep`, y es deliberado: depende de cuál sea.
    Medido el 7 de agosto de 2026 sobre este mismo fichero de prueba, `ugrep`
    7.5.0 devuelve «sin coincidencias» y no imprime nada, mientras que GNU grep
    3.11 sí encuentra la línea pero la sustituye por «Binary file … matches».
    Uno omite y el otro esconde, y ninguno de los dos es una medición. Lo que sí
    se puede comprobar, y es lo que importa, es que este comprobador lo ve.
    """

    def setUp(self):
        self.arbol = Arbol(self, 'ts', 'src/*.ts')
        self.fichero = self.arbol.escribir(
            'src/con-nul.ts',
            b'const separador = "a\x00b"\nexport const formulario = 1\n',
        )

    def test_el_fichero_de_prueba_lleva_de_verdad_un_byte_nul(self):
        # Sin esto, el test de abajo podría pasar por el motivo equivocado el día
        # que alguien toque el fixture y le quite el NUL sin darse cuenta.
        self.assertIn(b'\x00', self.fichero.read_bytes())

    def test_el_comprobador_ve_el_identificador_pese_al_byte_nul(self):
        self.assertIn('formulario', self.arbol.marcados())


class CamposDelBlob(unittest.TestCase):
    """No son identificadores: son las claves de lo que hay cifrado en cada item."""

    def setUp(self):
        self.arbol = Arbol(self, 'ts', 'src/*.ts')

    def test_el_destructuring_del_contenido_no_se_marca(self):
        self.arbol.escribir('src/a.ts', 'const { nombre, usuario } = item.content\n')
        self.assertEqual(self.arbol.marcados(), set())

    def test_los_miembros_de_la_interfaz_del_contrato_no_se_marcan(self):
        self.arbol.escribir('src/a.ts', 'export interface ItemContent {\n  nombre: string\n}\n')
        self.assertEqual(self.arbol.marcados(), set())

    def test_pero_el_mismo_nombre_como_parametro_si_se_marca(self):
        # `function descargar(contents: string, nombre: string)` es español nuestro,
        # no el contrato. Distinguirlo es lo que hace útil la exclusión.
        self.arbol.escribir('src/a.ts', 'export function download(nombre: string) {}\n')
        self.assertIn('nombre', self.arbol.marcados())

    def test_y_dentro_de_un_identificador_compuesto_tambien(self):
        self.arbol.escribir('src/a.ts', 'export const nombreDelFichero = 1\n')
        self.assertIn('nombreDelFichero', self.arbol.marcados())


class ClavePersistida(unittest.TestCase):
    """La clave vieja del store de sesión, que sigue leyéndose de localStorage."""

    def setUp(self):
        self.arbol = Arbol(self, 'ts', 'src/*.ts')

    def test_no_se_marca_donde_es_el_tipo_de_lo_guardado(self):
        # web/src/lib/session.ts la declara así para que el merge la lea. Renombrarla
        # no rompe la compilación: rompe la sesión guardada de quien viene de antes.
        self.arbol.escribir('src/a.ts', 'const saved = raw as {\n'
                                        '  usuarioRecordado?: string | null\n'
                                        '}\n')
        self.assertEqual(self.arbol.marcados(), set())

    def test_pero_una_variable_con_ese_nombre_si_se_marca(self):
        self.arbol.escribir('src/a.ts', 'const usuarioRecordado = 1\n')
        self.assertIn('usuarioRecordado', self.arbol.marcados())


class Php(unittest.TestCase):
    def setUp(self):
        self.arbol = Arbol(self, 'php', 'app/*.php')

    def test_detecta_una_funcion_en_espanol(self):
        self.arbol.escribir('app/A.php', '<?php\nfunction configurarLimites(): void {}\n')
        self.assertIn('configurarLimites', self.arbol.marcados())

    def test_detecta_una_variable_en_espanol(self):
        self.arbol.escribir('app/A.php', '<?php\n$entrada = 1;\n')
        self.assertIn('entrada', self.arbol.marcados())

    def test_no_mira_dentro_de_los_literales_de_cadena(self):
        # Ahí viven las claves de config/throttling.php y los nombres de ruta,
        # que son datos y no identificadores.
        self.arbol.escribir('app/A.php', "<?php\n" + chr(36) + "limits = ['autenticacion' => 5];\n")
        self.assertEqual(self.arbol.marcados(), set())

    def test_un_fichero_con_error_de_sintaxis_rompe_la_medicion(self):
        self.arbol.escribir('app/A.php', '<?php\nclass Roto {\n')
        with self.assertRaises(chk.MeasurementError):
            self.arbol.revisar()


class Python(unittest.TestCase):
    def setUp(self):
        self.arbol = Arbol(self, 'python', '*.py')

    def test_detecta_un_identificador_en_espanol(self):
        self.arbol.escribir('a.py', 'def construir_tabla():\n    pass\n')
        self.assertIn('construir_tabla', self.arbol.marcados())

    def test_un_fichero_que_no_compila_rompe_la_medicion(self):
        self.arbol.escribir('a.py', 'def roto(:\n')
        with self.assertRaises(chk.MeasurementError):
            self.arbol.revisar()


class Workflows(unittest.TestCase):
    def setUp(self):
        self.arbol = Arbol(self, 'workflow', '*.yml')
        self.arbol.escribir('w.yml', 'name: frontend\non:\n  push:\njobs:\n'
                                     '  cambios:\n    name: Detectar cambios\n'
                                     '    steps:\n      - id: filtro\n'
                                     '  build:\n    name: Build\n')

    def test_detecta_los_id_de_job_y_de_step_en_espanol(self):
        self.assertEqual(self.arbol.marcados(), {'cambios', 'filtro'})

    def test_no_mira_los_name_porque_son_texto_que_lee_una_persona(self):
        # `name: Detectar cambios` va en español por la regla de CLAUDE.md, y
        # además es lo que GitHub usa para nombrar el check.
        marcados = self.arbol.marcados()
        self.assertNotIn('Detectar', marcados)
        self.assertNotIn('Detectar cambios', marcados)


class NoMedirNoEsMedirCero(unittest.TestCase):
    """Lo que separa este comprobador de `grep`."""

    def test_si_el_extractor_omite_un_fichero_la_medicion_rompe(self):
        arbol = Arbol(self, 'ts', 'src/*.ts')
        arbol.escribir('src/a.ts', 'export const formulario = 1\n')
        arbol.escribir('src/b.ts', 'export const contenido = 1\n')

        original = chk.EXTRACTORS['ts']

        def olvidadizo(ficheros):
            salida = original(ficheros)
            salida.pop(next(iter(salida)))  # se «traga» uno, como hacía grep
            return salida

        chk.EXTRACTORS['ts'] = olvidadizo
        self.addCleanup(chk.EXTRACTORS.__setitem__, 'ts', original)

        with self.assertRaises(chk.MeasurementError) as capturado:
            arbol.revisar()
        self.assertIn('omitió', str(capturado.exception))

    def test_sin_lista_de_palabras_no_hay_medicion(self):
        original = chk.DATA
        chk.DATA = Path(tempfile.mkdtemp())
        self.addCleanup(setattr, chk, 'DATA', original)
        with self.assertRaises(chk.MeasurementError):
            chk.load_english()

    def test_una_lista_vacia_tampoco_cuenta_como_medicion(self):
        directorio = Path(self.enterContext(tempfile.TemporaryDirectory()))
        (directorio / 'english.txt').write_text('# solo comentarios\n', encoding='utf-8')
        original = chk.DATA
        chk.DATA = directorio
        self.addCleanup(setattr, chk, 'DATA', original)
        with self.assertRaises(chk.MeasurementError):
            chk.load_english()


class OrdenEspanol(unittest.TestCase):
    """Lo que #197 añadió: palabras inglesas colocadas en orden español.

    El comprobador mide vocabulario, así que `aItem` pasaba —`a` es letra suelta e
    `item` es inglés— y `useVaultPersonal` también. Había DOS aItem, y uno vivía en
    un fichero que el check daba por limpio.
    """

    def test_detecta_la_preposicion_pegada_a_otra_palabra(self):
        for nombre in ('aItem', 'deVault', 'porFecha', 'conFecha', 'enMemoria'):
            with self.subTest(nombre):
                self.assertIsNotNone(chk.spanish_word_order(nombre))

    def test_detecta_el_articulo_dentro_de_una_constante(self):
        self.assertEqual(chk.spanish_word_order('CAMPOS_DEL_FORMULARIO'), 'DEL')

    def test_no_marca_ingles_que_empieza_por_esas_letras(self):
        # El riesgo real del check: `deleteItem` empieza por «de», `elementRef` por
        # «el» y `largeFile` por «la». Si estos se marcaran, el check sería ruido y
        # acabaría ignorándose entero.
        for nombre in ('deleteItem', 'decrypted', 'elementRef', 'largeFile',
                       'unwrap', 'undoChanges', 'parseCsv', 'downloadFile', 'MAX_LENGTH'):
            with self.subTest(nombre):
                self.assertIsNone(chk.spanish_word_order(nombre))

    def test_no_confunde_el_final_de_un_acronimo_con_la_preposicion(self):
        # `a` solo cuenta en minúscula y al principio. En SVGFEFuncAElement la A es
        # el final de un acrónimo, y marcarla sería un falso positivo.
        self.assertIsNone(chk.spanish_word_order('SVGFEFuncAElement'))

    def test_lo_que_sigue_sin_cubrir_y_esta_documentado(self):
        # Tres palabras inglesas en orden español. No hay forma de verlo sin leer, y
        # el test existe para que nadie crea que el check lo cubre.
        self.assertIsNone(chk.spanish_word_order('useVaultPersonal'))

    def test_se_reporta_como_orden_y_no_como_vocabulario(self):
        # Se distinguen porque se arreglan distinto: el vocabulario se puede
        # resolver añadiendo a english.txt, y el orden no se resuelve nunca así.
        arbol = Arbol(self, 'ts', 'src/*.ts')
        arbol.escribir('src/a.ts', 'export const aItem = 1\n')
        hallazgos = arbol.revisar().findings
        self.assertEqual([h.identifier for h in hallazgos], ['aItem'])
        self.assertEqual(hallazgos[0].reason, 'orden')

    def test_un_identificador_con_vocabulario_espanol_no_se_reporta_dos_veces(self):
        arbol = Arbol(self, 'ts', 'src/*.ts')
        arbol.escribir('src/a.ts', 'export const deFecha = 1\n')
        hallazgos = arbol.revisar().findings
        self.assertEqual(len(hallazgos), 1)
        self.assertEqual(hallazgos[0].reason, 'vocabulario', 'gana el vocabulario, que es más concreto')


class ListaReal(unittest.TestCase):
    """Comprobaciones sobre english.txt, que es un dato y se puede editar mal."""

    def test_no_contiene_ninguna_palabra_con_tilde_ni_ene(self):
        # Un fichero llamado english.txt con `configuración` dentro es la forma
        # más fácil de convertir esto en una lista de prohibidos que no prohíbe.
        palabras = chk.load_english()
        con_acento = sorted(p for p in palabras if not p.isascii())
        self.assertEqual(con_acento, [], 'hay palabras no ASCII en english.txt')

    def test_el_propio_comprobador_pasa_su_propia_comprobacion(self):
        informe = chk.review(
            chk.Area(name='self', extractor='python', patterns=('scripts/check-identifiers.py',)),
            chk.load_english(),
        )
        self.assertEqual([h.identifier for h in informe.findings], [])


if __name__ == '__main__':
    unittest.main()
