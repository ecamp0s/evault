#!/usr/bin/env python3
"""Generates docs/planning/STATUS.md from GitHub's real state.

Source of truth: GitHub Issues (state, labels, native blocked_by/blocking
dependencies) and the Project (Status and Priority fields). This script invents
nothing: if the result does not reflect reality, what has to be fixed is GitHub.

The sections GitHub cannot supply —the iteration's goal, exit criteria, risks—
are delimited with HTML markers and preserved between runs. See docs/GUIDE.md.

Usage: scripts/status.sh
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "docs" / "planning" / "STATUS.md"
PROJECT_NAME = os.environ.get("EVAULT_PROJECT_NAME", "eVault")

# In strict mode no incomplete STATUS.md is generated: if the Project cannot be
# read, it fails. The CI workflow turns it on, where nobody is going to see a
# warning on stderr and a degraded file would be committed in silence.
STRICT = os.environ.get("EVAULT_STATUS_ESTRICTO") == "1"

# The order labels are presented in, so the column is stable and readable.
LABEL_ORDER = ["s1", "s2", "s3", "s4", "feat", "chore", "documentation", "bug", "api", "web"]


class DataError(Exception):
    """GitHub's data could not be obtained or does not have the expected shape."""


def gh(*args: str) -> str:
    process = subprocess.run(
        ["gh", *args], capture_output=True, text=True, cwd=ROOT
    )
    if process.returncode != 0:
        # GraphQL queries take up twenty lines and dumping them buries GitHub's
        # error message, which is the only thing that matters here.
        summarized = " ".join(
            "query=<graphql>" if a.startswith("query=") else a for a in args
        )
        raise DataError(f"falló `gh {summarized}`: {process.stderr.strip()}")
    return process.stdout


def current_repo() -> tuple[str, str]:
    data = json.loads(gh("repo", "view", "--json", "nameWithOwner"))
    owner, _, name = data["nameWithOwner"].partition("/")
    return owner, name


# Projects are queried through GraphQL and not with `gh project`, on purpose.
# `gh project list --owner X` has to work out first whether X is a user or an
# organisation, and to decide it queries both; if the token lacks `read:org` it
# cannot complete that check and fails with "unknown owner type", even when it does
# have permission to read the Project. Going straight to GraphQL avoids that
# resolution and works with `read:project` alone.
#
# It is looked up by its link to the repository and not by title: the title is a
# field editable in the interface, and renaming the board —which nobody considers a
# technical change— broke the generation. The link is a stable relation.
PROJECTS_QUERY = """
query($owner:String!, $repo:String!) {
  repository(owner:$owner, name:$repo) {
    projectsV2(first:20) { nodes { number title } }
  }
}
"""


def project_number(owner: str, repo: str) -> int:
    """Locates the Project linked to the repository.

    Raises DataError with a message that tells the possible causes apart, because
    "I cannot find the Project" has three very different origins and confusing them
    sends one looking for the problem in the wrong place.
    """
    if forced := os.environ.get("EVAULT_PROJECT_NUMBER"):
        return int(forced)

    output = gh(
        "api", "graphql",
        "-f", f"query={PROJECTS_QUERY}",
        "-f", f"owner={owner}",
        "-f", f"repo={repo}",
    )
    projects = json.loads(output)["data"]["repository"]["projectsV2"]["nodes"]

    if not projects:
        raise DataError(
            f"no hay ningún Project vinculado a {owner}/{repo}.\n"
            "Si el tablero existe pero no está vinculado, vincularlo con:\n"
            f"  gh project link <número> --owner {owner} --repo {owner}/{repo}\n"
            "Si el token no tiene permiso de lectura de Projects, esta consulta "
            "devuelve una lista vacía en lugar de un error: en GitHub Actions eso "
            "significa que falta el secret STATUS_TOKEN con un PAT que tenga "
            "'repo' y 'read:project'."
        )

    if len(projects) == 1:
        return int(projects[0]["number"])

    for project in projects:
        if project["title"] == PROJECT_NAME:
            return int(project["number"])

    candidates = ", ".join(f"#{p['number']} «{p['title']}»" for p in projects)
    raise DataError(
        f"hay varios Projects vinculados a {owner}/{repo} y ninguno se llama "
        f"«{PROJECT_NAME}»: {candidates}.\n"
        "Desambiguar con la variable EVAULT_PROJECT_NUMBER, o con "
        "EVAULT_PROJECT_NAME si se prefiere elegir por título."
    )


