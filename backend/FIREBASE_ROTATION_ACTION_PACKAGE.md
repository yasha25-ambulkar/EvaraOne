# 🔐 FIREBASE KEY ROTATION - COMPLETE ACTION PACKAGE

**Status:** CRITICAL - DO THIS TODAY  
**Estimated Time:** 45 minutes  
**Complexity:** Medium  
**Risk Level:** LOW (old key gets revoked immediately)

---

## 📦 WHAT'S INCLUDED IN THIS PACKAGE

I've created **complete resources** for you to rotate your Firebase private key safely:

### 📄 Documentation Files

1. **`FIREBASE_KEY_ROTATION_GUIDE.md`** (Main Guide)
   - Step-by-step instructions with exact buttons to click
   - Screenshots of where to find things in Firebase Console
   - Railway environment variable setup
   - Verification procedures
   - Troubleshooting section
   - **Use this as your primary reference**

2. **`FIREBASE_ROTATION_CHECKLIST.md`** (Verification Checklist)
   - Pre-rotation steps
   - Rotation steps broken into subsections
   - Post-rotation verification
   - Security verification
   - Emergency rollback procedures
   - **Use this to track progress**

3. **`.gitignore`** (Updated)
   - Now includes `.env` file exclusion
   - Prevents accidental secret commits
   - Applied to whole project

### 🔧 Automation Scripts

4. **`verify-firebase-rotation.sh`** (Verification Script)
   ```bash
   bash backend/verify-firebase-rotation.sh
   ```
   - Checks if `.env` is properly excluded from Git
   - Verifies .gitignore configuration
   - Validates Firebase private key format
   - Checks git history for exposed secrets
   - **Run this BEFORE making changes to verify current state**

5. **`test-firestore-connectivity.sh`** (Testing Script)
   ```bash
   export RAILWAY_URL=https://your-url.railway.app
   bash backend/test-firestore-connectivity.sh
   ```
   - Tests health check endpoint after deployment
   - Verifies Firestore connectivity
   - Confirms new key works
   - **Run this AFTER deployment**

6. **`cleanup-git-env.sh`** (Git Cleanup Script)
   ```bash
   bash backend/cleanup-git-env.sh
   ```
   - Removes `.env` from Git tracking
   - Adds to `.gitignore`
   - Verifies history is clean
   - **Run this when done to ensure no accidental commits**

---

## ⚡ QUICK START (5-Minute Overview)

### The Problem
Your Firebase private key is in `.env` file committed to Git. **Anyone with repo access = full admin to Firestore.**

### The Solution (4 Steps)
1. **Generate new key** in Firebase Console (5 min)
2. **Delete old key** in Firebase Console (2 min)
3. **Set env vars** in Railway dashboard (10 min)
4. **Redeploy** and verify (5 min)

### Expected Result
✅ Old key revoked immediately  
✅ New key active in production  
✅ `.env` removed from Git  
✅ No downtime required

---

## 🎯 EXECUTION PLAN

### Phase 1: Preparation (5 minutes)

```bash
# 1. Verify current state
bash backend/verify-firebase-rotation.sh

# Expected output:
# ✓ .env is NOT tracked in Git
# ✓ .env is in .gitignore
# ✓ .env NOT found in recent git history
```

**If any checks fail, fix them before proceeding:**

```bash
# If .env is still tracked:
git rm --cached backend/.env
git add .gitignore
git commit -m "Remove .env from tracking"
git push
```

### Phase 2: Firebase Console (10 minutes)

**Follow the step-by-step guide in `FIREBASE_KEY_ROTATION_GUIDE.md`:**

1. Open Firebase Console
2. Generate new key → Download JSON
3. Delete old key → Confirm
4. Save new key somewhere secure (NOT in Git)

### Phase 3: Railway Environment Variables (10 minutes)

**Follow `FIREBASE_KEY_ROTATION_GUIDE.md` Step 3:**

1. Open Railway dashboard
2. Add individual environment variables:
   ```
   FIREBASE_PROJECT_ID=evaraone-9cde8
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...
   FIREBASE_PRIVATE_KEY=(paste full key)
   ... (8 more variables)
   ```

**⚠️ CRITICAL:** Paste entire private key with actual newlines (not `\n`)

### Phase 4: Local Update & Git Cleanup (5 minutes)

