from django.http import HttpResponse
from django.shortcuts import render

from .models import Budget

def index(request):
    context = {
        'budgets': Budget.objects.order_by('name')
    }
    return render(request, 'budginator/index.html', context)
