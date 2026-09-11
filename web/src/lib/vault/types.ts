/**
 * The contract of the vaults API, exactly as the server returns it.
 *
 * These types describe what travels over the wire. What the user sees lives inside
 * the blob and has a type of its own, ItemContent, which the server neither
 * knows nor can know. See docs/architecture/FOUNDATION.md.
 */

export interface Vault {
  id: string
  name: string
  is_personal: boolean
  role: 'owner'
  /**
   * The key that opens this vault, wrapped with the master key of whoever is asking.
   *
   * It travels here and not in the login response because it belongs to the vault
   * and not to the session: once shared vaults exist, each will bring its own. It is
   * also what let the contract of /api/auth stay unchanged. See ADR-008.
   */
  wrapped_key: string
  wrapped_key_iv: string
}

/**
 * An item as the server stores it: opaque bytes, their nonce, and the version of the
 * schema they were written under.
 *
 * There is no field carrying meaning, and that is not an omission: if the name or the
 * URL travelled in the clear, the server would know which services the user has an
 * account with.
 */
export interface EncryptedItem {
  id: string
  vault_id: string
  ciphertext: string
  iv: string
  version: number
  created_at: string | null
  updated_at: string | null
}

/** What is sent when creating or updating. The three fields always travel together. */
export interface ItemPayload {
  ciphertext: string
  iv: string
  version: number
}

/**
 * The real content of an entry, already decoded.
 *
 * Everything in here is what the server must never see. Adding a field to this
 * interface is free and needs no migration, because the server only stores the
 * serialised result; adding a column to the table, on the other hand, is a security
 * decision.
 *
 * THESE NAMES ARE THE FORMAT OF THE BLOB AND NOT IDENTIFIERS, which is what makes them
 * expensive rather than what makes them untouchable. The object is serialised with
 * JSON.stringify and encrypted as it stands, so its keys are what is written inside
 * every item already saved, and **the server cannot convert them because it cannot read
 * them** — ADR-001 working, not a fear.
 *
 * SO RENAMING ONE IS NOT FORBIDDEN, IT IS PAID FOR: either a migration in the client,
 * which is the only place the vault is decrypted, or an empty database. They were in
 * Spanish until 9 September 2026, and #543 brought them across paid the second way —
 * #544 emptied the instance, so there was nothing left to convert.
 *
 * For whoever adds the next field: write it in English, and if it ever has to change
 * after that, price the migration instead of inventing a reason not to. The contract is
 * fixed in docs/architecture/FOUNDATION.md.
 *
 * ADR-020 §5 STILL SPELLS THESE FIELDS IN SPANISH and is not corrected, because ADRs are
 * immutable — the same way ADR-007 and ADR-019 still name browser keys that #476
 * renamed. What survives of that section is its reasoning, untouched: `csc` and not
 * `cvv`, and no card-brand field.
 */
