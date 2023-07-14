from datetime import date
from django.template.defaulttags import register

@register.filter(name="amount")
def amount_filter(value: int) -> str:
    value = value / 100.0
    return f'{value:.2f}'

def parse_amount(amount: str) -> int:
    multiplier = 1
    if amount.startswith('-'):
        multiplier = -1
        amount = amount[1:]
    parts = amount.split('.')
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
