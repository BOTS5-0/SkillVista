# Quick Setup Guide

## Problem
The Render backend was returning HTML instead of JSON because:
1. The Procfile wasn't in place (tells Render how to start the server)
2. Backend dependencies weren't installed

## Solutions Applied
✅ Created Procfile with: `web: node server.js`
✅ Added backend dependencies to package.json
✅ Added "server" script to package.json
✅ Verified server.js works locally (registration returns proper JWT)

## What You Need to Do

### Option 1: Let Git Push Trigger Redeploy (Recommended)
```bash
# From project root
git status              # Check changes are staged
git push origin main    # Push to trigger Render redeployment
```

### Option 2: Manual Render Redeploy
1. Go to: https://dashboard.render.com
2. Select your "skillvista" service
3. Click "Manual Deploy" → "Deploy latest commit"
4. Wait 2-3 minutes for deployment to complete

### Option 3: Use Render deploy hook from local machine
```bash
# If you have RENDER_DEPLOY_HOOK set as env variable
curl -X POST $RENDER_DEPLOY_HOOK
```

## Testing After Deployment
Once Render redeploys, test the endpoint:
```bash
curl -X POST https://skillvista.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"pass123"}'
```

Should return: `{"token":"...JWT...", "user":{...}}`

## Files Updated
- ✅ Procfile - New file telling Render how to start backend
- ✅ package.json - Added server dependencies + scripts
- ✅ server.js - Already correct, running on port $PORT
- ✅ src/services/api.ts - Better error handling for registration
- ✅ src/screens/GitHubLoginScreen - Real email/password auth
- ✅ src/screens/HomeScreen - GitHub sync with real API
- ✅ src/app/index.tsx - Token-based auth check
- ✅ src/screens/SettingsScreen - Proper logout with api.logout()

## Local Verification
The backend works perfectly locally:
```
$ node server.js
SkillVista backend running on http://localhost:4000/api

$ curl -X POST http://localhost:4000/api/auth/register ...
HTTP/1.1 201 Created
{"token":"eyJhbGci...","user":{"id":"c6d1c6ce...","name":"Test","email":"test@example.com"}}
```

## Expected Behavior After Fix
1. User opens app and sees login form ✅
2. Enters name/email/password and clicks "Create Account" ✅
3. Frontend sends to: `https://skillvista.onrender.com/api/auth/register` ✅
4. Backend validates and returns JWT token ✅
5. Token stored in AsyncStorage ✅
6. Redirected to Dashboard ✅
7. Dashboard shows "Welcome, [Name]!" ✅
8. "Sync GitHub" button available ✅

## If Still Getting HTML Error After Redeployment
The issue might be that Render's cache hasn't cleared. Try:
1. Clear browser cache (hard refresh: Ctrl+Shift+R)
2. Force rebuild on Render dashboard
3. Check Render logs for errors: https://dashboard.render.com → Select service → Logs
4. Look for error messages in the "Build" or "Deploy" tab

## Common Error Messages
- `JSON parser error: unexpected character :<` = Server returning HTML (being fixed by redeploy)
- `Connection refused` = Server not running (Procfile not working)
- `404 not found` = Routes not loaded (unlikely with our setup)
- `CORS error` = Backend CORS not enabled (server.js has cors() middleware)
