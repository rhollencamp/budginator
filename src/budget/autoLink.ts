/**
 * Proposing a budget for an imported row from its merchant text.
 *
 * Most spending is repetitive: the same supermarket, the same subscription,
 * the same petrol station, month after month. An auto-link expression is a
 * regular expression over the merchant that says "anything matching this
 * belongs to this budget", which turns the bulk of an import from a decision
 * into a confirmation.
 *
 * Matching is case-insensitive and unanchored, so `COSTCO` catches
 * `SQ *COSTCO #123`. Expressions are tried in the order given and the first
 * match wins, so a specific rule placed before a general one takes precedence.
 * A malformed expression is reported rather than thrown: one bad rule must not
 * stop the other rules from being applied.
 */
import type { AutoLinkExpression, ImportedTransaction } from './types'

export interface AutoLinkSuggestion {
  imported: ImportedTransaction
  budgetId: string
  /** The expression that matched, for showing why this budget was proposed. */
  expression: string
}

export interface AutoLinkResult {
  suggestions: AutoLinkSuggestion[]
  /** Expressions that are not valid regular expressions, with the parse error. */
  invalid: { expression: AutoLinkExpression; message: string }[]
}

/** Compiles the expressions and matches them against the unlinked rows. */
export function suggestAutoLinks(
  imported: readonly ImportedTransaction[],
  expressions: readonly AutoLinkExpression[],
): AutoLinkResult {
  const compiled: { rule: AutoLinkExpression; pattern: RegExp }[] = []
  const invalid: AutoLinkResult['invalid'] = []

  for (const rule of expressions) {
    try {
      compiled.push({ rule, pattern: new RegExp(rule.expression, 'i') })
    } catch (error) {
      invalid.push({
        expression: rule,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const suggestions: AutoLinkSuggestion[] = []
  for (const row of imported) {
    if (row.transactionId !== null) continue

    const match = compiled.find(({ pattern }) => pattern.test(row.merchant))
    if (!match) continue

    suggestions.push({
      imported: row,
      budgetId: match.rule.budgetId,
      expression: match.rule.expression,
    })
  }

  return { suggestions, invalid }
}
