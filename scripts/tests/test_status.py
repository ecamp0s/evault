#!/usr/bin/env python3
"""Tests for the STATUS.md generator.

The first ones it has, and that is part of the finding of #230: `status.py` was
the only file of the tooling without any, and it is the one that generates the
project's public status document. An unpaginated `first:100` survived in there
because there was nothing that could detect it.

What is tested is not pagination in the abstract: it is that a truncated query
**fails** instead of producing a shorter, plausible document. That was the real
failure mode —the generator reported that «ya estaba al día» while leaving out 16
open issues— and it is what every test here breaks on purpose.

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
    """An issue node with the shape GraphQL returns, with its totalCount fields."""
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
    """Stands in for `gh` by returning prepared pages.

    It records the cursors it receives, which is the only way of checking that the
    pagination really advances and does not ask for the first page twice.
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
    def test_passes_when_everything_was_read(self):
        status.check_page_complete('sitio', 10, 10)

    def test_fails_when_something_is_missing(self):
        with self.assertRaises(status.DataError) as caught:
            status.check_page_complete('repository.issues', 100, 117)
        self.assertIn('117', str(caught.exception))
        self.assertIn('100', str(caught.exception))

    def test_the_message_says_where_it_happened(self):
        """A truncation error with no place is no good: there are five connections."""
        with self.assertRaises(status.DataError) as caught:
            status.check_page_complete('issue #227.blockedBy', 3, 6)
        self.assertIn('issue #227.blockedBy', str(caught.exception))


class TestPaginate(unittest.TestCase):
    def test_reads_both_pages_of_a_split_connection(self):
        fake = FakeGitHub([
            page([issue_node(1)], total=2, next_cursor='1'),
            page([issue_node(2)], total=2),
        ])
        status.gh = fake

        nodes = status.paginate('query', ['repository', 'issues'])

        self.assertEqual([n['number'] for n in nodes], [1, 2])
        self.assertEqual(fake.cursors, [None, '1'])

    def test_a_single_page_does_not_ask_for_the_next_one(self):
        fake = FakeGitHub([page([issue_node(1)], total=1)])
        status.gh = fake

        status.paginate('query', ['repository', 'issues'])

        self.assertEqual(fake.cursors, [None])

    def test_fails_if_the_pagination_does_not_advance(self):
        """It is the bug of #230: the first page complete and nobody carries on.

        The connection says it has 117 and returns 100, so the result would be a
        whole, shorter document. It has to fail.
        """
        fake = FakeGitHub([page([issue_node(n) for n in range(100)], total=117)])
        status.gh = fake

        with self.assertRaises(status.DataError) as caught:
            status.paginate('query', ['repository', 'issues'])
        self.assertIn('truncada', str(caught.exception))

    def test_a_null_path_uses_the_dedicated_message(self):
        """In GraphQL «it does not exist or you have no permission» arrives as null, not as an error."""
        status.gh = lambda *args: json.dumps({'data': {'user': None}})

        with self.assertRaises(status.DataError) as caught:
            status.paginate(
                'query', ['user', 'projectV2', 'items'], missing='el Project no es accesible'
            )
        self.assertIn('el Project no es accesible', str(caught.exception))