# The page size. GitHub admits no more than 100 per query, so this is not a number
# that can be raised in order to stop paginating: paginating is compulsory.
PAGE_SIZE = 100

# The limit for the nested connections, which are NOT paginated because today none
# of them comes close. An issue with more labels or more blockers than this would be
# read incomplete, so `check_page_complete` compares what arrived against the total
# and fails if they do not match: the number may fall short, but not in silence.
NESTED_LIMIT = 50


def check_page_complete(where: str, received: int, total: int) -> None:
    """Fails if a connection returned fewer elements than it says it has.

    It exists because the failure mode of a truncated query is NOT an error: it is a
    plausible, shorter result. `read_issues` carried an `if not issues` that checked
    GitHub had returned SOMETHING, and with that the generator went from 100 to 117
    issues reporting that it «ya estaba al día» — leaving out precisely the 17 open
    ones, because the order is by ascending creation date. See #230.

    The difference between the two guards is the whole lesson: checking that
    something was measured is not checking that everything was.
    """
    if received < total:
        raise DataError(
            f"{where}: GitHub dice que hay {total} y solo se leyeron {received}.\n"
            "La consulta está truncada, así que el documento generado sería "
            "incompleto sin dar ningún error. Si el límite es de una conexión "
            f"anidada, subir NESTED_LIMIT (ahora {NESTED_LIMIT}); si es de una "
            "conexión paginada, es un fallo de la paginación y no del límite."
        )


def paginate(
    query: str, path: list[str], *args: str, missing: str | None = None
) -> list[dict]:
    """Walks a whole GraphQL connection and returns all of its nodes.

    `path` is the keys from `data` down to the connection, so the descent through
    the JSON is not repeated at every call. `missing` is the message for when
    something along the path comes back null, which in GraphQL is how «it does not
    exist or you have no permission» shows itself: that distinction deserves a
    message of its own and not a KeyError.

    The query receives `$cursor` and has to ask for `totalCount` and
    `pageInfo { hasNextPage endCursor }`: the first so that it can be checked that
    nothing is missing, the second in order to advance. The total is checked at the
    end and not page by page, because a shorter intermediate page is legitimate.
    """
    nodes: list[dict] = []
    cursor: str | None = None
    total = 0

    while True:
        cursor_args = ("-f", f"cursor={cursor}") if cursor else ()
        output = gh("api", "graphql", "-f", f"query={query}", *args, *cursor_args)

        connection = json.loads(output)["data"]
        for key in path:
            if connection is None:
                break
            connection = connection[key]
        if connection is None:
            raise DataError(missing or f"la respuesta de GitHub no trae {'.'.join(path)}")

        total = connection["totalCount"]
        nodes.extend(connection["nodes"])

        page = connection["pageInfo"]
        if not page["hasNextPage"]:
            break
        cursor = page["endCursor"]

    check_page_complete(".".join(path), len(nodes), total)
    return nodes


ISSUES_QUERY = """
query($owner:String!, $repo:String!, $cursor:String) {
  repository(owner:$owner, name:$repo) {
    issues(first:%(page)d, after:$cursor, states:[OPEN,CLOSED], orderBy:{field:CREATED_AT, direction:ASC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number title state url
        labels(first:%(nested)d) { totalCount nodes { name } }
        blockedBy(first:%(nested)d) { totalCount nodes { number } }
        blocking(first:%(nested)d) { totalCount nodes { number } }
      }
    }
  }
}
""" % {"page": PAGE_SIZE, "nested": NESTED_LIMIT}


