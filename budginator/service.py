from csv import DictReader
from datetime import date
from datetime import datetime
from django.db.transaction import atomic

from . import models


def calculate_budgets_available() -> dict:
    result = {}

    splits = models.TrackedTransactionSplit.objects.all()

    for budget in models.Budget.objects.all():
        num_months = calculate_num_months(budget.start_date, date.today())
        amount = budget.amount * num_months

        for split in (x for x in splits if x.budget == budget):
            amount += split.amount
        result[budget.name] = amount
    return result


def parse_amount(amount: str) -> int:
    multiplier = 1
    amount = amount.replace('$', '')
    amount = amount.replace(',', '')
    if amount.startswith('-'):
        multiplier = -1
        amount = amount[1:]
    if amount.startswith('(') and amount.endswith(')'):
        multiplier = -1
        amount = amount[1:]
        amount = amount[:-1]
    parts = amount.split('.')
    if len(parts) == 1:
        parts = [amount, 0]
    if len(parts) != 2:
        return None
    result = int(parts[0]) * 100
    result += int(parts[1])
    result *= multiplier
    return result


def calculate_num_months(start: date, end: date) -> int:
    result = (end.year - start.year) * 12
    result += end.month - start.month
    result += 1
    return result


@atomic
def import_transactions(account: models.BankAccount, data):
    already_imported = models.ImportedTransaction.objects.filter(bank_account=account)

    result = {
        'imported': 0,
        'matched': 0,
        'error': []
    }

    # rows = [ DictReader(data))
    rows = [_parse_csv_row(x, account.multiplier) for x in DictReader(data)]

    while len(rows) > 0:
        row = rows.pop()

        # find number of records in db that look similar
        num_existing = sum(1 for it in already_imported
                           if it.date == row['date'] and it.amount == row['amount'])
        if num_existing == 0:
            models.ImportedTransaction.objects.create(
                amount=row['amount'],
                bank_account=account,
                date=row['date'],
                merchant=row['merchant']
            )
            result['imported'] += 1
        else:
            matching_rows = [x for x in rows
                             if x['date'] == row['date'] and x['amount'] == row['amount']]
            for x in matching_rows:
                rows.remove(x)
            matching_rows.append(row)

            if len(matching_rows) == num_existing:
                result['matched'] += num_existing
            else:
                result['error'].extend(matching_rows)

    return result


def _parse_csv_row(row: dict, multiplier: int) -> dict:
    # 'Amount'
    row_amount = row.get('Amount', None)
    if row_amount:
        row_amount = parse_amount(row_amount) * multiplier

    # 'Withdrawals'
    if not row_amount:
        row_amount = row.get('Withdrawals', None)
        if row_amount:
            row_amount = parse_amount(row_amount) * -1 * multiplier

    # 'Deposits'
    if not row_amount:
        row_amount = row.get('Deposits', None)
        if row_amount:
            row_amount = parse_amount(row_amount) * multiplier

    if not row_amount:
        raise ValueError('Could not parse an amount')

    row_date = datetime.strptime(row['Date'], '%m/%d/%Y').date()
    row_merchant = row['Description']

    return {
        'amount': row_amount,
        'date': row_date,
        'merchant': row_merchant
    }


def suggest_links():
    imported = models.ImportedTransaction.objects.filter(transaction=None)
    tracked = models.TrackedTransaction.objects.filter(imported=None)

    result = []
    for i in imported:
        for t in tracked:
            if i.amount == t.amount:
                result.append((i, t))

    return result
