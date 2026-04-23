#!/bin/bash
# FIRESTORE CONNECTIVITY TEST
# Run this AFTER deployment to verify the new key works

echo "🧪 Firestore Connectivity Test"
echo "=============================="
echo ""

# Get Railway URL (you need to provide this)
if [ -z "$RAILWAY_URL" ]; then
  echo "Please set RAILWAY_URL environment variable:"
  echo "export RAILWAY_URL=https://your-railway-app-url.railway.app"
  exit 1
fi

HEALTH_URL="$RAILWAY_URL/health"

echo "Testing endpoint: $HEALTH_URL"
echo ""

# Make request with verbose output
RESPONSE=$(curl -s -w "\n%{http_code}" "$HEALTH_URL")

# Split response and status code
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "HTTP Status: $HTTP_CODE"
echo "Response Body:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✅ SUCCESS: Health check passed!"
  echo "Firestore is connected and working."
  
  # Check if database is healthy
  if echo "$BODY" | jq -e '.checks.database.status == "healthy"' > /dev/null 2>&1; then
    echo "✅ Database status: HEALTHY"
  else
    echo "⚠️  Database status: UNKNOWN (check logs)"
  fi
else
  echo "❌ FAILED: Health check returned HTTP $HTTP_CODE"
  echo ""
  echo "Common causes:"
  echo "1. Wrong RAILWAY_URL (check Railway dashboard)"
  echo "2. App not deployed yet (check deployment status)"
  echo "3. Firebase credentials not set (check Railway variables)"
  exit 1
fi

echo ""
echo "Next: Test an authenticated endpoint"
echo "curl -H 'Authorization: Bearer YOUR_ID_TOKEN' $RAILWAY_URL/api/v1/auth/me"