def read_issues(owner: str, repo: str) -> dict[int, dict]:
    nodes = paginate(
        ISSUES_QUERY,
        ["repository", "issues"],
        "-f", f"owner={owner}",
        "-f", f"repo={repo}",
    )
    issues = {}
    for node in nodes:
        # The three nested connections are not paginated, so here it is checked that
        # none of them fell short. Without this, an issue with more labels than the
        # limit would lose one without saying so.
        for field in ("labels", "blockedBy", "blocking"):
            check_page_complete(
                f"issue #{node['number']}.{field}",
                len(node[field]["nodes"]),
                node[field]["totalCount"],
            )
        issues[node["number"]] = {
            "numero": node["number"],
            "titulo": node["title"],
            "abierta": node["state"] == "OPEN",
            "url": node["url"],
            "labels": [label["name"] for label in node["labels"]["nodes"]],
            "bloqueada_por": sorted(x["number"] for x in node["blockedBy"]["nodes"]),
            "bloquea_a": sorted(x["number"] for x in node["blocking"]["nodes"]),
            "estado": None,
            "prioridad": None,
        }
    # It is kept, but it is no longer the only guard and it is worth knowing why:
    # this one checks that GitHub returned something, and what was needed was
    # checking that it returned everything. The second is what `paginate` does
    # against `totalCount`.
    if not issues:
        raise DataError("el repositorio no devolvió ningún issue")
    return issues


ITEMS_QUERY = """
query($login:String!, $numero:Int!, $cursor:String) {
  user(login:$login) {
    projectV2(number:$numero) {
      items(first:%(page)d, after:$cursor) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          content { __typename ... on Issue { number } }
          fieldValues(first:%(nested)d) {
            totalCount
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2SingleSelectField { name } }
              }
            }
          }
        }
      }
    }
  }
}
""" % {"page": PAGE_SIZE, "nested": NESTED_LIMIT}


def annotate_with_project(issues: dict[int, dict], owner: str, number: int) -> None:
    """Adds the Project's Status and Priority to every issue that is in it."""
    items = paginate(
        ITEMS_QUERY,
        ["user", "projectV2", "items"],
        "-f", f"login={owner}",
        "-F", f"numero={number}",
        missing=f"el Project número {number} de {owner} no es accesible",
    )

    for item in items:
        content = item.get("content") or {}
        if content.get("__typename") != "Issue":
            continue
        issue = issues.get(content.get("number"))
        if issue is None:
            continue
        # `fieldValues` is not paginated either. If the Project gains fields and
        # goes past the limit, Status or Priority could fall outside the cut and the
        # issue would show up with no state instead of the one it has.
        check_page_complete(
            f"Project item de #{content['number']}.fieldValues",
            len(item["fieldValues"]["nodes"]),
            item["fieldValues"]["totalCount"],
        )
        fields = {
            value["field"]["name"]: value["name"]
            for value in item["fieldValues"]["nodes"]
            if value.get("field")
        }
        issue["estado"] = fields.get("Status")
        issue["prioridad"] = fields.get("Priority")


def sorted_labels(labels: list[str]) -> str:
    known = [n for n in LABEL_ORDER if n in labels]
    rest = sorted(set(labels) - set(known))
    return " ".join(f"`{n}`" for n in known + rest) or "—"


def visible_status(issue: dict) -> str:
    """The Project's state, or the issue's if it is not in the Project."""
    if issue["estado"]:
        return issue["estado"]
    return "Todo" if issue["abierta"] else "Done"


def takeable(issue: dict, issues: dict[int, dict]) -> bool:
    """An issue is takeable if it is open and none of its blockers is still open."""
    if not issue["abierta"]:
        return False
    return not any(
        issues[n]["abierta"] for n in issue["bloqueada_por"] if n in issues
    )


def refs(numbers: list[int]) -> str:
    return ", ".join(f"#{n}" for n in numbers) if numbers else "—"


