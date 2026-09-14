import { describe, expect, it } from 'vitest'
import { UNREADABLE } from '@/lib/vault/payload'
import type { Item, ItemContent } from '@/lib/vault/types'
import { MAX_ROWS, canFill, fillHostOf, select, siteHostOf } from './entries'

let next = 0
function item(content: Partial<ItemContent> & { name: string }): Item {
  next += 1
  return { id: `i${next}`, vaultId: 'v', content: content as ItemContent, createdAt: null, updatedAt: null }
}

const names = (rows: Item[]) => rows.map((row) => row.content.name)

describe('which entries the popup shows', () => {
  const github = item({ name: 'GitHub', username: 'ada', password: 'p', url: 'https://github.com/login' })
  const githubWork = item({ name: 'GitHub trabajo', username: 'ada@work', password: 'p', url: 'https://www.github.com' })
  const gitlab = item({ name: 'GitLab', username: 'ada', password: 'p', url: 'https://gitlab.com' })
  const devSite = item({ name: 'Tienda dev', username: 'ada', password: 'p', url: 'https://dev.tienda.com' })
  const prodSite = item({ name: 'Tienda', username: 'ada', password: 'p', url: 'https://tienda.com' })
  const card = item({ name: 'GitHub tarjeta', type: 'card', number: '4111' } as never)
  const note = item({ name: 'GitHub nota', type: 'note', notes: 'x' })
  const all = [gitlab, github, card, githubWork, note, devSite, prodSite]

  it('with nothing typed, shows only the entries of the open site', () => {
    expect(names(select(all, '', 'github.com').rows)).toEqual(['GitHub', 'GitHub trabajo'])
  })

  it('with nothing typed and no site, shows nothing rather than the whole vault', () => {
    expect(select(all, '', null).rows).toEqual([])
  })

  /*
   * GitLab is LAST in what goes in, so the order that comes out is the ordering's doing and
   * not the input's. The first version of this test had it first and passed with the
   * ordering removed — found by mutating it in #672.
   */
  it('searches the whole vault and puts the open site first', () => {
    expect(names(select([github, githubWork, gitlab], 'git', 'gitlab.com').rows)).toEqual([
      'GitLab',
      'GitHub',
      'GitHub trabajo',
    ])
  })

  /*
   * ADR-022 §2.1: dev and production of one site are different credentials on purpose.
   * Offering the production password on the dev site is how it gets typed into the wrong one.
   */
  it('does not treat another subdomain as the same site, in either direction', () => {
    expect(names(select(all, '', 'dev.tienda.com').rows)).toEqual(['Tienda dev'])
    // The direction that matters: on production, the dev entry is not offered. The first
    // version only checked the other one and let a suffix match through (#672).
    expect(names(select(all, '', 'tienda.com').rows)).toEqual(['Tienda'])
  })

  it('shows logins only: cards and notes stay in the web', () => {
    expect(names(select(all, 'github', null).rows)).toEqual(['GitHub', 'GitHub trabajo'])
  })

  it('leaves out an entry that could not be decrypted', () => {
    const broken: Item = { ...github, id: 'broken', content: UNREADABLE }
    expect(select([broken, github], 'leer', null).rows).toEqual([])
  })

  it('caps the rows and still says how many matched', () => {
    const many = Array.from({ length: 70 }, (_, index) => item({ name: `Cuenta ${index}`, password: 'p' }))
    const { rows, total } = select(many, 'cuenta', null)

    expect(rows).toHaveLength(MAX_ROWS)
    expect(total).toBe(70)
  })

  it('counts the rows of the open site', () => {
    expect(select(all, 'git', 'github.com').onThisSite).toBe(2)
  })
})

describe('the host of the open tab', () => {
  it('reads a web page', () => {
    expect(siteHostOf('https://www.github.com/login')).toBe('github.com')
  })

  it('has none for the browser own pages, nor for no address at all', () => {
    expect(siteHostOf('chrome://newtab/')).toBeNull()
    expect(siteHostOf('chrome-extension://abc/popup.html')).toBeNull()
    expect(siteHostOf(undefined)).toBeNull()
  })
})

describe('when a row offers to fill the page', () => {
  const login = (url: string, password = 'p') => item({ name: 'x', username: 'u', password, url })

  it('offers it on the entry own site', () => {
    expect(canFill(login('https://www.github.com/login'), 'github.com')).toBe(true)
  })

  it('does not offer it on another site, nor on another subdomain in either direction', () => {
    expect(canFill(login('https://github.com'), 'gitlab.com')).toBe(false)
    expect(canFill(login('https://dev.tienda.com'), 'tienda.com')).toBe(false)
    expect(canFill(login('https://tienda.com'), 'dev.tienda.com')).toBe(false)
  })

  it('does not offer it with no site open, nor with nothing to fill', () => {
    expect(canFill(login('https://github.com'), null)).toBe(false)
    expect(canFill(login('https://github.com', ''), 'github.com')).toBe(false)
  })

  it('asks the page for the entry host, not the tab one', () => {
    expect(fillHostOf(login('https://www.github.com/login'))).toBe('github.com')
  })
})
