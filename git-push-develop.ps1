# Git develop 브랜치 커밋 및 푸시 스크립트
# 사용법: .\git-push-develop.ps1 -m "커밋 메시지"
# 또는:   .\git-push-develop.ps1 "커밋 메시지"

param(
    [Parameter(Mandatory=$false, Position=0)]
    [string]$Message = "Update"
)

# 커밋 메시지가 전달되지 않았으면 입력 받기
if ($Message -eq "Update" -and $args.Count -eq 0) {
    $Message = Read-Host "커밋 메시지를 입력하세요"
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    Write-Host "오류: 커밋 메시지를 입력해주세요." -ForegroundColor Red
    exit 1
}

Write-Host "develop 브랜치로 전환 중..." -ForegroundColor Cyan
git checkout develop
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "변경사항 스테이징 중..." -ForegroundColor Cyan
git add .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "커밋 중: $Message" -ForegroundColor Cyan
git commit -m $Message
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "원격 저장소로 푸시 중..." -ForegroundColor Cyan
git push origin develop
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "완료!" -ForegroundColor Green