class TestReadIssues(unittest.TestCase):
    def test_reads_the_issues_from_every_page(self):
        status.gh = FakeGitHub([
            page([issue_node(1, labels=('s7',))], total=2, next_cursor='1'),
            page([issue_node(2, blocked_by=(1,))], total=2),
        ])

        issues = status.read_issues('owner', 'repo')

        self.assertEqual(sorted(issues), [1, 2])
        self.assertEqual(issues[1]['labels'], ['s7'])
        self.assertEqual(issues[2]['blocked_by'], [1])

    def test_fails_if_a_nested_connection_is_truncated(self):
        """The nested limit is not paginated, so the guard is the only thing that sees it.

        An issue with more labels than the limit would lose one, and STATUS.md's
        labels column would lie without anything failing.
        """
        node = issue_node(227, labels=('s7', 'chore'))
        node['labels']['totalCount'] = 60
        status.gh = FakeGitHub([page([node], total=1)])

        with self.assertRaises(status.DataError) as caught:
            status.read_issues('owner', 'repo')
        self.assertIn('issue #227.labels', str(caught.exception))

    def test_fails_if_there_is_no_issue_at_all(self):
        """The old guard, which is kept: it checks that something was measured."""
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

    def test_annotates_state_and_priority_from_every_page(self):
        issues = {
            1: {'status': None, 'priority': None},
            2: {'status': None, 'priority': None},
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

        self.assertEqual(issues[1], {'status': 'Todo', 'priority': 'High'})
        self.assertEqual(issues[2], {'status': 'Done', 'priority': 'Low'})

    def test_fails_if_the_item_fields_are_truncated(self):
        """If Status falls outside the cut, the issue comes out with no state instead of with it."""
        issues = {1: {'status': None, 'priority': None}}
        status.gh = FakeGitHub(
            [page([self.item(1, fields={'Status': 'Todo'}, total=60)], total=1)],
            wrap=self._wrap,
        )

        with self.assertRaises(status.DataError) as caught:
            status.annotate_with_project(issues, 'owner', 2)
        self.assertIn('fieldValues', str(caught.exception))

    def test_ignores_the_items_that_are_not_issues(self):
        """A Project admits drafts, and they have no number to annotate."""
        issues = {1: {'status': None, 'priority': None}}
        draft = {'content': {'__typename': 'DraftIssue'}, 'fieldValues': {'totalCount': 0, 'nodes': []}}
        status.gh = FakeGitHub([page([draft], total=1)], wrap=self._wrap)

        status.annotate_with_project(issues, 'owner', 2)

        self.assertEqual(issues[1], {'status': None, 'priority': None})


def issue(number: int, *, labels=(), open_=False, blocked_by=(), blocking=()):
    """An issue with the shape `read_issues` leaves behind."""
    return {
        'number': number,
        'title': f'issue {number}',
        'open': open_,
        'url': f'https://example.test/{number}',
        'labels': list(labels),
        'blocked_by': list(blocked_by),
        'blocking': list(blocking),
        'status': None,
        'priority': None,
    }


def by_number(*issues):
    return {i['number']: i for i in issues}


class TestWhatIsDrawn(unittest.TestCase):
    """STATUS.md draws the open issues and everything of an iteration still active (#663).

    Drawing every issue ever made the file 288 KB, past what can be read in one go.
    """

    def test_the_iteration_is_the_highest_sprint_label(self):
        """A carried-over issue keeps the label it started in and gains the one it ends in."""
        self.assertEqual(status.iteration_of(issue(531, labels=('feat', 's15', 's17'))), 17)
        self.assertIsNone(status.iteration_of(issue(202, labels=('chore',))))

    def test_a_label_that_only_starts_with_s_is_not_an_iteration(self):
        self.assertIsNone(status.iteration_of(issue(1, labels=('security', 's1x'))))

    def test_draws_the_open_and_the_closed_of_an_active_iteration(self):
        issues = by_number(
            issue(1, labels=('s17',)),
            issue(2, labels=('s18',)),
            issue(3, labels=('s18',), open_=True),
        )
        self.assertEqual(sorted(status.visible(issues)), [2, 3])

    def test_a_straggler_keeps_its_iteration_drawn(self):
        """#469 kept the 14 open while the 15 ran: costs rows, hides nothing."""
        issues = by_number(
            issue(1, labels=('s14',)),
            issue(2, labels=('s14',), open_=True),
            issue(3, labels=('s15',), open_=True),
        )
        self.assertEqual(sorted(status.visible(issues)), [1, 2, 3])

    def test_an_open_issue_is_drawn_even_without_an_iteration(self):
        issues = by_number(issue(1, labels=('s17',)), issue(2, open_=True))
        self.assertEqual(sorted(status.visible(issues)), [2])

    def test_with_nothing_open_nothing_is_drawn(self):
        issues = by_number(issue(1, labels=('s17',)), issue(2, labels=('s16',)))
        self.assertEqual(status.visible(issues), {})


class TestPastIterationsTable(unittest.TestCase):
    def test_counts_every_issue_that_is_not_drawn(self):
        """What leaves the backlog has to stay findable: a count and a link per iteration."""
        issues = by_number(
            issue(1, labels=('s16',)),
            issue(2, labels=('s17',)),
            issue(3, labels=('s17',)),
            issue(4, labels=('chore',)),
            issue(5, labels=('s18',), open_=True),
        )
        table = '\n'.join(status.past_iterations_table(issues, 'owner', 'repo'))

        self.assertIn('| 17 | 2 |', table)
        self.assertIn('| 16 | 1 |', table)
        self.assertIn('| sin iteración | 1 |', table)
        self.assertNotIn('| 18 |', table)
        self.assertIn('label%3As17', table)

    def test_the_link_without_iteration_excludes_the_active_ones_too(self):
        """Excluding only past labels would let the open iteration's issues into the link."""
        issues = by_number(issue(1, labels=('chore',)), issue(2, labels=('s17',)), issue(3, labels=('s18',), open_=True))
        row = next(l for l in status.past_iterations_table(issues, 'o', 'r') if l.startswith('| sin iteración'))

        self.assertIn('-label%3As18', row)
        self.assertIn('-label%3As17', row)

    def test_the_most_recent_iteration_goes_first(self):
        issues = by_number(issue(1, labels=('s3',)), issue(2, labels=('s12',)), issue(3, open_=True, labels=('s13',)))
        rows = [l for l in status.past_iterations_table(issues, 'o', 'r') if l.startswith('| ') and l[2].isdigit()]
        self.assertEqual([r.split(' | ')[0] for r in rows], ['| 12', '| 3'])

    def test_no_table_when_nothing_is_left_out(self):
        issues = by_number(issue(1, labels=('s18',)), issue(2, labels=('s18',), open_=True))
        self.assertEqual(status.past_iterations_table(issues, 'o', 'r'), [])


class TestGraph(unittest.TestCase):
    def test_drops_an_arrow_to_an_issue_that_is_not_drawn(self):
        """Mermaid would invent an empty node for it, which reads as a real issue."""
        drawn = by_number(
            issue(10, labels=('s18',), open_=True, blocked_by=(9,), blocking=(11,)),
            issue(11, labels=('s18',), open_=True, blocked_by=(10,)),
        )
        text = '\n'.join(status.graph(drawn))

        self.assertIn('I10 --> I11', text)
        self.assertNotIn('I9', text)


class TestBuild(unittest.TestCase):
    def test_the_backlog_leaves_out_what_the_archive_already_holds(self):
        issues = by_number(
            issue(1, labels=('s17',), blocking=(2,)),
            issue(2, labels=('s18',), open_=True, blocked_by=(1,), blocking=(3,)),
            issue(3, labels=('s18',), open_=True, blocked_by=(2,)),
        )
        text = status.build(issues, dict(status.DEFAULT_MANUAL_SECTIONS), 'owner', 'repo')
        backlog = text.split('## 3) Backlog')[1].split('## 4)')[0]
        graph = text.split('## 4)')[1].split('## 5)')[0]

        self.assertIn('[#2]', backlog)
        self.assertNotIn('[#1]', backlog)
        self.assertIn('| 17 | 1 |', backlog)
        self.assertIn('I2 --> I3', graph)
        self.assertNotIn('I1', graph)
        # The header still counts everything: it is the whole repository's figure.
        self.assertIn('Issues: 3 en total, 1 cerrados, 2 abiertos', text)


if __name__ == '__main__':
    unittest.main()
