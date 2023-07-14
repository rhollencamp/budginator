from datetime import date
from django.test import TestCase

from . import calculate_num_months, parse_amount

# Create your tests here.
class BudginatorTests(TestCase):
    def test_parse_amount(self):
        self.assertEqual(100, parse_amount("1.00"))
        self.assertEqual(123, parse_amount("1.23"))
        self.assertEqual(-55, parse_amount("-0.55"))

    def test_num_months(self):
        self.assertEqual(1, calculate_num_months(date(2023, 1, 1), date(2023, 1, 10)))
        self.assertEqual(2, calculate_num_months(date(2023, 1, 1), date(2023, 2, 1)))
        self.assertEqual(2, calculate_num_months(date(2022, 12, 30), date(2023, 1, 1)))
