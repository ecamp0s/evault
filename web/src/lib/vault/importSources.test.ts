import { beforeAll, describe, expect, it } from 'vitest'
import { auditPasswords } from '@/lib/vault/audit'
import { hasUnconfirmed } from '@/lib/vault/history'
import {
  groupDuplicates,
  identityOf,
  parseImportFile,
  planImport,
  summarise,
  type ImportPlan,
  type ImportPreview,
} from '@/lib/vault/import'
import type { Item, ItemContent } from '@/lib/vault/types'

/*
 * THE SOURCES OF ITERATION 17, SEEDED AND IMPORTED ONE AFTER ANOTHER — the test the exit
 * criterion rests on (#627): every account ends up in the vault once.
 *
 * WHAT MAKES IT DIFFERENT FROM THE BATCH TEST OF #623 is where it starts. That one feeds
 * hand-written `ItemContent`; this one feeds CSV TEXT, with the headers #610 measured on
 * the real exports, through the whole path an import takes — `parseImportFile`, then
 * `groupDuplicates`, then `planImport`. A fixture that does not have the shape of the real
 * file proves the code against itself: it is the lesson of #566, where a hand-written
 * authenticator modelled the half it knew well and the other half badly.
 *
 * THE DATA IS INVENTED; THE SHAPES ARE NOT. Each oddity #610 found in the real files is
 * here on purpose: Chrome's `note` column always empty, Firefox's bookkeeping columns,
 * NordPass's row that is a folder and not an entry, its identity with no type in
 * `ADR-020`, its card and its note — and one host that Chrome saved NINE times with two
 * passwords between them, next to the `dev.`, `pre.` and production hosts of the same site
 * that must not be folded together.
 *
 * FOUR BATCHES AND NOT THREE, and the fourth is here for one reason only: none of the three
 * real sources exports a TOTP seed at all (#610), so nothing they carry can prove that a
 * seed never lands in the notes. Bitwarden can — it is a supported format with a
 * `login_totp` column — and its header is the one the rest of the suite already uses.
 */

/** Chrome's header, as measured in #610. Its `note` column was empty in all 618 rows. */
const CHROME_HEADER = 'name,url,username,password,note'

/** Firefox's header, as measured in #610: no name, and four columns of bookkeeping. */
const FIREFOX_HEADER =
  'url,username,password,httpRealm,formActionOrigin,guid,timeCreated,timeLastUsed,timePasswordChanged'

/** NordPass's header, as measured in #610: twenty-four columns. */
const NORDPASS_HEADER =
  'name,url,additional_urls,username,password,note,cardholdername,cardnumber,cvc,pin,' +
  'expirydate,zipcode,folder,shared_folder,full_name,phone_number,email,address1,address2,' +
  'city,country,state,type,custom_fields'

const BITWARDEN_HEADER =
  'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp'

/** A row of a header, filled in by column name and empty everywhere else. */
function row(header: string, values: Record<string, string>): string {
  return header
    .split(',')
    .map((column) => values[column] ?? '')
    .join(',')
}

const CARD_NUMBER = '378282246310005'
const SEED = 'JBSWY3DPEHPK3PXP'

const CHROME = [
  CHROME_HEADER,
  row(CHROME_HEADER, { name: 'GitHub', url: 'https://github.com/login', username: 'ada@example.com', password: 'github-de-chrome' }),
  row(CHROME_HEADER, { name: 'Banco', url: 'https://banco.es', username: 'ada', password: 'banco-igual-en-las-dos' }),
  row(CHROME_HEADER, { name: 'Foro', url: 'https://foro.example.org', username: 'ada', password: 'solo-en-chrome' }),
  /*
   * The extreme group of the real export: one host and one user saved nine times, with
   * two passwords between them — Chrome keeps one entry per URL of the form.
   */
  ...Array.from({ length: 9 }, (_, n) =>
    row(CHROME_HEADER, {
      name: 'El Comercio',
      url: `https://dev.elcomercio.multidiario.com/login?from=${n}`,
      username: 'editora',
      password: n < 5 ? 'dev-una' : 'dev-otra',
    }),
  ),
  /*
   * Staging and production of the same site, with credentials that differ on purpose.
   * They are why `ADR-022` §2.1 rejected the registrable domain as the identity.
   */
  row(CHROME_HEADER, { name: 'El Comercio', url: 'https://pre.elcomercio.multidiario.com', username: 'editora', password: 'la-de-pre' }),
  row(CHROME_HEADER, { name: 'El Comercio', url: 'https://elcomercio.multidiario.com', username: 'editora', password: 'la-de-produccion' }),
].join('\n')

