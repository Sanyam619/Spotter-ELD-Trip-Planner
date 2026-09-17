from django.urls import path

from .views import HealthView, LocationSearchView, PlanTripView

urlpatterns = [
    path("trips/plan", PlanTripView.as_view(), name="plan-trip"),
    path("locations/search", LocationSearchView.as_view(), name="location-search"),
    path("health", HealthView.as_view(), name="health"),
]
