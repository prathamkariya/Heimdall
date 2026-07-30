#!/bin/bash
# Load Testing Script using wrk
# Target: 10,000+ ticks/sec
# Usage: ./load_test.sh <endpoint_url> <jwt_token>

ENDPOINT=${1:-"http://localhost:8000/api/v1/market-data"}
TOKEN=$2

if [ -z "$TOKEN" ]; then
  echo "Usage: ./load_test.sh <endpoint_url> <jwt_token>"
  echo "Warning: Running without token might result in 401 Unauthorized"
fi

echo "Starting load test on $ENDPOINT"
echo "Targeting 10,000+ requests/sec"

# 12 threads, 400 concurrent connections, 30s duration
wrk -t12 -c400 -d30s \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -s post_market_data.lua \
  $ENDPOINT
