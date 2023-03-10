from datetime import date, timedelta
from django.test import TestCase

from .models import Budget, TrackedTransaction, TrackedTransactionSplit
from .service import calculate_budgets_available, calculate_num_months, parse_amount


class ServiceTests(TestCase):
    def test_parse_amount(self):
        self.assertEqual(100, parse_amount("1.00"))
        self.assertEqual(123, parse_amount("1.23"))
        self.assertEqual(-55, parse_amount("-0.55"))

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
