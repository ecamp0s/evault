/**
 * Turning measurements of a large vault into a verdict. See #348.
 *
 * THE HARD PART OF THIS FILE IS NOT THE ARITHMETIC, IT IS WHICH NUMBERS ARE ALLOWED
 * TO DECIDE. #348 left it open on purpose and warned about the trap: the figures that
 * motivated the iteration — 2.657 ms to paint, 773 ms per keystroke — were measured on
 * one laptop, and a threshold pinned to them goes red on a slower machine while
 * nothing is worse. A check that fails for no reason gets ignored whole, which is the
 * lesson of #62.
 *
 * So the limits come in two families, and only one of them can fail the run.
 *
 * STRUCTURAL LIMITS DECIDE. They are counts, not clocks, and they are the same on any
 * machine: how many requests an import fires, how many a single delete fires, whether
 * the user menu is inside the window, and whether the DOM grows with the number of
 * entries. Every defect this iteration is about shows up in one of them — and none of
 * them moves because the CPU is busy.
 *
 * CLOCK LIMITS ARE RELATIVE, and only catch an order of magnitude. What is compared is
 * the same vault at two sizes on the same machine in the same run: painting 370 entries
 * against painting 10. A virtualised list barely notices the difference; today's list
 * costs about twenty times more. A ratio cancels out the machine, which an absolute
 * millisecond count cannot.
 *
 * There is still an absolute ceiling, deliberately absurd — three seconds to paint —
 * for the case where everything is slow and the ratio stays flat because both ends
 * are terrible. It exists to avoid a green run on a catastrophe, not to measure
 * performance.
 */

/**
 * What the numbers have to satisfy.
 *
 * SMALL is the reference size for every ratio. It has to be big enough that the
 * measurement is not pure noise and small enough that no defect of the large vault
 * shows up in it — ten entries is what a vault looks like on its first day.
 */
export const SMALL = 10

export const LIMITS = {
  /*
   * An import of N entries should cost about N writes plus the odd list read. The
   * `+ 2` is one for the list the screen already had and one for a single refresh at
   * the end; what it rules out is one refresh PER entry, which is what makes today's
   * import fire 741 requests for 370 entries.
   */
  requestsPerImport: (entries) => entries + 2,
  /*
   * Deleting one entry is one request. Today it is two, because the mutation
   * invalidates the list and the whole vault comes down again — which the server
   * cannot make cheaper, since it does not know what is inside.
   */
  requestsPerDelete: 1,
  /*
   * The DOM must not grow with the vault. Two times the nodes of a ten-entry vault is
   * generous — a virtualised list adds a handful of rows and a scroll container —
   * while today's list, at 370 entries, is more than ten times.
   */
  domGrowth: 2,
  /*
   * What the review screen may cost in DOM nodes, against the vault list behind it.
   *
   * IT IS A DIFFERENT SHAPE OF LIMIT FROM `domGrowth`, and the reason is that this list
   * is NOT virtualised: it paints every flagged entry, so its nodes grow with what is
   * wrong in the vault and not with the vault. Measured on the real one, 246 of 369
   * entries carry a finding.
   *
   * So what is checked is not that it stops growing —it does grow— but that opening it
   * does not multiply the page: three times the nodes of the list behind it is generous
   * for three sections of rows, and tight enough that painting every entry twice, or
   * dropping the virtualisation of the list itself, shows up here.
   */
  auditDomGrowth: 3,
  /* Painting and searching a large vault, against the same operations on a small one. */
  paintGrowth: 3,
  searchGrowth: 3,
  /* The absurd ceiling. Not a performance target: a floor under catastrophe. */
  paintCeilingMs: 3000,
  searchCeilingMs: 500,
  /*
   * Below this, a ratio means nothing and neither does the wait.
   *
   * Once the list is virtualised, painting is a handful of milliseconds at both sizes,
   * and 4 ms against 11 is a ×2.8 made of scheduling noise. Without a floor, this check
   * would start failing at random precisely when the work is done — the shape of a
   * check people learn to re-run until it goes green.
   */
  noiseFloorMs: 50,
}

