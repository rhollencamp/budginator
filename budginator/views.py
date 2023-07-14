from io import StringIO

from django.db.transaction import atomic
from django.http import HttpResponseRedirect, HttpRequest
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_GET

from . import models
from . import service


@require_GET
def index(request: HttpRequest):
    context = {
        'budgets': models.Budget.objects.order_by('name'),
        'available': service.calculate_budgets_available()
    }
    return render(request, 'budginator/index.html', context)


@require_GET
def list_transactions(request: HttpRequest):
    context = {
        'transactions': models.TrackedTransaction.objects.order_by('-date')
    }
    return render(request, 'budginator/transactions.html', context)


@csrf_exempt  # TODO fix csrf
@require_http_methods(['GET', 'POST'])
@atomic
def edit_transaction(request: HttpRequest):
    if request.method == 'GET':
        context = {
            'transaction': get_object_or_404(models.TrackedTransaction,
                                             pk=request.GET['transaction']),
            'budgets': models.Budget.objects.order_by('name')
        }
        return render(request, 'budginator/editTransaction.html', context)
    else:
        transaction = get_object_or_404(models.TrackedTransaction, pk=request.POST['transaction'])
        # todo don't update stuff if linked to an import
        transaction.amount = service.parse_amount(request.POST['amount'])
        transaction.date = request.POST['date']
        transaction.merchant = request.POST['merchant']
        transaction.save()

        # splits
        existing_splits = {x.id: x for x in transaction.splits.all()}

        for i, split_budget in enumerate(request.POST.getlist('splitBudget')):
            if split_budget:
                split = existing_splits.pop(int(split_budget), None)
                if not split:
                    budget = get_object_or_404(models.Budget, pk=split_budget)
                    split = models.TrackedTransactionSplit(budget=budget, transaction=transaction)
                split.amount = service.parse_amount(request.POST.getlist('splitAmount')[i])
                split.note = request.POST.getlist('splitNote')[i]
                split.save()
        # anything left in existing_splits can be deleted
        for split in existing_splits.values():
            split.delete()
        return HttpResponseRedirect(f'/transactions/edit?transaction={transaction.id}')


@csrf_exempt  # TODO fix csrf
@require_http_methods(['GET', 'POST'])
@atomic
def track(request: HttpRequest):
    if request.method == 'GET':
        context = {
            'budgets': models.Budget.objects.order_by('name')
        }
        return render(request, 'budginator/track.html', context)

    budget = get_object_or_404(models.Budget, pk=request.POST['budget'])
    transaction = models.TrackedTransaction.objects.create(
        amount=service.parse_amount(request.POST['amount']) * int(request.POST['multiplier']),
        date=request.POST['date'],
        merchant=request.POST['merchant']
    )

    models.TrackedTransactionSplit.objects.create(
        amount=service.parse_amount(request.POST['amount']) * int(request.POST['multiplier']),
        budget=budget,
        note=request.POST['note'],
        transaction=transaction
    )

    return HttpResponseRedirect('/transactions?budget=' + budget.name)


@csrf_exempt  # TODO fix csrf
@require_http_methods(['GET', 'POST'])
def import_transactions(request: HttpRequest):
    if request.method == 'GET':
        context = {
            'accounts': models.BankAccount.objects.all()
        }
        return render(request, 'budginator/importUpload.html', context)

    account = get_object_or_404(models.BankAccount, pk=request.POST['account'])
    data = request.FILES['file'].read().decode('utf-8')
    result = service.import_transactions(account, StringIO(data))
    return render(request, 'budginator/importSummary.html', result)


@require_GET
def linkable_transactions(request: HttpRequest):
    context = {
        'transactions': models.ImportedTransaction.objects.filter(transaction=None)
    }
    return render(request, 'budginator/listLinkable.html', context)