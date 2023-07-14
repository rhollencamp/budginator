from django.template.defaulttags import register


@register.filter
def amount(value: int) -> str:
    value = value / 100.0
    return f'{value:.2f}'
