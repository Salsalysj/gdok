# 순환 돌파석 가치 수동 갱신 스크립트 (PowerShell)
# 사용법: .\scripts\update-circular-breakthrough.ps1 [서버URL]

param(
    [string]$ServerUrl = "http://localhost:3000"
)

Write-Host "🔄 순환 돌파석 가치 갱신 시작..." -ForegroundColor Cyan
Write-Host "   서버 URL: $ServerUrl" -ForegroundColor Gray

# 순환 돌파석 가치 업데이트
Write-Host ""
Write-Host "📦 순환 돌파석 가치 계산 및 업데이트 중..." -ForegroundColor Yellow

$headers = @{
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-WebRequest -Uri "$ServerUrl/api/market/cache/update-circular-breakthrough" -Method POST -Headers $headers -UseBasicParsing
    $httpCode = $response.StatusCode
    $body = $response.Content
} catch {
    $httpCode = $_.Exception.Response.StatusCode.value__
    $body = $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        $reader.Close()
    }
}

if ($httpCode -eq 200) {
    Write-Host "✅ 순환 돌파석 가치 업데이트 완료" -ForegroundColor Green
    try {
        $json = $body | ConvertFrom-Json
        if ($json.circularBreakthroughValue) {
            Write-Host "   순환 돌파석 가치: $($json.circularBreakthroughValue)" -ForegroundColor Gray
        } elseif ($json.message) {
            Write-Host "   $($json.message)" -ForegroundColor Gray
        }
    } catch {
        Write-Host $body -ForegroundColor Gray
    }
} else {
    Write-Host "❌ 순환 돌파석 가치 업데이트 실패 (HTTP $httpCode)" -ForegroundColor Red
    Write-Host $body -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ 갱신 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 참고:" -ForegroundColor Cyan
Write-Host "   - 순환 돌파석 가치는 market_cache에 저장됩니다" -ForegroundColor Gray
Write-Host "   - 가치계산DB는 이 값을 참조하여 표시합니다" -ForegroundColor Gray
Write-Host "   - Market 캐시 갱신 시 자동으로 함께 갱신됩니다 (30분마다)" -ForegroundColor Gray

