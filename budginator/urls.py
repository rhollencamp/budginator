from django.urls import path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('transactions', views.list_transactions),
    path('transactions/track', views.track, name='track')
]
