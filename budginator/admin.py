from django.contrib import admin

from .models import BankAccount, Budget

admin.site.register(BankAccount, list_display=['name'], ordering=['name'])
admin.site.register(Budget, list_display=['name', 'amount'], ordering=['name'])
