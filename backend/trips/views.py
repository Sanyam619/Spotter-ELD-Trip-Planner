from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .routing import RoutingError, autocomplete
from .serializers import TripPlanRequestSerializer
from .services import build_trip_plan


class PlanTripView(APIView):
    def post(self, request):
        serializer = TripPlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            plan = build_trip_plan(**serializer.validated_data)
        except RoutingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(plan, status=status.HTTP_200_OK)


class LocationSearchView(APIView):
    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < 3:
            return Response({"results": []})

        try:
            places = autocomplete(query)
        except RoutingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "results": [
                    {"label": place.label, "coordinates": place.coordinates} for place in places
                ]
            }
        )


class HealthView(APIView):
    def get(self, request):
        return Response({"status": "ok"})
