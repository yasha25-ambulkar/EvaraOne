#!/bin/bash
# GIT CLEANUP SCRIPT
# Removes .env from Git tracking and history

set -e

echo "🧹 Git Cleanup for .env File"
echo "============================"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
  echo "⚠️  .env file does NOT exist in current directory"
  exit 1
fi

echo "STEP 1: Remove .env from Git tracking"
echo "====================================="
echo "Running: git rm --cached .env"
git rm --cached .env 2>/dev/null || echo "⚠️  .env already removed from tracking"

echo ""
echo "STEP 2: Ensure .env is in .gitignore"
echo "===================================="
if grep -q "^\.env$" .gitignore; then
  echo "✓ .env is already in .gitignore"
else
  echo "Adding .env to .gitignore..."
  echo ".env" >> .gitignore
  git add .gitignore
fi

echo ""
echo "STEP 3: Commit the changes"
echo "=========================="
echo "Running: git commit -m 'Remove .env from version control'"
git commit -m "🔐 Remove .env from version control" || echo "⚠️  Nothing to commit"

echo ""
echo "STEP 4: Verify .env is no longer tracked"
echo "========================================"
if git ls-files | grep -q "\.env$"; then
  echo "❌ FAILED: .env is still tracked!"
  exit 1
else
  echo "✓ .env is NOT tracked in Git"
fi

echo ""
echo "STEP 5: Check if .env appears in history"
echo "========================================"
if git log -p --all -- '.env' | grep -q "FIREBASE_PRIVATE_KEY"; then
  echo "⚠️  WARNING: FIREBASE_PRIVATE_KEY found in git history!"
  echo ""
  echo "To remove from history, run:"
  echo "  git filter-branch --tree-filter 'rm -f .env' -- --all"
  echo "  git push --force --all"
  echo ""
  echo "⚠️  WARNING: This rewrites history. Inform your team!"
else
  echo "✓ .env does NOT appear in recent git history"
fi

echo ""
echo "STEP 6: Push changes"
echo "==================="
echo "Run: git push"
echo ""
echo "✅ Git cleanup complete!"
