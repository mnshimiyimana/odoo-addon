#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3000}

echo "Authenticate (replace login/apiKey/db):"
curl -s -X POST "$BASE_URL/api/auth" \
  -H 'Content-Type: application/json' \
  -d '{"login":"user@example.com","apiKey":"YOUR_API_KEY","db":"your_db_name"}'

echo

echo "Use returned sessionToken in X-Session-Token header for the next calls."

echo "Lookup leads (replace sender and token):"
# curl -s -X POST "$BASE_URL/api/leads" -H 'Content-Type: application/json' -H 'X-Session-Token: YOUR_SESSION_TOKEN' -d '{"sender":"sender@example.com"}'

echo "Update lead stage (replace id, stage_id, token):"
# curl -s -X POST "$BASE_URL/api/leads/123/stage" -H 'Content-Type: application/json' -H 'X-Session-Token: YOUR_SESSION_TOKEN' -d '{"stage_id":5,"note":"Test note from script"}'
