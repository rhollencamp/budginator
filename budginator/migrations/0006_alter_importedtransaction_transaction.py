# Generated by Django 4.1.7 on 2023-03-11 16:39

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('budginator', '0005_alter_bankaccount_multiplier'),
    ]

    operations = [
        migrations.AlterField(
            model_name='importedtransaction',
            name='transaction',
            field=models.OneToOneField(null=True, on_delete=django.db.models.deletion.SET_NULL, to='budginator.trackedtransaction'),
        ),
    ]
