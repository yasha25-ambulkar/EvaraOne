# 🔐 FIREBASE PRIVATE KEY ROTATION & REVOCATION GUIDE

**CRITICAL ACTION REQUIRED**  
**Status:** ⚠️ BLOCKING PRODUCTION DEPLOYMENT  
**Timeline:** COMPLETE TODAY (within 1 hour)

---

## ✅ STEP-BY-STEP ROTATION PROCEDURE

### STEP 1: Generate New Firebase Service Account Key

**⏱️ Estimated Time: 5 minutes**

#### 1.1 Open Firebase Console
```
Navigate to: https://console.firebase.google.com
Project: evaraone-9cde8
```

#### 1.2 Access Service Accounts
```
1. Click "Project Settings" (gear icon, top-right)
2. Select "Service Accounts" tab
3. Ensure "Node.js" is selected as the SDK
```

#### 1.3 Generate New Key
```
1. Scroll to "Service Accounts" section
2. Click "Generate New Private Key"
3. Confirm the action
4. A JSON file will download: `evaraone-9cde8-[timestamp].json`
```

#### 1.4 Save the New Key Securely
```
DO NOT commit this file to Git
DO NOT store in .env file
Store in: 1Password, LastPass, or temporary secure location
```

**JSON Contents will look like:**
```json
{
  "type": "service_account",
  "project_id": "evaraone-9cde8",
  "private_key_id": "NEW_KEY_ID_HERE",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...NEW KEY...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@evaraone-9cde8.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

---

### STEP 2: Revoke the Old (Exposed) Service Account Key

**⏱️ Estimated Time: 2 minutes**

#### 2.1 Identify Old Key
```
In Firebase Console → Service Accounts tab:
Look for the key with private_key_id matching the .env file's value
(Or look for the oldest key, if unsure)
```

#### 2.2 Delete the Old Key
```
1. Hover over the old key row
2. Click the three-dot menu (⋯)
3. Select "Delete"
4. Confirm deletion
```

#### 2.3 Verify Deletion
```
In console output, you should see:
"✓ Service account key deleted"

The old key is NOW REVOKED for:
- Firebase Authentication
- Firestore reads/writes
- Cloud Functions
- All Admin SDK operations
```

**⚠️ IMPORTANT:** 
- Any app using the OLD key will immediately fail to connect
- This is expected and correct (forces immediate migration)
- The old key cannot be recovered

---

### STEP 3: Add Environment Variables to Railway

**⏱️ Estimated Time: 10 minutes**

#### 3.1 Open Railway Dashboard
```
Navigate to: https://railway.app
Select your project: evara-backend (or your project name)
Go to: Variables section
```

#### 3.2 Remove Old .env File Method
```
If currently using uploaded .env file:
1. Go to: Settings → .env File
2. Delete the .env file
3. Confirm deletion
```

#### 3.3 Add New Environment Variables

**Add each value individually** (do NOT paste the entire JSON):

```
FIREBASE_PROJECT_ID=evaraone-9cde8
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@evaraone-9cde8.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY_ID=<paste the private_key_id from new JSON>
FIREBASE_PRIVATE_KEY=<paste the entire private_key value>
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_CERT_URL=<paste from new JSON>
FIREBASE_DATABASE_URL=https://evaraone-9cde8.firebaseio.com
FIREBASE_STORAGE_BUCKET=evaraone-9cde8.firebasestorage.app
```

**⚠️ IMPORTANT FOR FIREBASE_PRIVATE_KEY:**

The key contains literal newlines. When pasting:

```
CORRECT:
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEF...
...middle of key...
ldP1x8k1AgMBAAECggEAKmXYoHsJIl...
-----END PRIVATE KEY-----

NOT:
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEF...\n-----END PRIVATE KEY-----

