/**
 * Vuelca TODO el texto visible de unos ficheros TypeScript o TSX, para poder
 * compararlo antes y después de un renombrado.
 *
 * POR QUÉ EXISTE. En #115 un renombrado convirtió «Tienes cambios sin guardar»
 * en «sin save», y estuvo mal en `master` dos issues seguidos porque ninguna
 * auditoría línea a línea lo vio: las frases de la interfaz se parten cruzando
 * saltos de línea, y el diff de un renombrado es demasiado grande para leerlo.
 * La comprobación que sirve es comparar el conjunto entero de texto visible, y
 * eso es lo que imprime este comando.
 *
 * QUÉ CUENTA COMO TEXTO VISIBLE. Literales de cadena, plantillas —incluidos sus
 * trozos partidos por interpolaciones, que es donde se rompen las frases— y
 * texto JSX. Con el AST y no con expresiones regulares, porque un regex no
 * distingue una cadena de un comentario que la menciona.
 *
 * Uso, desde la raíz del repositorio:
 *
 *     find web/src -name '*.ts' -o -name '*.tsx' | grep -v '\.test\.' > /tmp/f
 *     node scripts/identifiers/dump-ui-text.mjs < /tmp/f > /tmp/antes.txt
 *     ... renombrar ...
 *     node scripts/identifiers/dump-ui-text.mjs < /tmp/f > /tmp/despues.txt
 *     diff -a /tmp/antes.txt /tmp/despues.txt
 *
 * EL `-a` DE `diff` NO ES OPCIONAL. La salida contiene el byte NUL que
 * `findDuplicates` usa de separador, así que sin él `diff` responde «Binary
 * files differ» y no enseña la diferencia. Es la lección de #184 apareciendo
 * dentro de la propia comprobación, y pasó de verdad al hacer #178.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

// TypeScript vive en web/node_modules. Si falta, esto lanza, que es lo correcto:
// sin compilador no hay comparación, y no comparar no puede parecerse a comparar.
const ts = createRequire(new URL('../../web/', import.meta.url))('typescript')

const found = []

for (const file of readFileSync(0, 'utf8').split('\n').filter(Boolean)) {
  const text = readFileSync(file, 'utf8')
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)

  const bad = source.parseDiagnostics ?? []
  if (bad.length > 0) {
    const first = ts.flattenDiagnosticMessageText(bad[0].messageText, ' ')
    throw new Error(`${file}: no se pudo parsear (${first})`)
  }

  const visit = (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case ts.SyntaxKind.TemplateHead:
      case ts.SyntaxKind.TemplateMiddle:
      case ts.SyntaxKind.TemplateTail:
        found.push(node.text)
        break
      case ts.SyntaxKind.JsxText: {
        const trimmed = node.text.replace(/\s+/g, ' ').trim()
        if (trimmed) found.push(trimmed)
        break
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

// Ordenado, para que mover una cadena de sitio no se confunda con cambiarla:
// lo que se compara es el CONJUNTO de texto visible, no en qué orden aparece.
found.sort()
process.stdout.write(found.join('\n') + '\n')
