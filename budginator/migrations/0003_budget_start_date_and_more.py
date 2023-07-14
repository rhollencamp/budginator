# Generated by Django 4.1.7 on 2023-03-10 19:27

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('budginator', '0002_alter_budget_icon'),
    ]

    operations = [
        migrations.AddField(
            model_name='budget',
            name='start_date',
            field=models.DateField(default='2023-01-01'),
        ),
        migrations.AlterField(
            model_name='trackedtransactionsplit',
            name='transaction',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='splits', to='budginator.trackedtransaction'),
        ),
    ]
