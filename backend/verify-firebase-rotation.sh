#!/bin/bash
# FIREBASE KEY ROTATION VERIFICATION SCRIPT
# Run this AFTER completing the manual steps to verify everything is correct

set -e

echo "🔐 Firebase Key Rotation Verification Script"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
check_pass() {
  echo -e "${GREEN}✓ PASS${NC}: $1"
}

check_fail() {
  echo -e "${RED}✗ FAIL${NC}: $1"
  exit 1
}

check_warn() {
  echo -e "${YELLOW}⚠ WARN${NC}: $1"
}

echo "STEP 1: Verify .env is NOT tracked in Git"
echo "=========================================="
git ls-files | grep -q "\.env$" && check_fail ".env is still tracked in Git! Run: git rm --cached .env" || check_pass ".env is NOT tracked in Git"
echo ""

echo "STEP 2: Verify .env is in .gitignore"
echo "===================================="
grep -q "^\.env$" .gitignore && check_pass ".env is in .gitignore" || check_fail ".env is NOT in .gitignore. Add it with: echo '.env' >> .gitignore"
echo ""

echo "STEP 3: Check if .env file exists locally"
echo "========================================"
if [ -f ".env" ]; then
  check_pass ".env file exists"
  
  echo ""
  echo "STEP 4: Verify FIREBASE_PRIVATE_KEY format"
  echo "=========================================="
  
  if grep -q "FIREBASE_PRIVATE_KEY=" .env; then
    check_pass "FIREBASE_PRIVATE_KEY is set"
    
    # Extract first 50 characters
    KEY_START=$(grep "FIREBASE_PRIVATE_KEY=" .env | head -c 60)
    
    if [[ "$KEY_START" == *"BEGIN PRIVATE KEY"* ]]; then
      check_pass "FIREBASE_PRIVATE_KEY starts with 'BEGIN PRIVATE KEY'"
    else
      check_fail "FIREBASE_PRIVATE_KEY does NOT start with 'BEGIN PRIVATE KEY'"
    fi
    
    # Check if it ends with closing comment
    if grep "FIREBASE_PRIVATE_KEY=" .env | grep -q "END PRIVATE KEY"; then
      check_pass "FIREBASE_PRIVATE_KEY ends with 'END PRIVATE KEY'"
    else
      check_fail "FIREBASE_PRIVATE_KEY does NOT end with 'END PRIVATE KEY'"
    fi
  else
    check_fail "FIREBASE_PRIVATE_KEY is NOT set in .env"
  fi
  
  echo ""
  echo "STEP 5: Verify other Firebase env vars"
  echo "======================================"
  
  [ -n "$(grep 'FIREBASE_PROJECT_ID=' .env)" ] && check_pass "FIREBASE_PROJECT_ID is set" || check_fail "FIREBASE_PROJECT_ID is missing"
  [ -n "$(grep 'FIREBASE_CLIENT_EMAIL=' .env)" ] && check_pass "FIREBASE_CLIENT_EMAIL is set" || check_fail "FIREBASE_CLIENT_EMAIL is missing"
  [ -n "$(grep 'FIREBASE_AUTH_URI=' .env)" ] && check_pass "FIREBASE_AUTH_URI is set" || check_fail "FIREBASE_AUTH_URI is missing"
  [ -n "$(grep 'FIREBASE_TOKEN_URI=' .env)" ] && check_pass "FIREBASE_TOKEN_URI is set" || check_fail "FIREBASE_TOKEN_URI is missing"
else
  check_warn ".env file does NOT exist locally. Will use Railway environment variables on production."
fi

echo ""
echo "STEP 6: Verify .env is not in recent commits"
echo "==========================================="
if git log -p --all -- '*.env' | grep -q "FIREBASE_PRIVATE_KEY"; then
  check_fail "FIREBASE_PRIVATE_KEY found in git history! Run: git filter-branch --tree-filter 'rm -f .env' -- --all (WARNING: rewrites history)"
else
  check_pass ".env NOT found in recent git history"
fi

echo ""
echo "STEP 7: Verify node_modules is in .gitignore"
echo "=========================================="
grep -q "^node_modules$" .gitignore && check_pass "node_modules is in .gitignore" || check_warn "node_modules should be in .gitignore to avoid committing dependencies"

echo ""
echo "============================================"
echo -e "${GREEN}✓ All checks passed!${NC}"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Update .env with NEW Firebase private key (if working locally)"
echo "2. Deploy to Railway using: git push"
echo "3. Run health check: curl https://your-railway-url/health"
echo "4. Test auth endpoint: curl -H 'Authorization: Bearer TOKEN' https://your-railway-url/api/v1/auth/me"
