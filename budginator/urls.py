from django.urls import path

from . import views

urlpatterns = [
    path('', views.index),
    path('transactions', views.list_transactions),
    path('transactions/delete', views.delete_transaction),
    path('transactions/edit', views.edit_transaction),
    path('transactions/import', views.import_transactions),
    path('transactions/linkable', views.linkable_transactions),
    path('transactions/track', views.track),

    # favicon stuff
    path('android-chrome-192x192.png', views.favicon_file),
    path('android-chrome-512x512.png', views.favicon_file),
    path('apple-touch-icon.png', views.favicon_file),
    path('browserconfig.xml', views.favicon_file),
    path('favicon-16x16.png', views.favicon_file),
    path('favicon-32x32.png', views.favicon_file),
    path('favicon.ico', views.favicon_file),
    path('mstile-70x70.png', views.favicon_file),
    path('mstile-144x144.png', views.favicon_file),
    path('mstile-150x150.png', views.favicon_file),
    path('mstile-310x150.png', views.favicon_file),
    path('mstile-310x310.png', views.favicon_file),
    path('safari-pinned-tab.svg', views.favicon_file),
    path('site.webmanifest', views.favicon_file)
]
