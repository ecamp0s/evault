/**
 * Dumps ALL the visible text of some TypeScript or TSX files, so that it can be
 * compared before and after a rename.
 *
 * WHY IT EXISTS. In #115 a rename turned «Tienes cambios sin guardar» into «sin
 * save», and it was wrong on `master` for two issues in a row because no
 * line-by-line audit saw it: the interface's sentences break across line endings,
 * and the diff of a rename is too large to read. The check that works is comparing
 * the whole set of visible text, and that is what this command prints.
 *
 * WHAT COUNTS AS VISIBLE TEXT. String literals, templates —including the pieces
 * split by interpolations, which is where the sentences break— and JSX text.
 * Through the AST and not with regular expressions, because a regex does not tell
 * a string from a comment that mentions it.
 *
 * Usage, from the root of the repository:
 *
 *     find web/src -name '*.ts' -o -name '*.tsx' | grep -v '\.test\.' > /tmp/f
 *     node scripts/identifiers/dump-ui-text.mjs < /tmp/f > /tmp/antes.txt
 *     ... rename ...
 *     node scripts/identifiers/dump-ui-text.mjs < /tmp/f > /tmp/despues.txt
 *     diff -a /tmp/antes.txt /tmp/despues.txt
 *
 * `diff`'s `-a` IS NOT OPTIONAL. The output contains the NUL byte that
 * `findDuplicates` uses as a separator, so without it `diff` answers «Binary
 * files differ» and does not show the difference. It is the lesson of #184
 * turning up inside the check itself, and it really happened while doing #178.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

// TypeScript lives in web/node_modules. If it is missing, this throws, which is the
// right thing: with no compiler there is no comparison, and not comparing must not be
// allowed to look like comparing.
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

// Sorted, so that moving a string around is not confused with changing it: what is
// compared is the SET of visible text, not the order it appears in.
found.sort()
process.stdout.write(found.join('\n') + '\n')
