from io import StringIO

from django.contrib.admin.views.decorators import staff_member_required
from django.db.transaction import atomic
from django.http import HttpResponseRedirect, HttpRequest
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_GET, require_POST

from . import models
from . import service


@require_GET
@staff_member_required
def index(request: HttpRequest):
    context = {
        'budgets': models.Budget.objects.order_by('name'),
        'available': service.calculate_budgets_available()
    }
    return render(request, 'budginator/index.html', context)


@require_GET
@staff_member_required
def list_transactions(request: HttpRequest):
    context = {
        'transactions': models.TrackedTransaction.objects.order_by('-date')
    }
    return render(request, 'budginator/transactions.html', context)


@staff_member_required
@require_POST
def delete_transaction(request: HttpRequest):
    transaction = get_object_or_404(models.TrackedTransaction, pk=request.POST['transaction'])
    transaction.delete()
    return HttpResponseRedirect('/')


@atomic
@csrf_exempt  # TODO fix csrf
@require_http_methods(['GET', 'POST'])
@staff_member_required
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


@atomic
@csrf_exempt  # TODO fix csrf
@require_http_methods(['GET', 'POST'])
@staff_member_required
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
@staff_member_required
def import_transactions(request: HttpRequest):
    if request.method == 'GET':
        context = {
            'accounts': models.BankAccount.objects.all()
        }
        return render(request, 'budginator/importUpload.html', context)

    account = get_object_or_404(models.BankAccount, pk=request.POST['account'])
    data = request.FILES['file'].read().decode('utf-8')
    result = service.import_transactions(account, StringIO(data))
    return render(request, 'budginator/importSummary.html', {'results': result})


@atomic
@csrf_exempt  # TODO fix csrf
@require_http_methods(['GET', 'POST'])
@staff_member_required
def linkable_transactions(request: HttpRequest):
    # viewing linkable page
    if request.method == 'GET':
        transactions = models.ImportedTransaction.objects.filter(transaction=None).order_by('-date')
        context = {
            'budgets': models.Budget.objects.all().order_by('name'),
            'suggestions': service.suggest_links(),
            'transactions':  transactions
        }
        return render(request, 'budginator/listLinkable.html', context)

    # performing a suggested link
    if request.POST['imported'] and request.POST['tracked']:
        imported = get_object_or_404(models.ImportedTransaction, pk=request.POST['imported'])
        tracked = get_object_or_404(models.TrackedTransaction, pk=request.POST['tracked'])
        imported.transaction = tracked
        imported.save()
        return HttpResponseRedirect('/transactions/linkable')

    # tracking an imported transaction
    imported = get_object_or_404(models.ImportedTransaction, pk=request.POST['transaction'])
    budget = get_object_or_404(models.Budget, pk=request.POST['budget'])

    tracked = models.TrackedTransaction.objects.create(
        amount=imported.amount,
        date=imported.date,
        merchant=imported.merchant
    )

    models.TrackedTransactionSplit.objects.create(
        amount=imported.amount,
        budget=budget,
        note=request.POST['note'],
        transaction=tracked
    )

    imported.transaction = tracked
    imported.save()

    return HttpResponseRedirect('/transactions/linkable')
