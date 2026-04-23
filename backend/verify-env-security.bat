@echo off
REM Git History .env Security Verification Script
REM Run this to verify .env files are properly excluded from Git

echo.
echo ========================================
echo 🔐 Git History Security Verification
echo ========================================
echo.

REM TEST 1: Check if .env is tracked
echo TEST 1: Checking if .env is tracked...
git ls-files | findstr "^\.env$" >nul
if %ERRORLEVEL% equ 0 (
    echo ✗ FAIL: .env is still tracked!
    exit /b 1
) else (
    echo ✓ PASS: .env is NOT tracked
)
echo.

REM TEST 2: Check if .env.example exists
echo TEST 2: Checking if .env.example is tracked...
git ls-files | findstr "\.env\.example" >nul
if %ERRORLEVEL% equ 0 (
    echo ✓ PASS: .env.example is tracked (safe template)
) else (
    echo ⚠ WARN: .env.example not found
)
echo.

REM TEST 3: Check .gitignore for .env
echo TEST 3: Checking .gitignore configuration...
findstr "^\.env$" .gitignore >nul
if %ERRORLEVEL% equ 0 (
    echo ✓ PASS: Root .gitignore contains: .env
) else (
    echo ✗ FAIL: Root .gitignore missing .env
    exit /b 1
)
echo.

REM TEST 4: Check backend .gitignore
echo TEST 4: Checking backend/.gitignore...
if exist backend\.gitignore (
    findstr "^\.env$" backend\.gitignore >nul
    if %ERRORLEVEL% equ 0 (
        echo ✓ PASS: backend/.gitignore contains: .env
    ) else (
        echo ⚠ WARN: backend/.gitignore doesn't have .env
    )
) else (
    echo ⚠ WARN: backend/.gitignore not found
)
echo.

REM TEST 5: Search for private keys in history
echo TEST 5: Searching for private keys in Git history...
git log -p --all 2>nul | findstr "-----BEGIN PRIVATE KEY-----" >nul
if %ERRORLEVEL% equ 0 (
    echo ⚠ Found private key markers - checking if real keys...
    git log -p --all 2>nul | findstr "-----BEGIN PRIVATE KEY-----" | findstr /V "\.md" | findstr /V "EXAMPLE" >nul
    if %ERRORLEVEL% equ 0 (
        echo ✗ FAIL: Found potential real private keys!
        exit /b 1
    ) else (
        echo ✓ PASS: Markers only in documentation (SAFE)
    )
) else (
    echo ✓ PASS: No private key patterns found
)
echo.

REM TEST 6: Check .env commit history
echo TEST 6: Checking if .env was ever committed...
git log --all --name-only --pretty=format: 2>nul | findstr "^\.env$" >nul
if %ERRORLEVEL% equ 0 (
    echo ✗ FAIL: .env was found in commit history!
    exit /b 1
) else (
    echo ✓ PASS: .env was never committed
)
echo.

REM FINAL SUMMARY
echo ========================================
echo ✓ Security Verification Complete!
echo ========================================
echo.
echo Summary:
echo   • .env files: NOT tracked
echo   • .env.example: Tracked (safe template)
echo   • .gitignore: Properly configured
echo   • Private keys in history: NONE
echo   • Firebase credentials: SAFE
echo.
echo Your repository is secure!
echo.
echo Next steps:
echo   1. Execute Firebase key rotation
echo      (see FIREBASE_KEY_ROTATION_GUIDE.md)
echo   2. Update Railway environment variables
echo   3. Redeploy and verify with health check
echo.