export interface ItemContent {
  name: string
  username?: string
  password?: string
  url?: string
  notes?: string
  /**
   * Whether the entry is a favourite, which the list puts on top.
   *
   * `true` OR ABSENT, NEVER `false`, and that is the contract and not a style choice:
   * FOUNDATION.md says to omit the keys that are not filled in, and a boolean would add
   * a key saying «no» to every one of the 370 entries — bytes that get encrypted,
   * stored and downloaded on every load to carry no information.
   *
   * Unmarking therefore DELETES the key, it does not set it to false.
   *
   * British spelling, matching `onToggleFavourite` in the row that writes it. The
   * plaintext CSV column is `favorite`, Bitwarden's spelling, and the two are allowed to
   * differ: one is the blob's format and the other is somebody else's file format.
   */
  favourite?: true
  /**
   * The entry's tags, which is how a flat vault gets grouped.
   *
   * OMITTED WHEN EMPTY, never `[]`, for the same reason as `favourite`: FOUNDATION.md
   * says to leave out what is not filled in, and an empty array in every entry is bytes
   * that get encrypted, stored and downloaded to say nothing.
   *
   * TAGS AND NOT FOLDERS, decided in #378. A folder forces an entry to live in exactly
   * one place, and in a personal vault that breaks at once: the company's bank account
   * belongs to work and belongs to the bank. Tags do not make anybody choose, and if it
   * turns out folders are what was wanted, that will be visible with the vault in front
   * rather than decided now.
   *
   * The list of existing tags is worked out IN THE CLIENT, by walking the decrypted
   * items. There is not and cannot be an endpoint that returns it — the server cannot
   * read them, which is what makes this a demonstration of the model and not just a
   * feature.
   *
   * `tags` and not `labels`: it is what the other managers call them, and what the
   * plaintext CSV column already said.
   */
  tags?: string[]
  /**
   * The seed of the entry's second factor, as an `otpauth://` URI or a bare base32 key.
   *
   * OMITTED WHEN EMPTY, like everything else that is not filled in.
   *
   * IT IS THE SEED AND NOT THE CODE. The code is six digits that expire in thirty
   * seconds and is worked out from this plus the clock; the seed does not expire, which
   * is why it is treated as a password everywhere: it is not painted in the list, it is
   * not shown without an explicit action, and IT NEVER LEAVES IN THE PLAINTEXT EXPORT.
   * ADR-017 §2.3 decided that last one, and the reason is that a password can be rotated
   * in five minutes while a seed means reconfiguring the second factor account by
   * account, with its QR code and its backup codes.
   *
   * WHAT IS STORED IS WHAT WAS PASTED, trimmed and nothing else. When it is a URI it
   * carries the digits, the period, the algorithm and the issuer, so normalising it to a
   * bare key would throw away what the service said about itself; and there is nothing to
   * gain by rewriting a key that `parseTotp` already reads in either form.
   *
   * `totp` WAS IN ENGLISH WHEN THE REST WAS NOT, and the reason for that exemption
   * outlived the rule it was an exemption to. It is not a word in any language: it is the
   * acronym of the standard, the same string every other manager and every `otpauth://`
   * URI uses. Choosing `segundoFactor` would name in Spanish something that has no
   * Spanish name, and choosing `otp` would be less precise. What it does inherit from
   * the five originals is the part that matters: once written inside an item, renaming
   * it costs a migration in the client or an empty database, like any other key of the
   * blob. See docs/architecture/FOUNDATION.md and ADR-017 §2.2.
   */
  totp?: string
  /**
   * What kind of entry this is.
   *
   * ABSENT MEANS A LOGIN, and that is the whole reason this decision costs nothing:
   * every entry written before ADR-020 has no `type`, so none of them needs migrating,
   * rewriting or even reading. It is the same contract as `favourite` and `tags` —
   * leave out what is not filled in — applied to the field that defines the rest.
   *
   * A migration here would not be expensive, it would be dangerous: rewriting the 370
   * entries of the real vault means 370 writes against the instance holding the real
   * passwords, and a run interrupted halfway leaves a mixed state the server cannot
   * even diagnose, because it cannot read any of it.
   *
   * IT IS FIXED WHEN THE ENTRY IS CREATED AND NEVER CHANGED. `toContent` builds on top
   * of what was stored, so changing the type would leave the previous type's fields
   * living invisibly inside the entry — a password nobody sees inside a card. Whoever
   * wants something else creates another entry. See ADR-020 §4.
   *
   * AND THERE IS NO COLUMN FOR THIS, which is the part worth saying out loud: a `type`
   * column in `vault_items` would tell the server how many cards each user has without
   * decrypting anything, and that is exactly the metadata ADR-001 refuses to store. The
   * type is content, so it lives where the content lives.
   *
   * Absent means a login, which is the whole reason this cost nothing to introduce.
   * See ADR-020 §4.
   */
  type?: 'card' | 'note'
  /**
   * The name on the card. Only in a `tarjeta`.
   *
   * It is the field that tells one household card from another, which is why it is the
   * only one of the five that the search indexes: the other four are secrets or say
   * nothing.
   */
  cardholder?: string
  /**
   * The card number. Only in a `tarjeta`.
   *
   * TREATED AS A PASSWORD EVERYWHERE, and it is worth writing down because it is not
   * obvious: it is the field you pay with. It is not painted in the list, it is not
   * searched, and it is copied with the clipboard-clearing helper.
   *
   * NOT EVEN THE LAST FOUR DIGITS get painted, though they would be the handy way to
   * recognise a card: those four are precisely what a bank asks for over the phone.
   *
   * NO FIXED SHAPE IS VALIDATED, only a length cap. An American Express number has
   * FIFTEEN digits and not sixteen, grouped 4-6-5, so any shape rule would be a guess
   * about the brands we happen to have seen — and being wrong means refusing to save a
   * card the user is holding. See ADR-020 §6.
   */
  number?: string
  /**
   * When the card expires, stored as whatever was typed. Only in a `tarjeta`.
   *
   * Not parsed into a date and not validated into a shape, for the same reason the URL
   * is not validated as a URL: it exists to be read back off the screen, and picking a
   * fight over `05/29` versus `05/2029` buys nothing.
   */
  expiry?: string
  /**
   * The card security code. Only in a `tarjeta`. A secret, like `number` and `pin`.
   *
   * `csc` AND NOT `cvv`, and that is a decision, not a slip. CSC —Card Security Code—
   * is the generic term; each brand names its own differently: CVV2 on Visa, CVC2 on
   * Mastercard, CID on American Express and on Discover. Calling it `cvv` would write
   * one brand's name inside every card ever saved, and with it that brand's assumption
   * that the code is three digits — AMERICAN EXPRESS CODES ARE FOUR, and printed on the
   * front rather than the back.
   *
   * It gets the same exemption as `totp` from the rule that keeps these names in
   * Spanish: it is the acronym of a standard and not a word in any language, so naming
   * it in Spanish would be naming in Spanish something that has no Spanish name.
   *
   * What the user reads is a different thing and it is in Spanish: the label spells out
   * «security code» in words rather than any brand's acronym, which is what makes it
   * work for all four the way «CVV» does not. See ADR-020 §5.
   */
  csc?: string
  /**
   * The card's PIN. Only in a `tarjeta`. A secret, like `number` and `csc`.
   *
   * Length capped and shape not validated, like the rest: they are not always four
   * digits — there are issuers handing out five and six.
   */
  pin?: string
  /**
   * The passwords this entry has had before the one it carries now.
   *
   * DECIDED IN `ADR-018` §2.1 AND PUT INTO EFFECT BY `ADR-022`. That ADR was approved
   * with its coming into force deferred, and it created this field a month before the
   * iteration that needed it: the shape, the cap of three, the date as information and
   * the explicit forgetting are all its decisions, not this iteration's.
   *
   * IT IS CALLED `history` AND `ADR-018` SPELLS IT `historial`, twenty-four times. That
   * document was written on 2 September 2026 and #542 retired the rule that made it
   * Spanish on the 9th, seven days later; #571 left the correction written down so that
   * implementing the ADR literally would not manufacture new Spanish inside the blob —
   * which is the mechanism that cost #542, #543 and emptying the instance.
   *
   * OMITTED WHEN EMPTY, never `[]`, like `favourite` and `tags` and for the same measured
   * reason: a key that says «none» in each of 370 entries is bytes that get encrypted,
   * stored and downloaded to carry nothing.
   *
   * THE VAULT NOW HOLDS MORE SECRETS THAN ITS OWNER PUT IN IT, which `ADR-018` §5 states
   * as the central consequence and does not disguise: whoever compromises a vault with
   * history also gets passwords that were retired, and those may still be live
   * elsewhere. The two mitigations inside the decision are the cap of three and being
   * able to forget it.
   *
   * NEWEST FIRST. The cap drops the oldest, so the order is what decides what is lost.
   */
  history?: HistoryEntry[]
}

