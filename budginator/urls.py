from django.urls import path

from . import views

urlpatterns = [
    path('', views.index),
    path('transactions', views.list_transactions),
    path('transactions/edit', views.edit_transaction),
    path('transactions/track', views.track)
]
