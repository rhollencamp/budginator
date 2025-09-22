from django.contrib import admin

from .models import AutoLinkExpression, BankAccount, Budget, ImportedTransaction, TrackedTransaction

admin.site.register(AutoLinkExpression,
                    list_display=['expression', 'budget'],
                    ordering=['expression'])
admin.site.register(BankAccount, list_display=['name'], ordering=['name'])
admin.site.register(Budget, list_display=['name', 'amount'], ordering=['name'])
admin.site.register(ImportedTransaction,
                    list_display=['date', 'bank_account', 'merchant', 'amount'],
                    list_filter=['bank_account'],
                    ordering=['date'])
admin.site.register(TrackedTransaction, list_display=['date', 'merchant'], ordering=['date'])
