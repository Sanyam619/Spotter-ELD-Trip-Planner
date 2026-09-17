from rest_framework import serializers

from .hos import CYCLE_LIMIT_HOURS


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField(max_length=200)
    pickup_location = serializers.CharField(max_length=200)
    dropoff_location = serializers.CharField(max_length=200)
    current_cycle_used = serializers.FloatField(min_value=0, max_value=CYCLE_LIMIT_HOURS)
    start_time = serializers.DateTimeField(required=False, allow_null=True)

    def validate_start_time(self, value):
        # The HOS engine and the log grid both work in home-terminal wall-clock time.
        return value.replace(tzinfo=None) if value is not None else None