```bash
# Update local .env with new key
# (Edit backend/.env with your text editor)

# Remove .env from Git tracking
bash backend/cleanup-git-env.sh

# Commit and push
git push
```

### Phase 5: Deployment & Verification (10 minutes)

```bash
# Railway auto-deploys on git push
# Wait for green ✓ in Railway dashboard

# Test connectivity
export RAILWAY_URL=https://your-url.railway.app
bash backend/test-firestore-connectivity.sh

# Expected output:
# ✅ SUCCESS: Health check passed!
# ✅ Database status: HEALTHY
```

---

## 📊 DETAILED TIMELINE

| Phase | Task | Time | Who | Tools |
|-------|------|------|-----|-------|
| **1** | Verify current state | 5 min | You | `verify-firebase-rotation.sh` |
| **2** | Generate new Firebase key | 5 min | You | Firebase Console |
| **3** | Revoke old Firebase key | 2 min | You | Firebase Console |
| **4** | Add Railway env vars | 10 min | You | Railway Dashboard |
| **5** | Update local .env | 2 min | You | Text Editor |
| **6** | Remove .env from Git | 3 min | You | `cleanup-git-env.sh` |
| **7** | Deploy | 5 min | Railway | Automatic |
| **8** | Verify connectivity | 5 min | You | `test-firestore-connectivity.sh` |
| | **TOTAL** | **~40 minutes** | | |

---

## ✅ HOW TO USE EACH FILE

### 1. Read First
```
Start here: FIREBASE_KEY_ROTATION_GUIDE.md
Then check: FIREBASE_ROTATION_CHECKLIST.md
```

### 2. Verify Before Starting
```bash
bash backend/verify-firebase-rotation.sh
```
Expected output: All checks PASS

### 3. Follow Guide Steps
```
1. Generate new key (Firebase Console)
2. Delete old key (Firebase Console)
3. Add Railway variables (Railway Dashboard)
4. Update local .env (Text editor)
```

### 4. Execute Cleanup Script
```bash
bash backend/cleanup-git-env.sh
```

### 5. Test After Deployment
```bash
export RAILWAY_URL=https://your-railway-url.railway.app
bash backend/test-firestore-connectivity.sh
```

---

## 🚨 CRITICAL POINTS

### ⚠️ DURING ROTATION

**DO:**
- ✅ Follow steps in order
- ✅ Paste the entire private key (with newlines)
- ✅ Wait for Railway deployment to complete
- ✅ Test health check endpoint after deploy
- ✅ Delete the old key (this revokes it immediately)

**DON'T:**
- ❌ Skip the "Delete old key" step
- ❌ Commit the new JSON file to Git
- ❌ Use escaped `\n` for newlines (paste actual newlines)
- ❌ Mix old and new keys (use new key everywhere)
- ❌ Forget to remove .env from Git tracking

### ⚠️ SECURITY

- **Old key is REVOKED** — any app using it will fail immediately (this is correct)
- **New key is only in Railway** — not in .env, not in Git, not anywhere else
- **`.env` is now protected** — added to .gitignore, can't be accidentally committed

### ⚠️ DOWNTIME

