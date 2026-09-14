# How the budgeting works

## Envelopes, not monthly resets

Each budget is an envelope with a monthly allowance and a start date. On the
first of every month from `start_date` onwards it is topped up by
`amount_cents`, and **the balance carries forward** — an under-spent month funds
a heavy one later. That carry-over is the whole point of budgeting this way; a
budget that resets to zero each month cannot answer "I skipped eating out in
January, can I afford a big dinner in March".

So "available" is the full history, not this month's figure:

```
available = amount × months elapsed since start + every split ever charged
```

Splits carry the sign — spending is negative, income and refunds positive — so
that sum is a plain addition. `summarizeBudgets` in `src/budget/budgets.ts` is
the implementation, and it is a pure function of its inputs including the
as-of date, which is why it can be tested without stubbing a clock.

A budget with a zero allowance is a label rather than an envelope: it groups
spending and reports the total, and the dashboard shows what has gone through it
instead of a meaningless "available".

## Splits

A transaction holds the amount the bank moved. Its splits say where that money
went, one per budget. They must sum to the transaction's amount exactly — the
editor refuses to save otherwise, and `save_transaction` refuses again in the
database. The remainder is computed in integer cents, so there is no tolerance
to tune and "close enough" never arises.

Back-dated splits are kept rather than dropped. A split dated before its budget
started appears in a month with a zero allowance, so it still counts against the
total; the Django version logged a `KeyError` and lost it.

## The import pipeline

Money reaches a budget by two routes, and the app's job is to keep them from
double-counting.

1. **Entered by hand**, at the shop. One budget, one amount.
2. **Imported from the bank**, days later, as a CSV.

Imported rows land in an unlinked queue. A row leaves it in one of three ways:

- **Linked to an existing transaction** — the same purchase, already typed in.
  Suggestions are matched on exact amount and a date within five days, assigned
  nearest-pair-first so a run of identical subscriptions does not all point at
  the same charge.
- **Budgeted directly** — it was not entered by hand, so picking a budget turns
  it into a transaction. Choices are collected and applied together: pick
  budgets against as many waiting rows as you like, and one button commits them
  in a single call, so the queue changes shape once rather than under each tap.
  Deleting a bank row outright is not offered here — that is a correction, and
  it lives on Setup → Imported with the others.
- **Auto-linked** — a merchant rule proposes a budget, and a page of them is
  confirmed at once.

### De-duplication

Bank exports overlap: the easy way to get this month is to download ninety days
again. There is no stable identifier to match on — the same statement
re-exported can spell the merchant differently — so rows are matched on the pair
banks do keep stable, **date and amount**.

That pair is not unique: two $4.50 coffees on one Tuesday are two real
transactions. So matching is per group, not per row. For each (date, amount) the
file says how many happened and the database says how many are recorded, and the
difference is imported. Three in the file against two recorded means one new
coffee — where the Django version rejected all three as unresolvable.

The reverse imbalance — more recorded than the file reports — is the one a human
should look at, so it is surfaced as a conflict and nothing is imported for it.

Nothing is written until the preview has been seen.

### Correcting a link

Links are a judgement, so they can be wrong, and **Setup → Imported** is where
that is undone. It lists every imported row rather than only the waiting ones,
filtered by account and by whether it is linked, and offers three corrections:

- **Unlink** — "these were not the same event after all". The transaction and
  the budget it was charged to are left exactly as they were; the bank row
  returns to the queue.
- **Edit** — the row as the bank wrote it: account, date, merchant, amount. For
  a statement imported against the wrong account, or a date the reader misread.
  Editing a linked row's date or amount will make it disagree with its
  transaction, and the form says so, because which of the two is wrong is not
  something the app can know.
- **Delete** — removes the bank's copy only. Anything budgeted from it stays,
  and the next import of that statement will offer the row again.

Deleting the _transaction_ instead is the other route: the foreign key is
`on delete set null`, so its bank row returns to the queue by itself.
