import { describe, expect, it } from 'vitest'
import { formatAmount, formatAmountInput, parseAmount, sumCents } from './money'

describe('parseAmount', () => {
  it('reads whole dollars', () => {
    expect(parseAmount('12')).toBe(1200)
  })

  it('reads two fractional digits', () => {
    expect(parseAmount('12.34')).toBe(1234)
  })

  it('reads one fractional digit as tenths', () => {
    expect(parseAmount('1.5')).toBe(150)
  })

  it('reads a bare fractional part', () => {
    expect(parseAmount('.50')).toBe(50)
  })

  it('strips currency symbols, commas and spaces', () => {
    expect(parseAmount(' $1,234.56 ')).toBe(123456)
  })

  it('reads a leading minus as negative', () => {
    expect(parseAmount('-12.34')).toBe(-1234)
  })

  it('reads parentheses as negative', () => {
    expect(parseAmount('(12.34)')).toBe(-1234)
  })

  it('reads a leading plus as positive', () => {
    expect(parseAmount('+12.34')).toBe(1234)
  })

  it('rejects more than two fractional digits rather than rounding', () => {
    expect(parseAmount('1.005')).toBeNull()
  })

  it('rejects text, empty strings and a lone separator', () => {
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('   ')).toBeNull()
    expect(parseAmount('.')).toBeNull()
    expect(parseAmount('1.2.3')).toBeNull()
  })

  it('round-trips every cent value through formatAmountInput', () => {
    for (const cents of [0, 1, -1, 99, 100, -12345, 123456789]) {
      expect(parseAmount(formatAmountInput(cents))).toBe(cents)
    }
  })
})

describe('formatAmount', () => {
  it('groups thousands and always shows two digits of cents', () => {
    expect(formatAmount(123456)).toBe('$1,234.56')
    expect(formatAmount(5)).toBe('$0.05')
    expect(formatAmount(0)).toBe('$0.00')
  })

  it('leads a negative with the sign', () => {
    expect(formatAmount(-123456)).toBe('-$1,234.56')
    expect(formatAmount(-5)).toBe('-$0.05')
  })
})

describe('sumCents', () => {
  it('sums to an exact integer', () => {
    expect(sumCents([1, 2, 3])).toBe(6)
    expect(sumCents([])).toBe(0)
    expect(sumCents([-1000, 999])).toBe(-1)
  })
})
