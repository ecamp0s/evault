#!/usr/bin/env python3
"""Tests del generador de STATUS.md.

Los primeros que tiene, y eso es parte del hallazgo de #230: `status.py` era el
único fichero del utillaje sin ninguno, y es el que genera el documento público
de estado del proyecto. Un `first:100` sin paginar sobrevivió ahí porque no había
nada que pudiera detectarlo.

Lo que se prueba no es la paginación en abstracto: es que una consulta truncada
**falle** en vez de producir un documento más corto y plausible. Ese era el modo
de fallo real —el generador informó de que «ya estaba al día» omitiendo 16 issues
abiertos— y es lo que cada test de aquí rompe a propósito.

    python3 -m unittest discover -s scripts/tests
"""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent


def _load():
    path = ROOT / 'scripts' / 'status.py'
    spec = importlib.util.spec_from_file_location('status', path)
    module = importlib.util.module_from_spec(spec)
    sys.modules['status'] = module
    spec.loader.exec_module(module)
    return module


status = _load()


def issue_node(number: int, *, labels=(), blocked_by=(), blocking=()):
    """Un nodo de issue con la forma que devuelve GraphQL, con sus totalCount."""
    return {
        'number': number,
        'title': f'issue {number}',
        'state': 'OPEN',
        'url': f'https://example.test/{number}',
        'labels': {'totalCount': len(labels), 'nodes': [{'name': n} for n in labels]},
        'blockedBy': {
            'totalCount': len(blocked_by),
            'nodes': [{'number': n} for n in blocked_by],
        },
        'blocking': {
            'totalCount': len(blocking),
            'nodes': [{'number': n} for n in blocking],
        },
    }


class FakeGitHub:
    """Sustituye a `gh` devolviendo páginas preparadas.

    Registra los cursores recibidos, que es la única forma de comprobar que la
    paginación avanza de verdad y no pide dos veces la primera página.
    """

    def __init__(self, pages: list[dict], wrap=None):
        self.pages = pages
        self.wrap = wrap or (lambda page: {'repository': {'issues': page}})
        self.cursors: list[str | None] = []

    def __call__(self, *args: str) -> str:
        cursor = next(
            (a.split('=', 1)[1] for a in args if a.startswith('cursor=')), None
        )
        self.cursors.append(cursor)
        index = 0 if cursor is None else int(cursor)
        return json.dumps({'data': self.wrap(self.pages[index])})


def page(nodes, *, total, next_cursor=None):
    return {
        'totalCount': total,
        'pageInfo': {
            'hasNextPage': next_cursor is not None,
            'endCursor': next_cursor,
        },
        'nodes': nodes,
    }


class TestCheckPageComplete(unittest.TestCase):
    def test_pasa_cuando_se_leyo_todo(self):
        status.check_page_complete('sitio', 10, 10)

    def test_falla_cuando_falta_algo(self):
        with self.assertRaises(status.DataError) as caught:
            status.check_page_complete('repository.issues', 100, 117)
        self.assertIn('117', str(caught.exception))
        self.assertIn('100', str(caught.exception))

    def test_el_mensaje_dice_donde_fue(self):
        """Un error de truncamiento sin sitio no sirve: hay cinco conexiones."""
        with self.assertRaises(status.DataError) as caught:
            status.check_page_complete('issue #227.blockedBy', 3, 6)
        self.assertIn('issue #227.blockedBy', str(caught.exception))


class TestPaginate(unittest.TestCase):
    def test_lee_las_dos_paginas_de_una_conexion_partida(self):
        fake = FakeGitHub([
            page([issue_node(1)], total=2, next_cursor='1'),
            page([issue_node(2)], total=2),
        ])
        status.gh = fake

        nodes = status.paginate('query', ['repository', 'issues'])

        self.assertEqual([n['number'] for n in nodes], [1, 2])
        self.assertEqual(fake.cursors, [None, '1'])

    def test_una_sola_pagina_no_pide_la_siguiente(self):
        fake = FakeGitHub([page([issue_node(1)], total=1)])
        status.gh = fake

        status.paginate('query', ['repository', 'issues'])

        self.assertEqual(fake.cursors, [None])

    def test_falla_si_la_paginacion_no_avanza(self):
        """Es el bug de #230: la primera página completa y nadie sigue.

        La conexión dice tener 117 y devuelve 100, así que el resultado sería un
        documento íntegro y más corto. Tiene que fallar.
        """
        fake = FakeGitHub([page([issue_node(n) for n in range(100)], total=117)])
        status.gh = fake

        with self.assertRaises(status.DataError) as caught:
            status.paginate('query', ['repository', 'issues'])
        self.assertIn('truncada', str(caught.exception))

    def test_un_camino_nulo_usa_el_mensaje_propio(self):
        """En GraphQL «no existe o no tienes permiso» llega como null, no como error."""
        status.gh = lambda *args: json.dumps({'data': {'user': None}})

        with self.assertRaises(status.DataError) as caught:
            status.paginate(
                'query', ['user', 'projectV2', 'items'], missing='el Project no es accesible'
            )
        self.assertIn('el Project no es accesible', str(caught.exception))


