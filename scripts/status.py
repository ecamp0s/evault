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

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "docs" / "planning" / "STATUS.md"
NOMBRE_PROYECTO = os.environ.get("EVAULT_PROJECT_NAME", "eVault")

# En modo estricto no se genera un STATUS.md incompleto: si el Project no se
# puede leer, se falla. Lo activa el workflow de CI, donde nadie va a ver un
# aviso por stderr y un fichero degradado se commitearía en silencio.
ESTRICTO = os.environ.get("EVAULT_STATUS_ESTRICTO") == "1"

# Orden de presentación de labels, para que la columna sea estable y legible.
ORDEN_LABELS = ["s1", "s2", "s3", "s4", "feat", "chore", "documentation", "bug", "api", "web"]


class ErrorDeDatos(Exception):
    """Los datos de GitHub no se pudieron obtener o no tienen la forma esperada."""


def gh(*args: str) -> str:
    proceso = subprocess.run(
        ["gh", *args], capture_output=True, text=True, cwd=RAIZ
    )
    if proceso.returncode != 0:
        raise ErrorDeDatos(f"falló `gh {' '.join(args)}`:\n{proceso.stderr.strip()}")
    return proceso.stdout


def repo_actual() -> tuple[str, str]:
    datos = json.loads(gh("repo", "view", "--json", "nameWithOwner"))
    owner, _, nombre = datos["nameWithOwner"].partition("/")
    return owner, nombre


def numero_de_proyecto(owner: str) -> str | None:
    """Localiza el Project por nombre. Devuelve None si no existe."""
    if forzado := os.environ.get("EVAULT_PROJECT_NUMBER"):
        return forzado
    datos = json.loads(gh("project", "list", "--owner", owner, "--format", "json"))
    for proyecto in datos.get("projects", []):
        if proyecto.get("title") == NOMBRE_PROYECTO:
            return str(proyecto["number"])
    return None


