from django.http import HttpResponseRedirect, HttpRequest
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_GET

from .models import Budget, TrackedTransaction, TrackedTransactionSplit


@require_GET
def index(request: HttpRequest):
    context = {
        'budgets': Budget.objects.order_by('name')
    }
    return render(request, 'budginator/index.html', context)


@require_GET
def list_transactions(request: HttpRequest):
    context = {
        'transactions': TrackedTransaction.objects.order_by('-date')
    }
    return render(request, 'budginator/transactions.html', context)


@csrf_exempt # TODO fix csrf
@require_http_methods(['GET', 'POST'])
def track(request: HttpRequest):
    if request.method == 'GET':
        context = {
            'budgets': Budget.objects.order_by('name')
        }
        return render(request, 'budginator/track.html', context)
    else:
        budget = get_object_or_404(Budget, pk=request.POST['budget'])
        transaction = TrackedTransaction.objects.create(
            amount=int(request.POST['amount']) * int(request.POST['multiplier']),
            date=request.POST['date'],
            merchant=request.POST['merchant']
        )

        TrackedTransactionSplit.objects.create(
            amount=int(request.POST['amount']) * int(request.POST['multiplier']),
            budget=budget,
            note=request.POST['note'],
            transaction=transaction
        )

        return HttpResponseRedirect('/transactions?budget=' + budget.name)
