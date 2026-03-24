@echo off
setlocal

echo Checking out main...
git checkout main
if errorlevel 1 exit /b 1

echo Merging...
git merge develop
if errorlevel 1 exit /b 1

echo Pushing...
git push origin main
if errorlevel 1 exit /b 1

echo Done!
exit /b 0
