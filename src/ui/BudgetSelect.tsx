import { Select, type SelectProps } from '@mantine/core'
import type { Budget } from '../budget/types'

interface BudgetSelectProps extends Omit<SelectProps, 'data'> {
  budgets: readonly Budget[]
}

/**
 * Picks a budget. Deliberately never pre-selects one: the Django app defaulted
 * to the first budget alphabetically, and a form that arrives already holding
 * an answer is one where the wrong answer gets submitted by reflex.
 */
export function BudgetSelect({ budgets, ...props }: BudgetSelectProps) {
  return (
    <Select
      label="Budget"
      placeholder="Pick a budget"
      searchable
      nothingFoundMessage="No budget by that name"
      data={budgets.map((budget) => ({
        value: budget.id,
        label: `${budget.icon} ${budget.name}`.trim(),
      }))}
      {...props}
    />
  )
}
