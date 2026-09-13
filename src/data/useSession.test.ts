import { describe, expect, it } from 'vitest'
import { signInRedirectUrl } from './useSession'

describe('signInRedirectUrl', () => {
  it('is the project directory when served from a subpath', () => {
    expect(signInRedirectUrl('https://rhollencamp.github.io/budginator/')).toBe(
      'https://rhollencamp.github.io/budginator/',
    )
  })

  it('keeps the subpath when landing on a file inside it', () => {
    expect(
      signInRedirectUrl('https://rhollencamp.github.io/budginator/index.html'),
    ).toBe('https://rhollencamp.github.io/budginator/')
  })

  it('is the root when served from a domain root', () => {
    expect(signInRedirectUrl('https://budget.example.com/')).toBe(
      'https://budget.example.com/',
    )
  })

  it('works against the dev server', () => {
    expect(signInRedirectUrl('http://localhost:5173/')).toBe(
      'http://localhost:5173/',
    )
  })

  it('drops the query a spent magic link arrived with', () => {
    expect(
      signInRedirectUrl(
        'https://rhollencamp.github.io/budginator/?code=abc123',
      ),
    ).toBe('https://rhollencamp.github.io/budginator/')
  })

  it('never produces the malformed origin+BASE_URL form', () => {
    // The bug this replaces: `origin + './'` gave `https://host./`.
    expect(
      signInRedirectUrl('https://rhollencamp.github.io/budginator/'),
    ).not.toContain('./')
  })
})
