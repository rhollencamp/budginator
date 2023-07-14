from datetime import date, timedelta
from django.test import TestCase

from .models import BankAccount
from .models import Budget
from .models import ImportedTransaction
from .models import TrackedTransaction
from .models import TrackedTransactionSplit
from . import service


class ServiceTests(TestCase):
    def test_parse_amount(self):
        self.assertEqual(100, service.parse_amount("1.00"))
        self.assertEqual(123, service.parse_amount("1.23"))
        self.assertEqual(-55, service.parse_amount("-0.55"))
        self.assertEqual(-2500, service.parse_amount("($25.00)"))

    def test_num_months(self):
        self.assertEqual(
            1, service.calculate_num_months(date(2023, 1, 1), date(2023, 1, 10)))
        self.assertEqual(
            2, service.calculate_num_months(date(2023, 1, 1), date(2023, 2, 1)))
        self.assertEqual(
            2, service.calculate_num_months(date(2022, 12, 30), date(2023, 1, 1)))

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
        budgets_available = service.calculate_budgets_available()
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
        budgets_available = service.calculate_budgets_available()
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
        service.import_transactions(account, test_input)

        transactions = ImportedTransaction.objects.all().order_by('date')
        self.assertEqual(2, len(transactions))

        self.assertEqual(date(2023, 2, 9), transactions[0].date)
        self.assertEqual(-2500, transactions[0].amount)
        self.assertEqual('Withdrawl Merchant', transactions[0].merchant)

        self.assertEqual(date(2023, 2, 12), transactions[1].date)
        self.assertEqual(1000, transactions[1].amount)
        self.assertEqual('Deposit Merchant', transactions[1].merchant)

    def test_import_withdrawls_deposits(self):
        account = BankAccount.objects.create(
            name='Test',
            multiplier=1
        )

        test_input = [
            'Date,Description,Withdrawals,Deposits,Category,Balance',
            '"03/05/2023","APPLE.COM/BILL 866-712-7753 CA","$18.98","","Electronics"',
            '"03/04/2023","AMZN Mktp US Amzn.com/bill WA","","$21.24","Education"'
        ]
        result = service.import_transactions(account, test_input)
        self.assertEqual(2, result['imported'])

        transactions = ImportedTransaction.objects.all().order_by('date')

        self.assertEqual(date(2023, 3, 4), transactions[0].date)
        self.assertEqual('AMZN Mktp US Amzn.com/bill WA', transactions[0].merchant)
        self.assertEqual(2124, transactions[0].amount)

        self.assertEqual(date(2023, 3, 5), transactions[1].date)
        self.assertEqual('APPLE.COM/BILL 866-712-7753 CA', transactions[1].merchant)
        self.assertEqual(-1898, transactions[1].amount)


    def test_import_dedupe(self):
        account = BankAccount.objects.create(
            name='Test',
            multiplier=1
        )

        test_input = [
            'Date,Description,Amount,Balance',
            '02/09/2023,"Withdrawl Merchant",($25.00),$9999.99',
            '02/12/2023,"Deposit Merchant",$10.00,$9999.99'
        ]
        service.import_transactions(account, test_input)
        result = service.import_transactions(account, test_input)

        transactions = ImportedTransaction.objects.all()
        self.assertEqual(2, len(transactions))

        self.assertEqual(0, result['imported'])
        self.assertEqual(2, result['matched'])

    def test_import_mismatch(self):
        account = BankAccount.objects.create(
            name='Test',
            multiplier=1
        )

        test_input = [
            'Date,Description,Amount,Balance',
            '02/09/2023,"Withdrawl Merchant",($25.00),$9999.99',
            '02/12/2023,"Deposit Merchant",$10.00,$9999.99'
        ]
        service.import_transactions(account, test_input)
        test_input.append('02/12/2023,"Deposit Merchant",$10.00,$9999.99')
        result = service.import_transactions(account, test_input)

        self.assertEqual(0, result['imported'])
        self.assertEqual(1, result['matched'])
        self.assertEqual(2, len(result['error']))

    def test_suggest_links(self):
        account = BankAccount.objects.create(
            name='Test',
            multiplier=1
        )
        budget = Budget.objects.create(
            amount=30000,
            icon='X',
            name='Test',
            start_date=date.today()
        )

        ImportedTransaction.objects.create(
            amount=500,
            bank_account=account,
            date=date.today(),
            merchant='test merchant'
        )

        tracked = TrackedTransaction.objects.create(
            amount=500,
            date=date.today(),
            merchant='test merchant'
        )
        TrackedTransactionSplit.objects.create(
            amount=500,
            budget=budget,
            transaction=tracked
        )

        suggested_links = service.suggest_links()
        self.assertEqual(1, len(suggested_links))
        self.assertEqual('test merchant', suggested_links[0][0].merchant)
        self.assertEqual('test merchant', suggested_links[0][1].merchant)
