from datetime import date, timedelta
from django.test import TestCase

from .models import BankAccount
from .models import Budget
from .models import ImportedTransaction
from .models import TrackedTransaction
from .models import TrackedTransactionSplit
from .service import calculate_budgets_available
from .service import calculate_num_months
from .service import import_transactions
from .service import parse_amount


class ServiceTests(TestCase):
    def test_parse_amount(self):
        self.assertEqual(100, parse_amount("1.00"))
        self.assertEqual(123, parse_amount("1.23"))
        self.assertEqual(-55, parse_amount("-0.55"))
        self.assertEqual(-2500, parse_amount("($25.00)"))

    def test_num_months(self):
        self.assertEqual(
            1, calculate_num_months(date(2023, 1, 1), date(2023, 1, 10)))
        self.assertEqual(
            2, calculate_num_months(date(2023, 1, 1), date(2023, 2, 1)))
        self.assertEqual(
            2, calculate_num_months(date(2022, 12, 30), date(2023, 1, 1)))

    def test_calculate_budgets_available(self):
        # create a budget starting last month
        start_date = date.today().replace(day=1) - timedelta(days=1)
        budget = Budget.objects.create(
            amount=30000,
            icon='X',
            name='Test',
            start_date=start_date
        )

        # we have no transactions, so should have two months of budget available
        budgets_available = calculate_budgets_available()
        self.assertEqual(60000, budgets_available['Test'])

        # track something and make sure it is reflected
        transaction = TrackedTransaction.objects.create(
            amount=-5000,
            date=date.today(),
            merchant='Test'
        )
        TrackedTransactionSplit.objects.create(
            amount=-5000,
            budget=budget,
            transaction=transaction
        )
        budgets_available = calculate_budgets_available()
        self.assertEqual(55000, budgets_available['Test'])

    def test_import(self):
        account = BankAccount.objects.create(
            name='Test',
            multiplier=1
        )

        test_input = [
            'Date,Description,Amount,Balance',
            '02/09/2023,"Withdrawl Merchant",($25.00),$9999.99',
            '02/12/2023,"Deposit Merchant",$10.00,$9999.99'
        ]
        import_transactions(account, test_input)

        transactions = ImportedTransaction.objects.all().order_by('date')
        self.assertEqual(2, len(transactions))

        self.assertEqual(date(2023, 2, 9), transactions[0].date)
        self.assertEqual(-2500, transactions[0].amount)
        self.assertEqual('Withdrawl Merchant', transactions[0].merchant)

        self.assertEqual(date(2023, 2, 12), transactions[1].date)
        self.assertEqual(1000, transactions[1].amount)
        self.assertEqual('Deposit Merchant', transactions[1].merchant)