- **Expected:** 0 minutes of downtime
- **Why:** Railway auto-redeploys on git push, new key active immediately
- **If it fails:** Old key still works until manually deleted (but don't do this — delete immediately)

---

## 🔍 VERIFICATION STEPS (Do These!)

After completing rotation, verify everything works:

### Health Check
```bash
curl https://your-railway-url/health | jq .
```
Expected: `"status": "healthy"`

### Auth Endpoint
```bash
curl -H "Authorization: Bearer YOUR_ID_TOKEN" \
  https://your-railway-url/api/v1/auth/me | jq .
```
Expected: User data returned (not auth error)

### Check Logs
```
In Railway Dashboard → Logs:
Look for: "[Firebase] ✅ Firestore connectivity OK"
NOT: "[Firebase] ❌ Firestore connectivity FAILED"
```

### Test a Device Query (if you have one)
```bash
curl https://your-railway-url/api/v1/admin/zones | jq .
```
Expected: Zone data returned

---

## 🆘 IF SOMETHING GOES WRONG

### Problem: "Firestore connectivity FAILED"

**Causes:**
- Private key format incorrect
- Newlines escaped as `\n` instead of actual newlines
- Wrong Firebase project ID
- Missing environment variable

**Solution:**
1. Check Railway variables (all set?)
2. Copy-paste the private key again (verify format)
3. Redeploy: Click "Redeploy" in Railway dashboard
4. Check logs again

### Problem: "Invalid Firebase private key"

**Solution:**
The key must start with:
```
-----BEGIN PRIVATE KEY-----
```

Not:
```
"-----BEGIN PRIVATE KEY-----\n"
```

If you see `\n` (escaped), paste again without escaping.

### Problem: "Old key still works"

**Solution:**
You probably didn't DELETE it in Firebase Console. Go back and delete it:
1. Firebase Console → Service Accounts
2. Find old key
3. Click ⋯ menu
4. Delete
5. Confirm

### Problem: ".env still in Git"

**Solution:**
```bash
git rm --cached backend/.env
git add .gitignore
git commit -m "Remove .env from tracking"
git push

# Verify
git ls-files | grep .env  # Should return nothing
```

---

## 📞 SUPPORT & ESCALATION

### If you get stuck:

1. **Check the troubleshooting sections** in:
   - `FIREBASE_KEY_ROTATION_GUIDE.md` (has detailed troubleshooting)
   - `FIREBASE_ROTATION_CHECKLIST.md` (has emergency rollback)

2. **Review the scripts:**
   ```bash
   bash backend/verify-firebase-rotation.sh  # See current state
   bash backend/test-firestore-connectivity.sh  # Test connectivity
   ```

3. **Check Firebase Console:**
   - Is old key deleted? (go to Service Accounts)
   - Is new key the only one? (verify there's only 1 key)

4. **Check Railway:**
   - Are all env vars set? (go to Variables)
   - Is deployment successful? (green ✓ in dashboard)

---

## 📋 FINAL CHECKLIST

Before you start:
- [ ] You have Firebase Console access
- [ ] You have Railway dashboard access
- [ ] You have local Git access
- [ ] You have ~45 minutes of uninterrupted time
- [ ] You've read `FIREBASE_KEY_ROTATION_GUIDE.md`

After rotation:
- [ ] Old key is DELETED in Firebase Console
- [ ] New key is set in Railway variables
- [ ] `.env` is removed from Git tracking
- [ ] `.env` is in `.gitignore`
- [ ] Health check passes
- [ ] API endpoints work
- [ ] No errors in logs

---

## 🎯 SUCCESS CRITERIA

You're done when:

```
✅ Old Firebase key is REVOKED (deleted from Firebase Console)
✅ New Firebase key is ACTIVE (set in Railway environment variables)
✅ .env file is NOT in Git (git rm --cached backend/.env)
✅ Health check returns 200 with "healthy" status
✅ API endpoints return data (no auth errors)
✅ Logs show "[Firebase] ✅ Firestore connectivity OK"
✅ Team notified of key rotation completion
```

---

## 📚 FILE REFERENCE

| File | Purpose | When to Use |
|------|---------|-------------|
| `FIREBASE_KEY_ROTATION_GUIDE.md` | Main guide with step-by-step instructions | Before and during rotation |
| `FIREBASE_ROTATION_CHECKLIST.md` | Tracking checklist and verification | Throughout process |
| `verify-firebase-rotation.sh` | Pre-rotation verification | Before starting |
| `test-firestore-connectivity.sh` | Post-deployment testing | After deploying |
| `cleanup-git-env.sh` | Git cleanup automation | After updating .env |
| `.gitignore` | Prevents accidental secret commits | Always (for future protection) |

---

## 🎓 WHAT YOU'LL LEARN

By completing this rotation, you'll understand:

1. **How Firebase authentication works** — Service accounts vs users
2. **Environment variable management** — Railway best practices
3. **Git secret prevention** — .gitignore and git-rm workflows
4. **CI/CD deployment** — Railway auto-redeploy on git push
5. **Health check monitoring** — Verifying connectivity

---

## ⏰ START NOW

**Everything you need is ready. You can start immediately:**

1. Open `FIREBASE_KEY_ROTATION_GUIDE.md`
2. Run `bash backend/verify-firebase-rotation.sh`
3. Follow the guide step-by-step
4. Use the checklist to track progress

**Estimated time to completion: 45 minutes**

**Expected outcome: Secure, rotated Firebase key with no Git exposure**

---

**You've got this! Start with the guide.** 🚀

