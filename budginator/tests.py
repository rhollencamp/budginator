from django.test import TestCase

from . import parse_amount

# Create your tests here.
class BudginatorTests(TestCase):
    def test_parse_amount(self):
        self.assertEqual(100, parse_amount("1.00"))
        self.assertEqual(123, parse_amount("1.23"))
        self.assertEqual(-55, parse_amount("-0.55"))