Railway will handle escaping automatically
```

#### 3.4 Verify Variables Added
```
In Railway Variables section, you should see:
✓ FIREBASE_PROJECT_ID
✓ FIREBASE_CLIENT_EMAIL
✓ FIREBASE_PRIVATE_KEY
✓ FIREBASE_PRIVATE_KEY_ID
✓ FIREBASE_AUTH_URI
✓ FIREBASE_TOKEN_URI
✓ FIREBASE_AUTH_PROVIDER_CERT_URL
✓ FIREBASE_CLIENT_CERT_URL
✓ FIREBASE_DATABASE_URL
✓ FIREBASE_STORAGE_BUCKET
```

---

### STEP 4: Update Local Development (.env)

**⏱️ Estimated Time: 2 minutes**

#### 4.1 Update .env Locally

```bash
# Navigate to backend directory
cd backend

# Edit .env file with new values
# (Use VSCode or your editor)
```

**Update these values only:**

```
FIREBASE_PRIVATE_KEY="<paste entire new private key>"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@evaraone-9cde8.iam.gserviceaccount.com
```

**Keep these as-is (unchanged):**
```
FIREBASE_PROJECT_ID=evaraone-9cde8
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_DATABASE_URL=https://evaraone-9cde8.firebaseio.com
FIREBASE_STORAGE_BUCKET=evaraone-9cde8.firebasestorage.app
```

#### 4.2 Verify .env is Still in .gitignore

```bash
# Check .gitignore
cat .gitignore

# Should contain:
.env
.env.local
.env.*.local

# If NOT present, add it:
echo ".env" >> .gitignore
```

---

### STEP 5: Redeploy and Verify

**⏱️ Estimated Time: 5 minutes**

#### 5.1 Trigger Railway Redeploy

**Option A: Automatic (Recommended)**
```
1. Go to Railway Dashboard → Your Service
2. Click "Settings"
3. Scroll to "Redeploy"
4. Click "Redeploy latest"
5. Wait for deployment to complete (shows ✓ in green)
```

**Option B: Manual Git Push**
```bash
# Make a small commit to trigger redeploy
echo "# Key rotation: $(date)" >> SECURITY.md
git add SECURITY.md
git commit -m "🔐 Firebase key rotated - $(date)"
git push
# Railway will auto-deploy
```

#### 5.2 Monitor Logs During Deployment

```bash
# In Railway Dashboard → Logs
# Should see:

✅ [Firebase] Firestore initialized with REST transport
✅ [Firebase] ✅ Firestore connectivity OK (123ms, docs: 45)
✅ Environment Variables Validated
✅ Server listening on port 8000

# RED FLAGS (these mean the key is wrong):
❌ [Firebase] ❌ Firestore connectivity FAILED
❌ MISSING REQUIRED ENVIRONMENT VARIABLES
❌ FIREBASE_PRIVATE_KEY does not look like a valid PEM key
```

#### 5.3 Verify Health Check Endpoint

```bash
# Test the health check endpoint
curl https://your-railway-url/health

# Should return:
{
  "status": "healthy",
  "timestamp": "2026-04-21T...",
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 123,
      "message": "Database connection successful"
    },
    "memory": {
      "status": "healthy",
      "message": "Heap: 45MB, System: 32%"
    }
  }
}
```

#### 5.4 Test API Endpoint with Authentication

```bash
# Test a protected endpoint
curl -X GET https://your-railway-url/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_VALID_ID_TOKEN"

# Should return user data, NOT auth error
```

---

## 🧹 STEP 6: Clean Up Exposed Key from Git History

**⏱️ Estimated Time: 10 minutes**

### 6.1 Remove .env from Tracking

```bash
# Navigate to your repo root
cd d:\20-04-26\main

# Remove .env from Git (stops tracking)
git rm --cached backend/.env

# Verify it's removed from index
git status backend/.env
# Should show: deleted: backend/.env

# Commit the removal
git add .gitignore
git commit -m "🔐 Remove .env from version control"

# Push
git push
```

### 6.2 Verify .env is in .gitignore

```bash
# Check .gitignore contains .env
grep "^\.env$" .gitignore

