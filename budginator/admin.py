from django.contrib import admin

from .models import BankAccount, Budget

admin.site.register([BankAccount, Budget])