class TestReadIssues(unittest.TestCase):
    def test_lee_los_issues_de_todas_las_paginas(self):
        status.gh = FakeGitHub([
            page([issue_node(1, labels=('s7',))], total=2, next_cursor='1'),
            page([issue_node(2, blocked_by=(1,))], total=2),
        ])

        issues = status.read_issues('owner', 'repo')

        self.assertEqual(sorted(issues), [1, 2])
        self.assertEqual(issues[1]['labels'], ['s7'])
        self.assertEqual(issues[2]['bloqueada_por'], [1])

    def test_falla_si_una_conexion_anidada_esta_truncada(self):
        """El límite anidado no se pagina, así que la guarda es lo único que lo ve.

        Un issue con más labels que el límite perdería una, y la columna de labels
        de STATUS.md mentiría sin que nada fallara.
        """
        node = issue_node(227, labels=('s7', 'chore'))
        node['labels']['totalCount'] = 60
        status.gh = FakeGitHub([page([node], total=1)])

        with self.assertRaises(status.DataError) as caught:
            status.read_issues('owner', 'repo')
        self.assertIn('issue #227.labels', str(caught.exception))

    def test_falla_si_no_hay_ningun_issue(self):
        """La guarda vieja, que se conserva: comprueba que se midió algo."""
        status.gh = FakeGitHub([page([], total=0)])

        with self.assertRaises(status.DataError) as caught:
            status.read_issues('owner', 'repo')
        self.assertIn('ningún issue', str(caught.exception))


class TestAnnotateWithProject(unittest.TestCase):
    def _wrap(self, page_data):
        return {'user': {'projectV2': {'items': page_data}}}

    def item(self, number, *, fields, total=None):
        nodes = [
            {'name': value, 'field': {'name': name}} for name, value in fields.items()
        ]
        return {
            'content': {'__typename': 'Issue', 'number': number},
            'fieldValues': {
                'totalCount': total if total is not None else len(nodes),
                'nodes': nodes,
            },
        }

    def test_anota_estado_y_prioridad_de_todas_las_paginas(self):
        issues = {
            1: {'estado': None, 'prioridad': None},
            2: {'estado': None, 'prioridad': None},
        }
        status.gh = FakeGitHub(
            [
                page(
                    [self.item(1, fields={'Status': 'Todo', 'Priority': 'High'})],
                    total=2,
                    next_cursor='1',
                ),
                page(
                    [self.item(2, fields={'Status': 'Done', 'Priority': 'Low'})],
                    total=2,
                ),
            ],
            wrap=self._wrap,
        )

        status.annotate_with_project(issues, 'owner', 2)

        self.assertEqual(issues[1], {'estado': 'Todo', 'prioridad': 'High'})
        self.assertEqual(issues[2], {'estado': 'Done', 'prioridad': 'Low'})

    def test_falla_si_los_campos_del_item_estan_truncados(self):
        """Si Status queda fuera del corte, el issue sale sin estado en vez de con él."""
        issues = {1: {'estado': None, 'prioridad': None}}
        status.gh = FakeGitHub(
            [page([self.item(1, fields={'Status': 'Todo'}, total=60)], total=1)],
            wrap=self._wrap,
        )

        with self.assertRaises(status.DataError) as caught:
            status.annotate_with_project(issues, 'owner', 2)
        self.assertIn('fieldValues', str(caught.exception))

    def test_ignora_los_items_que_no_son_issues(self):
        """Un Project admite borradores, y no tienen número que anotar."""
        issues = {1: {'estado': None, 'prioridad': None}}
        draft = {'content': {'__typename': 'DraftIssue'}, 'fieldValues': {'totalCount': 0, 'nodes': []}}
        status.gh = FakeGitHub([page([draft], total=1)], wrap=self._wrap)

        status.annotate_with_project(issues, 'owner', 2)

        self.assertEqual(issues[1], {'estado': None, 'prioridad': None})


if __name__ == '__main__':
    unittest.main()
