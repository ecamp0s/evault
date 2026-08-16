/**
 * Extrae los identificadores DECLARADOS de un fichero TypeScript o TSX, usando el
 * AST del propio compilador de TypeScript.
 *
 * Por qué el AST y no expresiones regulares: el inventario del issue #160 se hizo
 * con búsquedas de `const X =`, `function X` e `interface X`, y se quedó en 27
 * cuando eran más de cien. Lo que no veía era el destructuring —
 * `const [edicion, setEdicion] = useState()` —, que aquí sale gratis porque es un
 * nodo del árbol como cualquier otro.
 *
 * Lee de stdin la lista de ficheros, uno por línea, y escribe JSON en stdout.
 * Si un fichero no se puede leer o parsear, sale con código distinto de cero:
 * un extractor que omite en silencio devuelve un cero tranquilizador, que es la
 * lección de #184.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

// TypeScript vive en web/node_modules, no en la raíz, así que se resuelve desde
// allí explícitamente. Si falta, esto lanza — que es lo que tiene que pasar:
// sin compilador no hay medición, y no medir no puede parecerse a medir cero.
const ts = createRequire(new URL('../../web/', import.meta.url))('typescript')

/**
 * Nodos cuyo `name` es un identificador que escribimos nosotros.
 *
 * Deliberadamente NO está ImportSpecifier: el nombre de algo importado lo decide
 * quien lo exporta. Si es nuestro, ya se cuenta en su declaración; si es de una
 * librería, no es nuestro y renombrarlo no es posible.
 */
const DECLARATIONS = new Set([
  ts.SyntaxKind.VariableDeclaration,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.EnumMember,
  ts.SyntaxKind.Parameter,
  ts.SyntaxKind.BindingElement,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.TypeParameter,
  // Los accessors faltaban, y se notó leyendo y no ejecutando: `esDeValidacion`
  // en lib/api.ts es un getter y el comprobador lo daba por bueno. Encontrado al
  // hacer #179; el recuento de #189 se quedaba corto por esto.
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
])

/**
 * Un BindingElement puede ser el destructuring de un objeto de datos, y entonces
 * su nombre no es un identificador nuestro sino la clave del dato. El caso vivo
 * son los campos del blob: `const { nombre, usuario } = item.content` no declara
 * nada renombrable, describe lo que hay cifrado dentro de cada item guardado.
 *
 * Se distingue por la forma: en `{ nombre }` el nombre viene de la clave, y en
 * `{ nombre: itemName }` el identificador declarado es el de la derecha y la
 * clave queda como `propertyName`. Marcamos el primero para que el comprobador
 * pueda aplicarle la regla de los campos del contrato.
 */
function isShorthandBinding(node) {
  return node.kind === ts.SyntaxKind.BindingElement && !node.propertyName
}

/** Los tipos de nodo que declaran algo cuyo nombre es una clave de datos, no un símbolo. */
const DATA_KEYS = new Set([
  ts.SyntaxKind.PropertySignature, // miembros de interface: pueden ser el contrato del blob
])

function extract(file) {
  const text = readFileSync(file, 'utf8')
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)

  // createSourceFile no lanza ante código inválido: acumula diagnósticos del parser.
  // Un fichero que no se entiende tiene que romper, no producir cero identificadores.
  const bad = source.parseDiagnostics ?? []
  if (bad.length > 0) {
    const first = ts.flattenDiagnosticMessageText(bad[0].messageText, ' ')
    throw new Error(`${file}: no se pudo parsear (${first})`)
  }

  const out = []
  const visit = (node) => {
    const named = node.name && ts.isIdentifier(node.name)
    if (named && DECLARATIONS.has(node.kind)) {
      const { line } = source.getLineAndCharacterOfPosition(node.name.getStart(source))
      out.push({
        name: node.name.text,
        line: line + 1,
        shorthand: isShorthandBinding(node),
        dataKey: false,
      })
    } else if (named && DATA_KEYS.has(node.kind)) {
      const { line } = source.getLineAndCharacterOfPosition(node.name.getStart(source))
      out.push({ name: node.name.text, line: line + 1, shorthand: false, dataKey: true })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return out
}

const files = readFileSync(0, 'utf8').split('\n').filter(Boolean)
const result = {}
for (const file of files) {
  result[file] = extract(file)
}
process.stdout.write(JSON.stringify(result))