const NORDPASS = [
  NORDPASS_HEADER,
  // The same account as in Chrome, with a DIFFERENT password: the one conflict to decide.
  row(NORDPASS_HEADER, {
    name: 'GitHub',
    url: 'https://github.com',
    username: 'ada@example.com',
    password: 'github-de-nordpass',
    note: 'la del trabajo',
    type: 'password',
  }),
  row(NORDPASS_HEADER, { name: 'Banco', url: 'https://www.banco.es', username: 'ada', password: 'banco-igual-en-las-dos', type: 'password' }),
  row(NORDPASS_HEADER, {
    name: 'WP',
    url: 'https://wp.example',
    username: 'ada',
    password: 'solo-en-nordpass',
    folder: 'Wordpress',
    type: 'password',
  }),
  row(NORDPASS_HEADER, {
    name: 'Amex',
    cardholdername: 'Ada Lovelace',
    cardnumber: CARD_NUMBER,
    cvc: '1234',
    expirydate: '05/29',
    zipcode: '28001',
    type: 'credit_card',
  }),
  row(NORDPASS_HEADER, { name: 'Wifi de casa', note: 'la clave del router', type: 'note' }),
  row(NORDPASS_HEADER, { name: 'Mis datos', full_name: 'Ada Lovelace', phone_number: '600000000', city: 'Londres', type: 'identity' }),
  // A row that is a folder and not an entry: it carries only a name.
  row(NORDPASS_HEADER, { name: 'Trabajo', type: 'folder' }),
].join('\n')

const FIREFOX = [
  FIREFOX_HEADER,
  // Chrome's GitHub again, with the SAME password: a group with nothing to decide.
  '"https://www.github.com","ada@example.com","github-de-chrome","","https://github.com","{a1}","1","1","1"',
  '"https://accounts.google.com","ada@gmail.com","solo-en-firefox","","https://accounts.google.com","{a2}","1","1","1"',
].join('\n')

const BITWARDEN = [
  BITWARDEN_HEADER,
  // GitHub once more, carrying the seed nobody else exports.
  row(BITWARDEN_HEADER, {
    type: 'login',
    name: 'GitHub',
    reprompt: '0',
    login_uri: 'https://github.com',
    login_username: 'ada@example.com',
    login_password: 'github-de-chrome',
    login_totp: SEED,
  }),
].join('\n')

const BATCHES = [
  [CHROME, 'Chrome'],
  [NORDPASS, 'NordPass'],
  [FIREFOX, 'Firefox'],
  [BITWARDEN, 'Bitwarden'],
] as const

/** The vault as the server would hold it: entries with a stable id. */
interface Stored {
  id: string
  content: ItemContent
}

let nextId = 0

function apply(vault: Stored[], plan: ImportPlan): Stored[] {
  const next = vault.map((one) => ({ ...one }))

  for (const { index, content } of plan.update) next[index] = { ...next[index], content }

  for (const content of plan.create) {
    nextId += 1
    next.push({ id: `v${nextId}`, content })
  }

  return next
}

interface Batch {
  preview: ImportPreview
  plan: ImportPlan
  created: number
  vault: Stored[]
}

/** One file through the whole path an import takes, every group merged — the default. */
async function importBatch(vault: Stored[], csv: string, label: string): Promise<Batch> {
  const preview = await parseImportFile(csv)
  const existing = vault.map((one) => one.content)
  const resolved = groupDuplicates(preview.items, existing).map((group) => ({
    group,
    decision: 'merge' as const,
  }))
  const plan = planImport(preview.items, existing, resolved, label)

  return { preview, plan, created: summarise(plan, resolved).created, vault: apply(vault, plan) }
}

const batches: Batch[] = []
let vault: Stored[] = []

beforeAll(async () => {
  nextId = 0

  for (const [csv, label] of BATCHES) {
    const batch = await importBatch(vault, csv, label)

    batches.push(batch)
    vault = batch.vault
  }
})

const named = (name: string) => vault.filter((one) => one.content.name === name)
const asItems = (): Item[] =>
  vault.map((one) => ({ id: one.id, vaultId: 'v', content: one.content, createdAt: null, updatedAt: null }))