/**
 * Every finding, in the order they are reported.
 *
 * Each entry knows how to read itself out of the measurements and how to say what is
 * wrong in one line. Keeping the sentence next to the rule is what stops the report
 * from turning into a table of numbers whose meaning lives somewhere else.
 */
const CHECKS = [
  {
    id: 'user-menu',
    structural: true,
    of: (m) => ({
      ok: m.large.userMenu.insideWindow,
      detail: m.large.userMenu.insideWindow
        ? `el menú de usuario está a ${Math.round(m.large.userMenu.top)} px, dentro de la ventana de ${m.large.userMenu.windowHeight}`
        : `el menú de usuario está a ${Math.round(m.large.userMenu.top)} px con la ventana en ${m.large.userMenu.windowHeight}: hay que recorrer ${Math.round(m.large.userMenu.top - m.large.userMenu.windowHeight)} px para alcanzarlo`,
    }),
  },
  {
    id: 'dom-growth',
    structural: true,
    of: (m) => {
      const growth = m.large.domNodes / m.small.domNodes
      return {
        ok: growth <= LIMITS.domGrowth,
        detail: `${m.small.domNodes} nodos con ${SMALL} entradas y ${m.large.domNodes} con ${m.entries}: ×${growth.toFixed(1)} (se permite ×${LIMITS.domGrowth})`,
      }
    },
  },
  {
    id: 'import-requests',
    structural: true,
    of: (m) => {
      const allowed = LIMITS.requestsPerImport(m.entries)
      return {
        ok: m.import.requests <= allowed,
        detail: `${m.import.requests} peticiones para importar ${m.entries} entradas en ${(m.import.ms / 1000).toFixed(1)} s (se permiten ${allowed})`,
      }
    },
  },
  {
    id: 'delete-requests',
    structural: true,
    of: (m) => ({
      ok: m.delete.requests <= LIMITS.requestsPerDelete,
      detail: `${m.delete.requests} peticiones para borrar una entrada, en ${Math.round(m.delete.ms)} ms (se permite ${LIMITS.requestsPerDelete})`,
    }),
  },
  {
    /*
     * #360, and it lives here because jsdom cannot see it.
     *
     * Every dialog is MOUNTED rather than opened by a trigger, so the primitive had no
     * trigger to hand the focus back to and closing left it on `document.body`. With
     * 370 entries that means somebody navigating by keyboard is put back at the top of
     * the page and has to tab through the whole list again.
     *
     * A jsdom test was written first and thrown away: it passed with the fix AND with
     * the fix mutated out, so it guarded nothing. A green-either-way test is worse than
     * none — it is the reassuring zero this project keeps finding.
     */
    id: 'dialog-focus',
    structural: true,
    of: (m) => ({
      ok: m.large.dialogFocus.returned,
      detail: m.large.dialogFocus.returned
        ? 'cerrar un diálogo devuelve el foco al botón que lo abrió'
        : `cerrar un diálogo deja el foco en ${m.large.dialogFocus.landedOn}, no en el botón que lo abrió`,
    }),
  },
  {
    id: 'audit-dom',
    structural: true,
    of: (m) => {
      const growth = m.audit.domNodes / m.large.domNodes

      /*
       * THE RECEIPT COMES BEFORE THE LIMIT, and it is not ceremony: the first run of this
       * check went green over a review screen that had found NOTHING. The seeded
       * passwords were all long, varied and distinct, so the screen was empty and its
       * ×0.1 said only that an empty page is small.
       *
       * A limit that passes hardest when there is nothing to measure is worse than no
       * limit, so this refuses to pass unless the screen actually audited entries and
       * actually painted rows.
       */
      if (m.audit.audited === 0 || m.audit.rows === 0) {
        return {
          ok: false,
          detail: `la revisión auditó ${m.audit.audited} contraseñas y pintó ${m.audit.rows} filas, así que no había nada que medir — un verde aquí no habría dicho nada`,
        }
      }

      return {
        ok: growth <= LIMITS.auditDomGrowth,
        detail: `la revisión marca ${m.audit.flagged} de ${m.audit.audited} y pinta ${m.audit.rows} filas con ${m.audit.domNodes} nodos, contra ${m.large.domNodes} de la lista: ×${growth.toFixed(1)} (se permite ×${LIMITS.auditDomGrowth})`,
      }
    },
  },
  {
    id: 'paint-growth',
    structural: false,
    of: (m) => {
      const { ok, growth } = ratio(m.small.paintMs, m.large.paintMs, LIMITS.paintGrowth, LIMITS.paintCeilingMs)
      return {
        ok,
        detail: `pintar ${m.entries} entradas cuesta ${m.large.paintMs} ms contra ${m.small.paintMs} de ${SMALL}: ${growth} (se permite ×${LIMITS.paintGrowth}, techo ${LIMITS.paintCeilingMs} ms)`
          + `\n    y el desbloqueo entero, PBKDF2 incluido: ${m.large.totalMs} ms contra ${m.small.totalMs}`,
      }
    },
  },
  {
    id: 'search-growth',
    structural: false,
    of: (m) => {
      const { ok, growth } = ratio(m.small.searchMs, m.large.searchMs, LIMITS.searchGrowth, LIMITS.searchCeilingMs)
      return {
        ok,
        detail: `buscar con ${m.entries} entradas cuesta ${m.large.searchMs} ms contra ${m.small.searchMs} de ${SMALL}: ${growth} (se permite ×${LIMITS.searchGrowth}, techo ${LIMITS.searchCeilingMs} ms)`,
      }
    },
  },
]

