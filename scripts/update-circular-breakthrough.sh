#!/bin/bash

# 순환 돌파석 가치 수동 갱신 스크립트
# 사용법: ./scripts/update-circular-breakthrough.sh [서버URL]

# 서버 URL 설정 (기본값: http://localhost:3000)
SERVER_URL=${1:-"http://localhost:3000"}

echo "🔄 순환 돌파석 가치 갱신 시작..."
echo "   서버 URL: $SERVER_URL"

# 순환 돌파석 가치 업데이트
echo ""
echo "📦 순환 돌파석 가치 계산 및 업데이트 중..."

response=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  "$SERVER_URL/api/market/cache/update-circular-breakthrough")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo "✅ 순환 돌파석 가치 업데이트 완료"
  echo "$body" | jq -r '.circularBreakthroughValue // .message // "성공"' 2>/dev/null || echo "$body"
else
  echo "❌ 순환 돌파석 가치 업데이트 실패 (HTTP $http_code)"
  echo "$body"
fi

echo ""
echo "✅ 갱신 완료!"
echo ""
echo "📝 참고:"
echo "   - 순환 돌파석 가치는 market_cache에 저장됩니다"
echo "   - 가치계산DB는 이 값을 참조하여 표시합니다"
echo "   - Market 캐시 갱신 시 자동으로 함께 갱신됩니다 (30분마다)"