describe('the sources of Iteration 17, imported one after another', () => {
  it('reads every file as the format it is', () => {
    expect(batches.map((one) => one.preview.format)).toEqual(['chrome', 'nordpass', 'firefox', 'bitwarden'])
  })

  /*
   * Check 1: an account present in several sources is in the vault once. GitHub is in
   * all four; Banco in two.
   */
  it('keeps each account that was in several sources once', () => {
    const identities = vault.map((one) => identityOf(one.content)).filter(Boolean)

    expect(new Set(identities).size).toBe(identities.length)
    expect(named('GitHub')).toHaveLength(1)
    expect(named('Banco')).toHaveLength(1)
  })

  // Check 2: what only one source had is there, as it came.
  it('keeps what only one source had, with its password', () => {
    expect(named('Foro')[0]?.content.password).toBe('solo-en-chrome')
    expect(named('WP')[0]?.content.password).toBe('solo-en-nordpass')
    expect(named('accounts.google.com')[0]?.content.password).toBe('solo-en-firefox')
  })

  /*
   * Check 3: the account whose sources disagreed is ONE entry, with the other password in
   * its history, marked as unconfirmed — which is what the audit then lists.
   */
  it('leaves the disagreeing account as one entry with the other password waiting', () => {
    const github = named('GitHub')[0].content

    expect(github.password).toBe('github-de-chrome')
    expect(github.history?.map((one) => [one.password, one.origin])).toEqual([['github-de-nordpass', 'import']])
    expect(hasUnconfirmed(github)).toBe(true)
  })

  /*
   * The extreme group of the real export: nine rows of one host become one entry, with
   * the second password waiting — and the staging and production hosts stay apart.
   */
  it('folds the nine copies of one host into one, and keeps the other environments apart', () => {
    const elComercio = named('El Comercio')
    const hosts = elComercio.map((one) => new URL(one.content.url ?? '').hostname).sort()

    expect(hosts).toEqual([
      'dev.elcomercio.multidiario.com',
      'elcomercio.multidiario.com',
      'pre.elcomercio.multidiario.com',
    ])

    const dev = elComercio.find((one) => one.content.url?.includes('dev.'))?.content

    expect(dev?.history?.map((one) => one.password)).toEqual(['dev-otra'])
  })

  /*
   * Check 4: no seed and no card number anywhere in the notes — the one field the search
   * indexes. The seed is where it belongs, carried over from the only format that has it.
   */
  it('puts no seed and no card number in the notes of any entry', () => {
    for (const { content } of vault) {
      expect(content.notes ?? '').not.toContain(CARD_NUMBER)
      expect(content.notes ?? '').not.toContain(SEED)
    }

    expect(named('GitHub')[0].content.totp).toBe(SEED)
  })

  // Check 5: NordPass's card is a card and its note is a note.
  it('brings the card in as a card and the note as a note', () => {
    const amex = named('Amex')[0].content

    expect(amex.type).toBe('card')
    expect(amex.number).toBe(CARD_NUMBER)
    expect(amex.cardholder).toBe('Ada Lovelace')
    expect(named('Wifi de casa')[0].content.type).toBe('note')
  })

  /*
   * And the two things NordPass has that `ADR-020` does not: the folder row is not an
   * entry, and the identity comes in as a login with its details in the notes — no third
   * type invented for it (#514).
   */
  it('drops the folder row, and brings the identity in without inventing a type', () => {
    expect(named('Trabajo')).toEqual([])
    expect(batches[1].preview.notItems).toBe(1)

    const identity = named('Mis datos')[0].content

    expect(identity.type).toBeUndefined()
    expect(identity.notes).toContain('Ada Lovelace')
    expect(named('WP')[0].content.tags).toEqual(['Wordpress'])
  })

  /*
   * Check 6: what the summaries said adds up to what is in the vault. Every entry was
   * created by exactly one batch, so the entries created per batch add up to the vault.
   */
  it('adds up what each batch said it created to what the vault holds', () => {
    expect(batches.reduce((total, one) => total + one.created, 0)).toBe(vault.length)
    expect(vault).toHaveLength(11)
  })

  /*
   * And the audit, which is where the undecided ones are resolved, lists exactly the two
   * entries whose passwords disagreed: GitHub across sources, El Comercio within Chrome.
   */
  it('leaves the audit listing exactly the two undecided entries', () => {
    expect(auditPasswords(asItems()).unresolved.map((one) => one.content.name).sort()).toEqual([
      'El Comercio',
      'GitHub',
    ])
  })

  /*
   * THE PROOF THAT IMPORTING IS SAFE TO REPEAT, over the real shapes: the four files again
   * write nothing and leave the vault byte for byte as it was.
   */
  it('writes nothing when the four files are imported again', async () => {
    let again = vault
    const before = JSON.stringify(vault)

    for (const [csv, label] of BATCHES) {
      const batch = await importBatch(again, csv, label)

      expect(batch.plan.create).toEqual([])
      expect(batch.plan.update).toEqual([])
      again = batch.vault
    }

    expect(JSON.stringify(again)).toBe(before)
  })
})