/**
 * Compares two timings of the same operation at two vault sizes.
 *
 * Both under the noise floor is a pass and says so, rather than dividing two numbers
 * that are mostly scheduling jitter. Over the ceiling is a fail whatever the ratio
 * says, which covers the case where both ends are slow and the ratio stays flat.
 */
function ratio(small, large, allowed, ceilingMs) {
  if (small <= LIMITS.noiseFloorMs && large <= LIMITS.noiseFloorMs) {
    return { ok: true, growth: `las dos por debajo de ${LIMITS.noiseFloorMs} ms, sin nada que comparar` }
  }
  if (large > ceilingMs) {
    return { ok: false, growth: `×${(large / Math.max(small, 1)).toFixed(1)}, y por encima del techo` }
  }
  return { ok: large / Math.max(small, 1) <= allowed, growth: `×${(large / Math.max(small, 1)).toFixed(1)}` }
}

/** What each check is called on screen. In Spanish, because the report is read by a person. */
const TITLES = {
  'user-menu': 'el menú de usuario se alcanza sin recorrer la lista',
  'dom-growth': 'el DOM no crece con el número de entradas',
  'import-requests': 'importar N entradas cuesta N peticiones, no 2N',
  'delete-requests': 'borrar una entrada no vuelve a descargar la vault',
  'dialog-focus': 'cerrar un diálogo devuelve el foco al botón que lo abrió',
  'audit-dom': 'abrir la revisión no multiplica la página',
  'paint-growth': 'pintar una vault grande no cuesta un orden de magnitud más',
  'search-growth': 'buscar en una vault grande no cuesta un orden de magnitud más',
}

/**
 * Reads the measurements and returns one finding per check.
 *
 * A finding is never absent: a check that passes is reported too, with its number.
 * A report that only lists problems cannot tell «measured and fine» from «not
 * measured», and this project has paid for that distinction more than once.
 */
export function evaluate(measurements) {
  return CHECKS.map((check) => {
    const { ok, detail } = check.of(measurements)
    return { id: check.id, title: TITLES[check.id], structural: check.structural, ok, detail }
  })
}

/**
 * The verdict.
 *
 * ONLY STRUCTURAL FINDINGS TURN THE RUN RED. A clock finding is printed, and loudly,
 * but it does not fail the run on its own — because the one thing it could mean is
 * that this machine is slower than the one the ratios were chosen on. If the timings
 * are bad for a real reason, a structural finding is red too: a list that takes twenty
 * times longer to paint is a list whose DOM grew.
 *
 * That asymmetry is deliberate and it is the price of a check people keep running.
 */
export const failed = (findings) => findings.some((f) => f.structural && !f.ok)
