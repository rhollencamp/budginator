import { describe, expect, it } from 'vitest'
import { suggestAutoLinks } from './autoLink'
import type { AutoLinkExpression, ImportedTransaction } from './types'

function imported(
  id: string,
  merchant: string,
  transactionId: string | null = null,
): ImportedTransaction {
  return {
    id,
    bankAccountId: 'account',
    date: '2024-03-05',
    merchant,
    amountCents: -450,
    transactionId,
  }
}

const rule = (
  id: string,
  expression: string,
  budgetId: string,
): AutoLinkExpression => ({ id, expression, budgetId })

describe('suggestAutoLinks', () => {
  it('matches case-insensitively, anywhere in the merchant', () => {
    const { suggestions } = suggestAutoLinks(
      [imported('i1', 'SQ *costco #1234')],
      [rule('r1', 'COSTCO', 'groceries')],
    )

    expect(suggestions).toEqual([
      expect.objectContaining({ budgetId: 'groceries', expression: 'COSTCO' }),
    ])
  })

  it('lets the first matching expression win', () => {
    const { suggestions } = suggestAutoLinks(
      [imported('i1', 'COSTCO GAS')],
      [rule('r1', 'COSTCO GAS', 'fuel'), rule('r2', 'COSTCO', 'groceries')],
    )

    expect(suggestions[0].budgetId).toBe('fuel')
  })

  it('leaves an unmatched row alone', () => {
    const { suggestions } = suggestAutoLinks(
      [imported('i1', 'CORNER SHOP')],
      [rule('r1', 'COSTCO', 'groceries')],
    )

    expect(suggestions).toEqual([])
  })

  it('skips rows that are already linked', () => {
    const { suggestions } = suggestAutoLinks(
      [imported('i1', 'COSTCO', 't1')],
      [rule('r1', 'COSTCO', 'groceries')],
    )

    expect(suggestions).toEqual([])
  })

  it('reports a malformed expression and applies the rest', () => {
    const { suggestions, invalid } = suggestAutoLinks(
      [imported('i1', 'COSTCO')],
      [rule('bad', '*(', 'fuel'), rule('r1', 'COSTCO', 'groceries')],
    )

    expect(invalid).toHaveLength(1)
    expect(invalid[0].expression.id).toBe('bad')
    expect(suggestions[0].budgetId).toBe('groceries')
  })
})
