# Firebase Key Rotation Checklist

## ✅ Pre-Rotation (Backup & Verification)

- [ ] Screenshot current .env file (for reference)
- [ ] Note the current Firebase private_key_id
- [ ] Verify current app is running and healthy
- [ ] Have team members save any unsaved work

## 🔄 Rotation Steps

### Step 1: Generate New Key
- [ ] Open Firebase Console (https://console.firebase.google.com)
- [ ] Go to Project Settings → Service Accounts
- [ ] Click "Generate New Private Key"
- [ ] Download the JSON file
- [ ] **STORE SECURELY** (do NOT commit to Git)
- [ ] Extract values:
  - [ ] `private_key_id`
  - [ ] `private_key`
  - [ ] `client_email`
  - [ ] All other Firebase env vars

### Step 2: Revoke Old Key
- [ ] Go back to Firebase Console → Service Accounts
- [ ] Find the OLD key (look for oldest `private_key_id`)
- [ ] Click the three-dot menu (⋯)
- [ ] Select "Delete"
- [ ] **CONFIRM DELETION**
- [ ] Verify message: "Service account key deleted"

**⚠️ CRITICAL:** The old key is NOW REVOKED

### Step 3: Update Environment Variables

#### Railway (Production)
- [ ] Open Railway Dashboard
- [ ] Go to Variables section
- [ ] **REMOVE** the old .env file (if uploaded)
- [ ] Add new environment variables:
  - [ ] `FIREBASE_PROJECT_ID=evaraone-9cde8`
  - [ ] `FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@evaraone-9cde8.iam.gserviceaccount.com`
  - [ ] `FIREBASE_PRIVATE_KEY_ID=<new_id>`
  - [ ] `FIREBASE_PRIVATE_KEY=<new_key>` (entire key, newlines intact)
  - [ ] `FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth`
  - [ ] `FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token`
  - [ ] `FIREBASE_AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs`
  - [ ] `FIREBASE_CLIENT_CERT_URL=<from_json>`
  - [ ] `FIREBASE_DATABASE_URL=https://evaraone-9cde8.firebaseio.com`
  - [ ] `FIREBASE_STORAGE_BUCKET=evaraone-9cde8.firebasestorage.app`

#### Local Development (.env file)
- [ ] Update `FIREBASE_PRIVATE_KEY` with new value
- [ ] Update `FIREBASE_PRIVATE_KEY_ID` with new value
- [ ] Verify `.env` is in `.gitignore`
- [ ] Verify `.env` is NOT tracked by Git

### Step 4: Deploy

- [ ] Commit any changes: `git add .gitignore && git commit -m "Remove .env from tracking"`
- [ ] Trigger Railway redeploy (manual or auto via git push)
- [ ] **Wait for deployment to complete** (green ✓)
- [ ] Monitor logs for: `"[Firebase] ✅ Firestore connectivity OK"`

### Step 5: Verify

- [ ] Test health endpoint: `curl https://your-railway-url/health`
  - [ ] Returns HTTP 200
  - [ ] Database status: "healthy"
  - [ ] Memory status: "healthy"
  
- [ ] Test auth endpoint: `curl -H "Authorization: Bearer TOKEN" https://your-railway-url/api/v1/auth/me`
  - [ ] Returns user data (NOT auth error)
  
- [ ] Check logs for errors:
  - [ ] NO "Firestore connectivity FAILED"
  - [ ] NO "MISSING REQUIRED ENVIRONMENT VARIABLES"
  - [ ] NO "Invalid Firebase private key"

### Step 6: Git Cleanup

- [ ] Run: `git rm --cached backend/.env`
- [ ] Run: `git add .gitignore && git commit -m "Remove .env from tracking"`
- [ ] Run: `git push`
- [ ] Verify: `git ls-files | grep .env` (should be empty)

### Step 7: Verify Git History Clean

- [ ] Run: `git log -p --all -- .env` (look for FIREBASE_PRIVATE_KEY)
- [ ] If found in history, run: `git filter-branch --tree-filter 'rm -f .env' -- --all`
  - [ ] ⚠️ This rewrites history — inform your team!
  - [ ] Run: `git push --force --all`

## ✅ Post-Rotation (Verification)

- [ ] Monitor app logs for 10 minutes (no auth errors)
- [ ] Test at least 5 API endpoints
- [ ] Verify Firestore queries return data correctly
- [ ] Check that all devices are visible (device queries work)
- [ ] Verify audit logs are being written
- [ ] Check that Socket.io connections work (if applicable)

## 🔒 Security Verification

- [ ] Confirm old key is DELETED in Firebase Console (not just disabled)
- [ ] Confirm .env is NOT in Git: `git ls-files | grep .env`
- [ ] Confirm .env is in .gitignore: `grep .env .gitignore`
- [ ] Confirm FIREBASE_PRIVATE_KEY is NOT in recent commits:
  ```bash
  git log -p --all | grep "BEGIN PRIVATE KEY" | head -5
  # Should show: (no results)
  ```

## 📋 Sign-Off

- [ ] Rotation completed successfully
- [ ] All tests passed
- [ ] No errors in logs
- [ ] Team notified of completion
- [ ] Date/Time of rotation: ________________
- [ ] Completed by: ________________

---

## 🚨 If Something Goes Wrong

**Symptom: "Firestore connectivity FAILED"**
- [ ] Verify FIREBASE_PRIVATE_KEY is set in Railway
- [ ] Verify key starts with `-----BEGIN PRIVATE KEY-----`
- [ ] Check that no newlines are escaped as `\n` (should be literal newlines)

**Symptom: "Authentication error" on API endpoints**
- [ ] Wait 60 seconds (Railway might still be deploying)
- [ ] Hard refresh browser: Ctrl+Shift+R
- [ ] Check that old key was actually DELETED in Firebase

**Symptom: App won't start**
- [ ] Check Railway logs for validation errors
- [ ] Verify all required Firebase env vars are set
- [ ] Try local startup: `npm run dev` to debug locally

---

## 📞 Emergency Rollback (If needed)

**ONLY if new key doesn't work:**

1. Go back to old key JSON (your backup)
2. Update Railway environment variables with OLD values
3. Redeploy
4. Contact Firebase Support

