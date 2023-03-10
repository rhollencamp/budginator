from django.db import models


class BankAccount(models.Model):
    name = models.CharField(max_length=255)
    multiplier = models.IntegerField(
        choices=[(-1, 'Debits'), (1, 'Credits')],
        verbose_name="Positive Numbers Are")
    
    def __str__(self):
        return f"{self.name}"


class Budget(models.Model):
    amount = models.PositiveIntegerField()
    icon = models.CharField(max_length=4)
    name = models.CharField(max_length=128)
    start_date = models.DateField(default='2023-01-01')

    def __str__(self):
        return f"{self.name}"


class TrackedTransaction(models.Model):
    amount = models.IntegerField()
    date = models.DateField()
    merchant = models.CharField(max_length=255)


class TrackedTransactionSplit(models.Model):
    amount = models.IntegerField()
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE)
    note = models.CharField(max_length=255)
    transaction = models.ForeignKey(TrackedTransaction,
                                    on_delete=models.CASCADE,
                                    related_name='splits')


class ImportedTransaction(models.Model):
    amount = models.IntegerField()
    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE)
    date = models.DateField()
    merchant = models.CharField(max_length=255)
    transaction = models.ForeignKey(
        TrackedTransaction, null=True, on_delete=models.SET_NULL)
