# SkillVista Backend Deployment Fix

## Problem
You're getting an HTML response instead of JSON from the backend. This happens because **Render is still running the Expo web frontend** instead of the Node.js backend server.

**Reason**: The `Procfile` (which tells Render to run `node server.js`) hasn't been pushed to GitHub/Render yet.

---

## Solution: Push Backend Files to Render

### Step 1: Check What Files Need Pushing
These files were created/modified locally but aren't on Render yet:
- ✅ `Procfile` - Tells Render how to start the backend
- ✅ `render.yaml` - Explicit Render configuration  
- ✅ `package.json` - Updated with backend dependencies
- ✅ `src/services/api.ts` - Frontend API client
- ✅ `server.js` - Backend (already exists)

### Step 2: Commit Everything

Open PowerShell in your project root:

```powershell
# Stage all changes
git add .

# Commit
git commit -m "fix: deploy backend server with Procfile and dependencies"

# Check status
git status
```

Expected output: `nothing to commit, working tree clean`

### Step 3: Fix Git Sync Issue

Due to a previous failed push, your local branch might be behind. Fix it:

```powershell
# Option A: Rebase (safest)
git fetch origin
git rebase origin/main
git push origin main

# Option B: Force latest (if you own the repo)
git push origin main --force-with-lease

# Option C: If above fails, reset and push
git fetch origin
git reset --hard origin/main
git add .
git commit -m "fix: deploy backend"
git push origin main
```

### Step 4: Verify Render Deployment

1. Go to: https://dashboard.render.com
2. Click on your "skillvista" service
3. In the **Logs** tab, you should see:
   ```
   SkillVista backend running on http://localhost:PORT/api
   ```
4. Wait 2-3 minutes for deployment to complete

### Step 5: Test the Fix

Once Render shows the backend is running:

```powershell
# Test registration endpoint
$body = @{name="Test"; email="test123@example.com"; password="password123"} | ConvertTo-Json
$response = Invoke-WebRequest -Uri "https://skillvista.onrender.com/api/auth/register" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body `
  -UseBasicParsing

# Should return JSON with token and user data
$response.Content | ConvertFrom-Json | Format-List
```

**Success Indicators**:
- Status: 201 (Created)
- Response contains `token` and `user` object
- NO HTML response

---

## Detailed Setup Files

### Procfile
```
web: node server.js
```
Tells Render:
- Run type: `web` (HTTP server)
- Start command: `node server.js`
- Uses `PORT` environment variable automatically

### render.yaml  
```yaml
services:
  - type: web
    name: skillvista
    runtime: node
    buildCommand: npm ci
    startCommand: node server.js
```
Explicit configuration for Render

### package.json
Updated with these backend dependencies:
```json
"dependencies": {
  "express": "^5.2.1",
  "cors": "^2.8.6",
  "helmet": "^8.1.0",
  "morgan": "^1.10.1",
  "jsonwebtoken": "^9.0.3",
  "bcryptjs": "^3.0.3",
  "express-rate-limit": "^8.2.1",
  "axios": "^1.13.5",
  "dotenv": "^17.3.1"
}
```

---

## server.js Verification

The backend includes:

✅ **Routes**:
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login with email/password
- `POST /api/integrations/github/sync` - GitHub sync
- `GET /api/health` - Health check
- All with proper error handling

✅ **Middleware**:
- CORS enabled (allows requests from any origin)
- Helmet for security headers
- Rate limiting (300 requests/15 min)
- Body parsing (JSON)
- Logging (morgan)

✅ **Error Handling**:
- Returns JSON error responses
- Status codes: 201 (Created), 400 (Bad request), 401 (Unauthorized), 501 (Not implemented)
- Never returns HTML

---

## If Deployment Still Fails

### Check 1: Render Logs
1. Dashboard → Select "skillvista" service
2. Click "Logs" tab
3. Look for errors during deployment/build

**Common errors**:
- `npm ERR! peer req missing` → Run `npm ci` locally and commit lock file
- `Module not found` → Missing dependency in package.json
- `PORT undefined` → Render should auto-set it

### Check 2: Verify GitHub Push Success
```powershell
git log --oneline -5
git remote -v
git branch -a
```

Should show:
- Your commits in the log
- `origin/main` as remote
- `main` as current branch pointing to `origin/main`

### Check 3: Restart Render Service
1. Dashboard → skillvista service
2. Click the three-dot menu (⋮)
3. Select "Restart instance"

### Check 4: Manual Redeploy
1. If logs show old code, click "Manual Deploy"
2. This triggers a fresh build even if code hasn't changed

---

## Expected Behavior After Fix

```
User App                        Render Backend
   ↓                                  ↓
[Open App]                    
   ↓
[Registration Form] ──POST──→ /api/auth/register
                              ↓
                        [Validate data]
                        [Hash password]
                        [Store in memory]
                        [Create JWT token]
   ↓←──201 + JSON──────────────↓
[Show Success Message]
[Navigate to Dashboard]
```

**Response Example** (not HTML):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

---

## TLDR - Quick Command

```powershell
cd C:\SkillVista\SkillVista
git fetch origin
git reset --hard origin/main
git add .
git commit -m "fix: deploy backend with Procfile"
git push origin main
# Wait 2-3 minutes
# Test: Invoke-WebRequest -Uri "https://skillvista.onrender.com/api/health" -UseBasicParsing
```

Then your registration should work!