CONSULTA_ISSUES = """
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


def leer_issues(owner: str, repo: str) -> dict[int, dict]:
    salida = gh(
        "api", "graphql",
        "-f", f"query={CONSULTA_ISSUES}",
        "-f", f"owner={owner}",
        "-f", f"repo={repo}",
    )
    nodos = json.loads(salida)["data"]["repository"]["issues"]["nodes"]
    issues = {}
    for nodo in nodos:
        issues[nodo["number"]] = {
            "numero": nodo["number"],
            "titulo": nodo["title"],
            "abierta": nodo["state"] == "OPEN",
            "url": nodo["url"],
            "labels": [etiqueta["name"] for etiqueta in nodo["labels"]["nodes"]],
            "bloqueada_por": sorted(x["number"] for x in nodo["blockedBy"]["nodes"]),
            "bloquea_a": sorted(x["number"] for x in nodo["blocking"]["nodes"]),
            "estado": None,
            "prioridad": None,
        }
    if not issues:
        raise ErrorDeDatos("el repositorio no devolvió ningún issue")
    return issues


def anotar_con_proyecto(issues: dict[int, dict], owner: str, numero: str) -> None:
    """Añade Status y Priority del Project a cada issue que esté en él."""
    datos = json.loads(
        gh("project", "item-list", numero, "--owner", owner, "--format", "json", "--limit", "200")
    )
    for item in datos.get("items", []):
        contenido = item.get("content") or {}
        if contenido.get("type") != "Issue":
            continue
        issue = issues.get(contenido.get("number"))
        if issue is None:
            continue
        issue["estado"] = item.get("status")
        issue["prioridad"] = item.get("priority")


def labels_ordenadas(labels: list[str]) -> str:
    conocidas = [n for n in ORDEN_LABELS if n in labels]
    resto = sorted(set(labels) - set(conocidas))
    return " ".join(f"`{n}`" for n in conocidas + resto) or "—"


def estado_visible(issue: dict) -> str:
    """El estado del Project, o el del issue si no está en el Project."""
    if issue["estado"]:
        return issue["estado"]
    return "Todo" if issue["abierta"] else "Done"


def tomable(issue: dict, issues: dict[int, dict]) -> bool:
    """Un issue es tomable si está abierto y ninguno de sus bloqueantes sigue abierto."""
    if not issue["abierta"]:
        return False
    return not any(
        issues[n]["abierta"] for n in issue["bloqueada_por"] if n in issues
    )


def refs(numeros: list[int]) -> str:
    return ", ".join(f"#{n}" for n in numeros) if numeros else "—"


def tabla_backlog(issues: dict[int, dict]) -> list[str]:
    lineas = [
        "| Issue | Título | Labels | Estado | Prioridad | Bloqueada por | Bloquea a |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for issue in sorted(issues.values(), key=lambda i: i["numero"]):
        titulo = issue["titulo"].replace("|", "\\|")
        lineas.append(
            f"| [#{issue['numero']}]({issue['url']}) "
            f"| {titulo} "
            f"| {labels_ordenadas(issue['labels'])} "
            f"| {estado_visible(issue)} "
            f"| {issue['prioridad'] or '—'} "
            f"| {refs(issue['bloqueada_por'])} "
            f"| {refs(issue['bloquea_a'])} |"
        )
    return lineas


def seccion_tomables(issues: dict[int, dict]) -> list[str]:
    candidatos = [i for i in issues.values() if tomable(i, issues)]
    if not candidatos:
        abiertos = [i for i in issues.values() if i["abierta"]]
        if not abiertos:
            return ["No hay issues abiertos: la iteración está cerrada."]
        return [
            "Ningún issue abierto está libre de bloqueantes. Revisar el grafo de "
            "dependencias: si eso no es correcto, el error está en GitHub."
        ]

    peso = {"High": 0, "Medium": 1, "Low": 2, None: 3}
    candidatos.sort(key=lambda i: (peso.get(i["prioridad"], 3), i["numero"]))

    lineas = [
        "Issues abiertos sin ningún bloqueante abierto, ordenados por prioridad. "
        "El primero de la lista es lo siguiente a tomar.",
        "",
    ]
    for issue in candidatos:
        prioridad = issue["prioridad"] or "sin prioridad"
        en_curso = " — **en curso**" if estado_visible(issue) == "In Progress" else ""
        lineas.append(
            f"1. [#{issue['numero']}]({issue['url']}) {issue['titulo']} "
            f"({prioridad}){en_curso}"
        )
    return lineas


def grafo(issues: dict[int, dict]) -> list[str]:
    """Grafo de dependencias en Mermaid, que GitHub renderiza en el propio Markdown."""
    lineas = ["```mermaid", "graph LR"]
    relevantes = {
        n: i for n, i in issues.items()
        if i["bloqueada_por"] or i["bloquea_a"]
    }
    if not relevantes:
        return ["No hay dependencias registradas entre issues."]

    for numero, issue in sorted(relevantes.items()):
        etiqueta = f"#{numero}<br/>{estado_visible(issue)}"
        lineas.append(f'  I{numero}["{etiqueta}"]')
    for numero, issue in sorted(relevantes.items()):
        for destino in issue["bloquea_a"]:
            if destino in relevantes:
                lineas.append(f"  I{numero} --> I{destino}")

    cerrados = [f"I{n}" for n, i in sorted(relevantes.items()) if not i["abierta"]]
    lineas.append("  classDef hecho fill:#1a7f37,stroke:#1a7f37,color:#fff;")
    if cerrados:
        lineas.append(f"  class {','.join(cerrados)} hecho;")
    lineas.append("```")
    lineas += ["", "La flecha va del bloqueante al bloqueado. En verde, lo ya cerrado."]
    return lineas


# --- Secciones manuales -----------------------------------------------------
# Se preservan entre ejecuciones. Solo se usan estos valores por defecto la
# primera vez, cuando todavía no existe STATUS.md.

MANUALES_POR_DEFECTO = {
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


def leer_manuales(destino: Path) -> dict[str, list[str]]:
    """Extrae los bloques manuales del STATUS.md existente, si lo hay."""
    manuales = dict(MANUALES_POR_DEFECTO)
    if not destino.exists():
        return manuales
    texto = destino.read_text(encoding="utf-8")
    for clave in MANUALES_POR_DEFECTO:
        patron = (
            rf"<!-- manual:{clave} -->\n(.*?)\n<!-- /manual:{clave} -->"
        )
        if encontrado := re.search(patron, texto, re.DOTALL):
            manuales[clave] = encontrado.group(1).split("\n")
    return manuales


def bloque_manual(clave: str, contenido: list[str]) -> list[str]:
    return [f"<!-- manual:{clave} -->", *contenido, f"<!-- /manual:{clave} -->"]


def construir(issues: dict[int, dict], manuales: dict[str, list[str]], owner: str, repo: str) -> str:
    abiertos = sum(1 for i in issues.values() if i["abierta"])
    cerrados = len(issues) - abiertos

    lineas = [
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
        f"y Project «{NOMBRE_PROYECTO}»",
        f"Issues: {len(issues)} en total, {cerrados} cerrados, {abiertos} abiertos",
        "",
        "---",
        "",
        "## 1) Objetivo de la iteración",
        "",
        *bloque_manual("objetivo", manuales["objetivo"]),
        "",
        "## 2) Qué se puede tomar ahora",
        "",
        *seccion_tomables(issues),
        "",
        "## 3) Backlog completo",
        "",
        *tabla_backlog(issues),
        "",
        "## 4) Grafo de dependencias",
        "",
        *grafo(issues),
        "",
        "## 5) Criterios de salida de la iteración",
        "",
        *bloque_manual("salida", manuales["salida"]),
        "",
        "## 6) Riesgos",
        "",
        *bloque_manual("riesgos", manuales["riesgos"]),
        "",
    ]
    return "\n".join(lineas)


def main() -> int:
    try:
        owner, repo = repo_actual()
        issues = leer_issues(owner, repo)
        numero = numero_de_proyecto(owner)
        if numero:
            anotar_con_proyecto(issues, owner, numero)
        elif ESTRICTO:
            raise ErrorDeDatos(
                f"no se pudo leer el Project «{NOMBRE_PROYECTO}». En modo estricto "
                "no se genera un STATUS.md degradado sin prioridades: eso sobre"
                "escribiría información buena con información peor.\n"
                "En GitHub Actions esto significa que falta un token con permiso "
                "de lectura de Projects: el GITHUB_TOKEN por defecto no lo tiene. "
                "Crear un PAT con scope 'read:project' y añadirlo como secret "
                "STATUS_TOKEN."
            )
        else:
            print(
                f"aviso: no se encontró el Project «{NOMBRE_PROYECTO}»; "
                "las columnas Estado y Prioridad saldrán del estado del issue",
                file=sys.stderr,
            )
    except ErrorDeDatos as error:
        # No se escribe nada: es mejor un STATUS.md desactualizado que uno vacío.
        print(f"error: {error}", file=sys.stderr)
        return 1

    contenido = construir(issues, leer_manuales(DESTINO), owner, repo)
    previo = DESTINO.read_text(encoding="utf-8") if DESTINO.exists() else None
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(contenido, encoding="utf-8")

    relativo = DESTINO.relative_to(RAIZ)
    if previo == contenido:
        print(f"{relativo} ya estaba al día")
    else:
        print(f"{relativo} regenerado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
