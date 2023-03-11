from csv import DictReader
from datetime import date
from datetime import datetime
from django.db.transaction import atomic

from .models import BankAccount
from .models import Budget
from .models import ImportedTransaction
from .models import TrackedTransactionSplit


def calculate_budgets_available() -> dict:
    result = {}

    splits = TrackedTransactionSplit.objects.all()

    for budget in Budget.objects.all():
        num_months = calculate_num_months(budget.start_date, date.today())
        amount = budget.amount * num_months

        for split in (x for x in splits if x.budget == budget):
            amount += split.amount
        result[budget.name] = amount
    return result


def parse_amount(amount: str) -> int:
    multiplier = 1
    amount = amount.replace('$', '')
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
def import_transactions(account: BankAccount, data):
    already_imported = ImportedTransaction.objects.filter(bank_account=account)

    reader = DictReader(data)
    for row in reader:
        row_amount = parse_amount(row['Amount']) * account.multiplier
        row_date = datetime.strptime(row['Date'], '%m/%d/%Y').date()
        row_merchant = row['Description']

        found = False
        for imported_transaction in already_imported:
            if imported_transaction.date == row_date and imported_transaction.amount == row_amount:
                found = True
                break
        if found:
            continue

        ImportedTransaction.objects.create(
            amount=row_amount,
            bank_account=account,
            date=row_date,
            merchant=row_merchant
        )

    return {}