# If not found, add it
echo ".env" >> .gitignore
git add .gitignore
git commit -m "Ensure .env is in .gitignore"
git push
```

### 6.3 (OPTIONAL) Remove from Git History

**⚠️ ONLY IF the repository is public or sensitive**

```bash
# This rewrites git history — inform your team!
# Only do this if the repo with the key is PUBLIC

git filter-branch --tree-filter 'rm -f backend/.env' -- --all

# Force push (dangerous — only if needed)
git push --force --all
git push --force --tags
```

---

## ✅ VERIFICATION CHECKLIST

Go through this checklist to confirm everything is complete:

### Security
- [ ] Old Firebase key DELETED in Firebase Console
- [ ] New key GENERATED and downloaded
- [ ] Old key CANNOT be used (revoked)
- [ ] New key TESTED locally (app starts successfully)

### Environment Variables
- [ ] All Firebase env vars set in Railway (FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, etc.)
- [ ] FIREBASE_PRIVATE_KEY contains newlines (not escaped \n)
- [ ] .env file REMOVED from Git tracking
- [ ] .env IS IN .gitignore

### Deployment
- [ ] Railway redeploy COMPLETED successfully (green ✓)
- [ ] Logs show "Firestore connectivity OK"
- [ ] Health check endpoint returns "healthy"
- [ ] Protected API endpoint returns data (no auth error)

### Git History
- [ ] `git status backend/.env` shows nothing (fully removed from index)
- [ ] `git log -p backend/.env` shows the removal commit
- [ ] Latest .env file DOES NOT appear in any branch

### Local Development
- [ ] Local .env has NEW private key
- [ ] Local app starts successfully: `npm run dev`
- [ ] Local Firestore queries work
- [ ] Tests pass (if applicable)

---

## 🚨 TROUBLESHOOTING

### Error: "Firestore connectivity FAILED"

**Cause:** Environment variables not set correctly

**Fix:**
```bash
# Verify in Railway
echo $FIREBASE_PRIVATE_KEY | head -c 50
# Should show: -----BEGIN PRIVATE KEY-----

# If empty:
# Go to Railway → Variables
# Ensure FIREBASE_PRIVATE_KEY is set (not empty)
```

### Error: "Invalid Firebase private key. Exiting."

**Cause:** Private key not in PEM format

**Fix:**
```bash
# In Railway variables, the key should START with:
-----BEGIN PRIVATE KEY-----

# And END with:
-----END PRIVATE KEY-----

# If you see: \n (escaped) instead of actual newlines
# CORRECT IT by pasting properly
```

### Error: "CORS policy: Not allowed"

**Cause:** Frontend making request before app restarts

**Fix:**
```bash
# Hard refresh frontend
# Press Ctrl+Shift+R (or Cmd+Shift+R on Mac)

# Or clear browser cache
# Then try again
```

### Local App Not Connecting

**Cause:** Old .env file still has expired key

**Fix:**
```bash
# Update .env with new FIREBASE_PRIVATE_KEY
# Delete node_modules/.cache
rm -rf node_modules/.cache

# Restart app
npm run dev
```

---

## 📞 SUPPORT

If deployment fails after following these steps:

1. **Check Railway logs** for error messages
2. **Verify all env vars are set** (check Railway dashboard)
3. **Confirm private key format** (starts with -----BEGIN, ends with -----END)
4. **Test locally first** (run `npm run dev` locally)
5. **Check Firebase Console** that new key is active

---

## 📋 SUMMARY

| Step | Action | Status |
|------|--------|--------|
| 1 | Generate new Firebase key | [ ] Complete |
| 2 | Delete old Firebase key | [ ] Complete |
| 3 | Add env vars to Railway | [ ] Complete |
| 4 | Update local .env | [ ] Complete |
| 5 | Redeploy app | [ ] Complete |
| 6 | Test health check endpoint | [ ] Complete |
| 7 | Remove .env from Git | [ ] Complete |
| 8 | Verify Git history clean | [ ] Complete |

---

**CRITICAL:** Complete all steps in order. Do not skip any step.

**Expected Completion Time:** 30-45 minutes total

**After Completion:** Your Firebase key rotation is complete and your application is secure.

