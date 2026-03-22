@echo off
setlocal

set "MSG=%~1"
if "%MSG%"=="" (
    set /p "MSG=Commit message: "
)

if "%MSG%"=="" (
    echo Error: Commit message required.
    exit /b 1
)

echo Checking out develop...
git checkout develop
if errorlevel 1 exit /b 1

echo Staging...
git add .
if errorlevel 1 exit /b 1

echo Committing: %MSG%
git commit -m "%MSG%"
if errorlevel 1 exit /b 1

echo Pushing...
git push origin develop
if errorlevel 1 exit /b 1

echo Done!
exit /b 0
