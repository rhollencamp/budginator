from django.db import models


class Budget(models.Model):
    # id
    amount = models.PositiveIntegerField()
    icon = models.CharField(max_length=4)
    name = models.CharField(max_length=128)

    def __str__(self):
        return self.name


class TrackedTransaction(models.Model):
    # id
    # fk importedtransaction
    amount = models.IntegerField()
    date = models.DateField()
    merchant = models.CharField(max_length=255)


class TrackedTransactionSplit(models.Model):
    # id
    amount = models.IntegerField()
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE)
    note = models.CharField(max_length=255)
    transaction = models.ForeignKey(TrackedTransaction, on_delete=models.CASCADE)
