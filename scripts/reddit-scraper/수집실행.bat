@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Reddit 인사이트 원문 수집 (네 PC에서 직접)
echo ============================================
echo.
set /p TF=기간 입력 [day/week/month/year/all] (기본 year):
if "%TF%"=="" set TF=year
set /p LM=서브레딧당 가져올 개수 (기본 100):
if "%LM%"=="" set LM=100
echo.
echo  → %TF% 기준 상위 %LM%개 수집 시작...
echo.
node index.js --time %TF% --limit %LM%
echo.
echo ============================================
echo   완료. 어드민 "인사이트 DB"에서 확인하세요.
echo ============================================
pause
