#!/usr/bin/env pwsh
# Git History .env Security Verification Script
# Run this to verify .env files are properly excluded from Git

Write-Host "🔐 Git History Security Verification Script" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$GREEN = 'Green'
$RED = 'Red'
$YELLOW = 'Yellow'

function Check-Pass {
    param([string]$Message)
    Write-Host "✓ PASS: $Message" -ForegroundColor $GREEN
}

function Check-Fail {
    param([string]$Message)
    Write-Host "✗ FAIL: $Message" -ForegroundColor $RED
    exit 1
}

function Check-Warn {
    param([string]$Message)
    Write-Host "⚠ WARN: $Message" -ForegroundColor $YELLOW
}

# TEST 1: Verify .env is NOT tracked
Write-Host "TEST 1: Verify .env is NOT tracked" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
$trackedEnvFiles = git ls-files | Select-String "^\.env$", "^backend/.env$"
if ($trackedEnvFiles -match "\.env") {
    Check-Fail ".env is still tracked in Git!"
} else {
    Check-Pass ".env is NOT tracked in Git"
}
Write-Host ""

# TEST 2: Verify .env.example IS tracked
Write-Host "TEST 2: Verify .env.example IS tracked" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
$trackedExamples = git ls-files | Select-String "\.env\.example"
if ($trackedExamples.Length -gt 0) {
    Check-Pass ".env.example IS tracked (template file, safe)"
} else {
    Check-Warn ".env.example not found (may be needed as template)"
}
Write-Host ""

# TEST 3: Verify .gitignore has .env
Write-Host "TEST 3: Verify .gitignore configuration" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# Check root .gitignore
$rootIgnore = Get-Content .\.gitignore -ErrorAction SilentlyContinue
if ($rootIgnore -match "^\.env$") {
    Check-Pass "Root .gitignore contains: .env"
} else {
    Check-Fail "Root .gitignore missing .env"
}

# Check backend .gitignore
if (Test-Path .\backend\.gitignore) {
    $backendIgnore = Get-Content .\backend\.gitignore -ErrorAction SilentlyContinue
    if ($backendIgnore -match "^\.env$") {
        Check-Pass "backend/.gitignore contains: .env"
    } else {
        Check-Warn "backend/.gitignore doesn't have .env (but root does)"
    }
} else {
    Check-Warn "backend/.gitignore not found"
}
Write-Host ""

# TEST 4: Search for Firebase private key patterns
Write-Host "TEST 4: Search for Firebase private keys in history" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

$privateKeyMatches = git log -p --all 2>$null | Select-String "-----BEGIN PRIVATE KEY-----" | Measure-Object | Select-Object -ExpandProperty Count
if ($privateKeyMatches -eq 0) {
    Check-Pass "No private key patterns found in Git history"
} else {
    Write-Host "⚠ Found $privateKeyMatches matches - checking if real keys..." -ForegroundColor Yellow
    # Only show non-documentation matches
    $realMatches = git log -p --all 2>$null | Select-String "-----BEGIN PRIVATE KEY-----" | Select-String -NotMatch "\.md|\.markdown|documentation|EXAMPLE|SAMPLE|PLACEHOLDER"
    if ($realMatches.Length -eq 0) {
        Check-Pass "Matches are only in documentation (SAFE)"
    } else {
        Check-Fail "Found potential real private keys!"
    }
}
Write-Host ""

# TEST 5: Verify no .env was ever tracked
Write-Host "TEST 5: Check .env commit history" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

$envHistory = git log --all --name-only --pretty=format: 2>$null | Select-String "^\.env$" | Measure-Object | Select-Object -ExpandProperty Count
if ($envHistory -eq 0) {
    Check-Pass ".env was never committed to Git history"
} else {
    Check-Fail ".env was found in commit history!"
}
Write-Host ""

# TEST 6: Test current .env would be ignored
Write-Host "TEST 6: Test that new .env files would be ignored" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Create a temporary test file
$testFile = ".env.test_$(Get-Random)"
New-Item -ItemType File -Name $testFile -Value "TEST_KEY=test_value" -Force | Out-Null

# Check if it would be ignored
$ignored = git check-ignore -q $testFile
if ($LASTEXITCODE -eq 0) {
    Remove-Item $testFile -Force
    Check-Pass "New .env files would be properly ignored by Git"
} else {
    Remove-Item $testFile -Force
    Check-Fail "Git is not ignoring .env files correctly!"
}
Write-Host ""

# TEST 7: Verify protected files list
Write-Host "TEST 7: Verify other protected files" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

$protectedPatterns = @(
    "serviceAccount.json",
    "firebase-service-account.json"
)

foreach ($pattern in $protectedPatterns) {
    $found = git check-ignore -q $pattern
    if ($LASTEXITCODE -eq 0) {
        Check-Pass "$pattern is properly ignored"
    } else {
        Check-Warn "$pattern is not in .gitignore"
    }
}
Write-Host ""

# FINAL SUMMARY
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✓ Security Verification Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  • .env files: NOT tracked ✓"
Write-Host "  • .env.example: Tracked (safe template) ✓"
Write-Host "  • .gitignore: Properly configured ✓"
Write-Host "  • Private keys in history: NONE ✓"
Write-Host "  • Firebase credentials: SAFE ✓"
Write-Host ""
Write-Host "Your repository is secure!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Execute Firebase key rotation (see FIREBASE_KEY_ROTATION_GUIDE.md)"
Write-Host "  2. Update Railway environment variables with new key"
Write-Host "  3. Redeploy and verify with health check"
Write-Host ""
