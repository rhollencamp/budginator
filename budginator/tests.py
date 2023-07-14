from datetime import date, timedelta
from django.test import TestCase

from .models import Budget
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
        Budget.objects.create(
            amount=30000,
            icon='X',
            name='Test',
            start_date=start_date
        )

        budgets_available = calculate_budgets_available()
        self.assertEqual(60000, budgets_available['Test'])
