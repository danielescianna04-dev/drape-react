from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("about/", views.about, name="about"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("api/items/", views.api_items, name="api_items"),
    path("api/items/<int:item_id>/", views.api_item_detail, name="api_item_detail"),
]
