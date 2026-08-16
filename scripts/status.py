#!/usr/bin/env python3
"""Genera docs/planning/STATUS.md a partir del estado real de GitHub.

Fuente de verdad: GitHub Issues (estado, labels, dependencias nativas
blocked_by/blocking) y el Project (campos Status y Priority). Este script no
inventa nada: si el resultado no refleja la realidad, lo que hay que corregir
es GitHub.

Las secciones que GitHub no puede aportar —objetivo de la iteración, criterios
de salida, riesgos— se delimitan con marcadores HTML y se preservan entre
ejecuciones. Ver docs/GUIDE.md.

Uso: scripts/status.sh
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

# En modo estricto no se genera un STATUS.md incompleto: si el Project no se
# puede leer, se falla. Lo activa el workflow de CI, donde nadie va a ver un
# aviso por stderr y un fichero degradado se commitearía en silencio.
STRICT = os.environ.get("EVAULT_STATUS_ESTRICTO") == "1"

# Orden de presentación de labels, para que la columna sea estable y legible.
LABEL_ORDER = ["s1", "s2", "s3", "s4", "feat", "chore", "documentation", "bug", "api", "web"]


class DataError(Exception):
    """Los datos de GitHub no se pudieron obtener o no tienen la forma esperada."""


def gh(*args: str) -> str:
    process = subprocess.run(
        ["gh", *args], capture_output=True, text=True, cwd=ROOT
    )
    if process.returncode != 0:
        # Las queries GraphQL ocupan veinte líneas y volcarlas entierra el
        # mensaje de error de GitHub, que es lo único que importa aquí.
        summarized = " ".join(
            "query=<graphql>" if a.startswith("query=") else a for a in args
        )
        raise DataError(f"falló `gh {summarized}`: {process.stderr.strip()}")
    return process.stdout


def current_repo() -> tuple[str, str]:
    data = json.loads(gh("repo", "view", "--json", "nameWithOwner"))
    owner, _, name = data["nameWithOwner"].partition("/")
    return owner, name


# Los Projects se consultan por GraphQL y no con `gh project`, a propósito.
# `gh project list --owner X` tiene que averiguar antes si X es usuario u
# organización, y para decidirlo consulta ambos; si el token no tiene `read:org`
# no puede completar esa comprobación y falla con "unknown owner type", aunque sí
# tenga permiso para leer el Project. Ir directo a GraphQL evita esa resolución y
# funciona con solo `read:project`.
#
# Se busca por vinculación al repositorio y no por título: el título es un campo
# editable en la interfaz, y renombrar el tablero —que nadie considera un cambio
# técnico— rompía la generación. La vinculación sí es una relación estable.
PROJECTS_QUERY = """
query($owner:String!, $repo:String!) {
  repository(owner:$owner, name:$repo) {
    projectsV2(first:20) { nodes { number title } }
  }
}
"""


def project_number(owner: str, repo: str) -> int:
    """Localiza el Project vinculado al repositorio.

    Lanza ErrorDeDatos con un mensaje que distingue las causas posibles, porque
    "no encuentro el Project" tiene tres orígenes muy distintos y confundirlos
    manda a buscar el problema al sitio equivocado.
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


ISSUES_QUERY = """
query($owner:String!, $repo:String!) {
  repository(owner:$owner, name:$repo) {
    issues(first:100, states:[OPEN,CLOSED], orderBy:{field:CREATED_AT, direction:ASC}) {
      nodes {
        number title state url
        labels(first:20) { nodes { name } }
        blockedBy(first:20) { nodes { number } }
        blocking(first:20) { nodes { number } }
      }
    }
  }
}
"""


def read_issues(owner: str, repo: str) -> dict[int, dict]:
    output = gh(
        "api", "graphql",
        "-f", f"query={ISSUES_QUERY}",
        "-f", f"owner={owner}",
        "-f", f"repo={repo}",
    )
    nodes = json.loads(output)["data"]["repository"]["issues"]["nodes"]
    issues = {}
    for node in nodes:
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
    if not issues:
        raise DataError("el repositorio no devolvió ningún issue")
    return issues


ITEMS_QUERY = """
query($login:String!, $numero:Int!) {
  user(login:$login) {
    projectV2(number:$numero) {
      items(first:100) {
        nodes {
          content { __typename ... on Issue { number } }
          fieldValues(first:20) {
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
"""


def annotate_with_project(issues: dict[int, dict], owner: str, number: int) -> None:
    """Añade Status y Priority del Project a cada issue que esté en él."""
    output = gh(
        "api", "graphql",
        "-f", f"query={ITEMS_QUERY}",
        "-f", f"login={owner}",
        "-F", f"numero={number}",
    )
    project = json.loads(output)["data"]["user"]["projectV2"]
    if project is None:
        raise DataError(f"el Project número {number} de {owner} no es accesible")

    for item in project["items"]["nodes"]:
        content = item.get("content") or {}
        if content.get("__typename") != "Issue":
            continue
        issue = issues.get(content.get("number"))
        if issue is None:
            continue
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
    """El estado del Project, o el del issue si no está en el Project."""
    if issue["estado"]:
        return issue["estado"]
    return "Todo" if issue["abierta"] else "Done"


def takeable(issue: dict, issues: dict[int, dict]) -> bool:
    """Un issue es tomable si está abierto y ninguno de sus bloqueantes sigue abierto."""
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
# Se preservan entre ejecuciones. Solo se usan estos valores por defecto la
# primera vez, cuando todavía no existe STATUS.md.

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
    """Extrae los bloques manuales del STATUS.md existente, si lo hay."""
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
        # No se escribe nada: es mejor un STATUS.md desactualizado que uno vacío.
        print(f"error: {error}", file=sys.stderr)
        return 1

    try:
        annotate_with_project(issues, owner, project_number(owner, repo))
    except DataError as error:
        # Sin datos del Project el documento se puede generar, pero pierde las
        # prioridades. En local eso es aceptable con un aviso; en CI no, porque
        # nadie lee stderr y el fichero degradado se commitearía en silencio.
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