def backlog_table(issues: dict[int, dict]) -> list[str]:
    lines = [
        "| Issue | Título | Labels | Estado | Prioridad | Bloqueada por | Bloquea a |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for issue in sorted(issues.values(), key=lambda i: i["numero"]):
        title = issue["titulo"].replace("|", "\\|")
        lines.append(
            f"| [#{issue['numero']}]({issue['url']}) "
            f"| {title} "
            f"| {sorted_labels(issue['labels'])} "
            f"| {visible_status(issue)} "
            f"| {issue['prioridad'] or '—'} "
            f"| {refs(issue['bloqueada_por'])} "
            f"| {refs(issue['bloquea_a'])} |"
        )
    return lines


def takeable_section(issues: dict[int, dict]) -> list[str]:
    candidates = [i for i in issues.values() if takeable(i, issues)]
    if not candidates:
        open_issues = [i for i in issues.values() if i["abierta"]]
        if not open_issues:
            return ["No hay issues abiertos: la iteración está cerrada."]
        return [
            "Ningún issue abierto está libre de bloqueantes. Revisar el grafo de "
            "dependencias: si eso no es correcto, el error está en GitHub."
        ]

    weight = {"High": 0, "Medium": 1, "Low": 2, None: 3}
    candidates.sort(key=lambda i: (weight.get(i["prioridad"], 3), i["numero"]))

    lines = [
        "Issues abiertos sin ningún bloqueante abierto, ordenados por prioridad. "
        "El primero de la lista es lo siguiente a tomar.",
        "",
    ]
    for issue in candidates:
        priority = issue["prioridad"] or "sin prioridad"
        in_progress = " — **en curso**" if visible_status(issue) == "In Progress" else ""
        lines.append(
            f"1. [#{issue['numero']}]({issue['url']}) {issue['titulo']} "
            f"({priority}){in_progress}"
        )
    return lines


def graph(issues: dict[int, dict]) -> list[str]:
    """Grafo de dependencias en Mermaid, que GitHub renderiza en el propio Markdown."""
    lines = ["```mermaid", "graph LR"]
    relevant = {
        n: i for n, i in issues.items()
        if i["bloqueada_por"] or i["bloquea_a"]
    }
    if not relevant:
        return ["No hay dependencias registradas entre issues."]

    for number, issue in sorted(relevant.items()):
        label = f"#{number}<br/>{visible_status(issue)}"
        lines.append(f'  I{number}["{label}"]')
    for number, issue in sorted(relevant.items()):
        for target in issue["bloquea_a"]:
            if target in relevant:
                lines.append(f"  I{number} --> I{target}")

    closed = [f"I{n}" for n, i in sorted(relevant.items()) if not i["abierta"]]
    lines.append("  classDef hecho fill:#1a7f37,stroke:#1a7f37,color:#fff;")
    if closed:
        lines.append(f"  class {','.join(closed)} hecho;")
    lines.append("```")
    lines += ["", "La flecha va del bloqueante al bloqueado. En verde, lo ya cerrado."]
    return lines


# --- Secciones manuales -----------------------------------------------------
# They are preserved between runs. These defaults are only used the first time,
# when STATUS.md does not exist yet.

DEFAULT_MANUAL_SECTIONS = {
    "objetivo": [
        "Cerrar la Iteración 1 con el ciclo completo de autenticación funcionando "
        "de punta a punta: la SPA registra, entra, mantiene sesión por token y sale, "
        "contra la API real.",
        "",
        "El objetivo de la iteración no es la funcionalidad en sí, que es "
        "convencional, sino **validar el stack completo** —API, SPA, tokens, CORS, "
        "tests, análisis estático y CI— antes de introducir criptografía en el "
        "cliente en la Iteración 3.",
    ],
    "salida": [
        "La Iteración 1 se cierra cuando se cumple todo:",
        "",
        "1. Registro, login, logout y consulta de sesión activa funcionando contra la API.",
        "2. La SPA completa el ciclo en navegador, no solo en tests.",
        "3. Rutas protegidas y expulsión automática ante un 401.",
        "4. Suite de Pest en verde y `composer analyse` sin errores.",
        "5. CI en verde en el PR de cada issue.",
        "6. Contrato de la API documentado y estable, porque la Iteración 3 lo reutiliza.",
    ],
    "riesgos": [
        "| Riesgo | Estado | Mitigación |",
        "| --- | --- | --- |",
        "| La autenticación de esta iteración **no es zero-knowledge**: la contraseña viaja al servidor | `Aceptado` | Deliberado y temporal. Se sustituye en la Iteración 3. El contrato de la API se mantiene estable para que el cambio sea mínimo. Ver `ADR-001` |",
        "| Un cambio de contrato en la Iteración 3 obligue a reescribir los clientes | `Open` | Fijar ahora rutas, forma de request/response y gestión de tokens, y no cambiarlas al introducir criptografía |",
        "| Orígenes CORS mal configurados degradando a permisivo | `Open` | Fallar de forma ruidosa ante configuración ausente, nunca abrir el origen por defecto. Ver `ADR-005` |",
        "| Nivel `max` de Larastan insostenible al aparecer código de dominio | `Open` | Bajar a nivel 8 es aceptable si llega el caso; la intención es mantener `max` mientras se pueda |",
        "| Cifrado en cliente con fallo silencioso: pérdida de datos irreversible | `Open` | Tests criptográficos dedicados antes de la Iteración 3. Ver `ADR-001` |",
        "| Query sin `vault_id` filtrando datos entre tenants | `Open` | Double guard más tests de aislamiento cross-tenant obligatorios. Ver `ADR-004` |",
    ],
}


def read_manual_sections(target: Path) -> dict[str, list[str]]:
    """Extracts the manual blocks from the existing STATUS.md, if there is one."""
    manual_sections = dict(DEFAULT_MANUAL_SECTIONS)
    if not target.exists():
        return manual_sections
    text = target.read_text(encoding="utf-8")
    for key in DEFAULT_MANUAL_SECTIONS:
        pattern = (
            rf"<!-- manual:{key} -->\n(.*?)\n<!-- /manual:{key} -->"
        )
        if found := re.search(pattern, text, re.DOTALL):
            manual_sections[key] = found.group(1).split("\n")
    return manual_sections


def manual_block(key: str, content: list[str]) -> list[str]:
    return [f"<!-- manual:{key} -->", *content, f"<!-- /manual:{key} -->"]


def build(issues: dict[int, dict], manual_sections: dict[str, list[str]], owner: str, repo: str) -> str:
    open_issues = sum(1 for i in issues.values() if i["abierta"])
    closed = len(issues) - open_issues

    lines = [
        "# eVault — Estado del Backlog",
        "",
        "> **Documento generado. No editar a mano.**",
        "> Se regenera con `scripts/status.sh` leyendo GitHub, que es la única fuente",
        "> de verdad del estado. Si algo aquí no refleja la realidad, corregirlo en",
        "> GitHub y volver a generar. Las secciones delimitadas como manuales sí se",
        "> editan a mano y el generador las preserva. Ver `docs/GUIDE.md`.",
        "",
        f"Generado: {date.today().isoformat()}",
        f"Fuente: [{owner}/{repo}](https://github.com/{owner}/{repo}/issues) "
        f"y Project «{PROJECT_NAME}»",
        f"Issues: {len(issues)} en total, {closed} cerrados, {open_issues} abiertos",
        "",
        "---",
        "",
        "## 1) Objetivo de la iteración",
        "",
        *manual_block("objetivo", manual_sections["objetivo"]),
        "",
        "## 2) Qué se puede tomar ahora",
        "",
        *takeable_section(issues),
        "",
        "## 3) Backlog completo",
        "",
        *backlog_table(issues),
        "",
        "## 4) Grafo de dependencias",
        "",
        *graph(issues),
        "",
        "## 5) Criterios de salida de la iteración",
        "",
        *manual_block("salida", manual_sections["salida"]),
        "",
        "## 6) Riesgos",
        "",
        *manual_block("riesgos", manual_sections["riesgos"]),
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    try:
        owner, repo = current_repo()
        issues = read_issues(owner, repo)
    except DataError as error:
        # Nothing is written: an out-of-date STATUS.md is better than an empty one.
        print(f"error: {error}", file=sys.stderr)
        return 1

    try:
        annotate_with_project(issues, owner, project_number(owner, repo))
    except DataError as error:
        # Without the Project's data the document can be generated, but it loses the
        # priorities. Locally that is acceptable with a warning; in CI it is not,
        # because nobody reads stderr and the degraded file would be committed in
        # silence.
        if STRICT:
            print(
                f"error: {error}\n"
                "En modo estricto no se genera un STATUS.md degradado sin "
                "prioridades: sobrescribiría información buena con información "
                "peor.",
                file=sys.stderr,
            )
            return 1
        print(
            f"aviso: {error}\n"
            "Las columnas Estado y Prioridad saldrán del estado del issue.",
            file=sys.stderr,
        )

    content = build(issues, read_manual_sections(TARGET), owner, repo)
    previous = TARGET.read_text(encoding="utf-8") if TARGET.exists() else None
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(content, encoding="utf-8")

    relative = TARGET.relative_to(ROOT)
    if previous == content:
        print(f"{relative} ya estaba al día")
    else:
        print(f"{relative} regenerado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
