from django.urls import path

from . import views

urlpatterns = [
    path('', views.index),
    path('transactions', views.list_transactions),
    path('transactions/delete', views.delete_transaction),
    path('transactions/edit', views.edit_transaction),
    path('transactions/import', views.import_transactions),
    path('transactions/linkable', views.linkable_transactions),
    path('transactions/track', views.track)
]
