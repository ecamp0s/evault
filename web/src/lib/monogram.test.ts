import { describe, expect, it } from 'vitest'
import { MONOGRAM_COLOURS, monogramOf } from './monogram'

describe('the monogram of a row', () => {
  it('takes the letter from the name, which is what is read beside it', () => {
    expect(monogramOf('GitHub', 'github.com').letter).toBe('G')
    expect(monogramOf('banco', 'bbva.es').letter).toBe('B')
  })

  it('skips what is not a letter or a digit', () => {
    expect(monogramOf('(trabajo) Slack', 'slack.com').letter).toBe('T')
    expect(monogramOf('  1Password', '1password.com').letter).toBe('1')
    expect(monogramOf('Ñandú', 'nandu.es').letter).toBe('Ñ')
  })

  it('falls back to the host, and to a question mark, when the name has no letter', () => {
    expect(monogramOf('—', 'github.com').letter).toBe('G')
    expect(monogramOf('', '').letter).toBe('?')
  })

  it('gives every entry of one host the same colour, whatever its name', () => {
    expect(monogramOf('GitHub personal', 'github.com').colour).toBe(monogramOf('Trabajo', 'GitHub.com').colour)
  })

  it('spreads hosts over the palette instead of piling them on one colour', () => {
    const hosts = ['github.com', 'google.com', 'amazon.es', 'bbva.es', 'netflix.com', 'shein.com', 'wordpress.com', 'apple.com', 'microsoft.com', 'paypal.com', 'spotify.com', 'renfe.com']
    const used = new Set(hosts.map((host) => monogramOf('x', host).colour))

    expect(used.size).toBeGreaterThanOrEqual(5)
    for (const colour of used) expect(MONOGRAM_COLOURS).toContain(colour)
  })
})