/**
 * One password an entry used to carry, and where it came from.
 *
 * `origin` IS WHAT KEEPS THIS FIELD HONEST, and it is the piece `ADR-018` did not have
 * because it did not need it. That ADR closed with «the import never creates history […]
 * there is no way to manufacture history that did not happen», and it was right about
 * the case it had: an import from a single source knows nothing about an entry's past,
 * so any history it wrote would be invented.
 *
 * A RECONCILIATION IS NOT THAT CASE. Two managers each carry a real password for one
 * account, both of them written by a real program; what is unknown is not whether they
 * happened but WHICH ONE IS CURRENT. What would be inventing is presenting the loser as
 * a RETIRED password — which is what an entry written by a rotation means — and dating
 * it as if it had been retired the day it was imported.
 *
 * So each entry knows which of the two it is, and `ADR-022` §2.2 turns on that
 * distinction:
 *
 * - `rotation` — its owner changed the password, or said another one was the good one.
 *   Retired, in `ADR-018`'s sense: it is the owner's word that makes it so (#621)
 * - `import` — two sources disagreed and NOBODY HAS SAID which one is current. It claims
 *   nothing about being retired, and it is what the audit lists as unresolved (#622)
 *
 * `date` IS WHEN IT ENTERED THE HISTORY, not when it was retired, and that is the only
 * thing true of both cases. `ADR-018` §2.2 already fixed that the date is information
 * and not policy: nothing is purged by it, because inside the blob no clock runs.
 */
export interface HistoryEntry {
  password: string
  /** ISO 8601, in UTC. When it entered the history. */
  date: string
  origin: 'rotation' | 'import'
}

/** An item with its content already decoded, which is what the screens use. */
export interface Item {
  id: string
  vaultId: string
  content: ItemContent
  createdAt: string | null
  updatedAt: string | null
}
