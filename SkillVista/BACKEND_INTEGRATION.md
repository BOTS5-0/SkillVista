# SkillVista Backend Integration Guide

## Overview

The frontend has been optimized to work with the SkillVista backend running on Render at `https://skillvista.onrender.com`.

## API Service Layer

A centralized API service layer has been created at `src/services/api.ts` that handles all backend communication with:

- **Authentication**: Register, login, and token management
- **GitHub Integration**: Sync repositories and infer skills from GitHub
- **Integration Health**: Check connection status
- **User Management**: Get stored user data and logout

### Key Features

1. **Token Management**: Automatically handles JWT token storage and retrieval
2. **Error Handling**: Centralized error handling with meaningful messages
3. **Type Safety**: Full TypeScript types for all API responses
4. **Async Storage**: Persistent token and user data storage

## Authentication Flow

### New Registration/Login Process

Users can now:
1. **Register** with name, email, and password
2. **Login** with email and password
3. Tokens are automatically stored in local device storage
4. Automatic redirect to dashboard on successful auth

### Before (Mock Auth)
```
Mock credentials → Stored in AsyncStorage
```

### After (Real Backend)
```
Email + Password → Backend JWT → Stored in AsyncStorage → API calls with Bearer token
```

## Features Implemented

### 1. API Service (`src/services/api.ts`)

```typescript
// Authentication
await api.register(name, email, password)
await api.login(email, password)
await api.logout()

// GitHub Sync
await api.syncGitHubRepos(includePrivate?, limit?)
await api.syncGitHubReposOAuth(includePrivate?, limit?)

// Integration Health
await api.checkIntegrationHealth()

// User Data
await api.getStoredUser()
await api.getStoredToken()

// Utilities
await api.health()
await api.getStudents()
```

### 2. Updated Authentication Screen

**File**: `src/screens/GitHubLoginScreen/GitHubLoginScreen.tsx`

- Replaced mock GitHub OAuth with real email/password auth
- Added registration and login modes
- Form inputs for name, email, password
- Automatic token storage and dashboard redirect
- Toggle between login and registration

### 3. Enhanced Dashboard

**File**: `src/screens/HomeScreen/HomeScreen.tsx`

Features:
- Displays logged-in user's name
- "Sync GitHub Profile" button to fetch repository data
- Statistics cards showing:
  - Total repositories
  - Inferred skills count
- Top 6 inferred skills displayed as badges
- Live data from GitHub API via backend

### 4. Updated Settings Screen

**File**: `src/screens/SettingsScreen/SettingsScreen.tsx`

- Proper logout with confirmation dialog
- Clears stored token and user data
- Redirects to login screen

### 5. App Boot Process

**File**: `src/app/index.tsx`

- Checks for stored JWT token on startup
- Auto-redirects authenticated users to dashboard
- Shows GitHubLoginScreen for unauthenticated users

## Getting Started

### 1. Update Environment Variables

Add these to your `.env` file:

```env
# Backend
API_BASE_URL=https://skillvista.onrender.com/api

# GitHub OAuth (optional, for OAuth flow)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/callback
GITHUB_TOKEN=your_personal_github_token

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
```

### 2. Test the Flow

1. Run the app: `npx expo start`
2. Register with a new account or login
3. View dashboard with synced GitHub data
4. Navigate to settings and logout

## API Endpoints Available

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with email/password

### Graph
- `GET /api/graph` - Get graph data
- `GET /api/graph/search` - Search graph
- `GET /api/graph/students` - List all students
- `POST /api/graph/projects` - Create project (auth required)
- `POST /api/graph/certifications` - Create certification (auth required)

### GitHub Integration
- `GET /api/integrations/github/oauth/start` - Start GitHub OAuth
- `GET /api/integrations/github/oauth/callback` - OAuth callback
- `POST /api/integrations/github/oauth/sync` - Sync via OAuth
- `POST /api/integrations/github/sync` - Sync with static token
- `GET /api/integrations/health` - Check integration health

### System
- `GET /api/health` - Backend health check

## Data Flow

### Login Process
```
User enters credentials
    ↓
api.login(email, password)
    ↓
Backend validates credentials, returns JWT
    ↓
Token stored in AsyncStorage
    ↓
Redirect to /(tabs)/dashboard
    ↓
loadUserData() retrieves user from storage
```

### GitHub Sync Process
```
User clicks "Sync GitHub Profile"
    ↓
api.syncGitHubRepos()
    ↓
Backend processes GitHub repos, infers skills
    ↓
Returns repositories and inferred skills
    ↓
UI displays stats and top skills
    ↓
Data available for display on dashboard
```

## Error Handling

The API service includes comprehensive error handling:

```typescript
try {
  await api.login(email, password)
} catch (error: any) {
  Alert.alert('Login Error', error.message)
  // error.message comes from API response
}
```

Common errors:
- "Missing name, email, and password are required"
- "User already exists"
- "Invalid credentials"
- "No GitHub token found"
- "GitHub sync failed"

## Next Steps

### 1. Implement Full Profile Screen

```typescript
// Load and display full user profile
// Edit profile information
// Upload profile picture
```

### 2. Implement 3D Graph Visualization

```typescript
// Map screen should display 3D knowledge graph
// Use Three.js or Babylon.js for 3D rendering
// Display nodes and edges from graph data
```

### 3. Implement Analytics Dashboard

```typescript
// Analytics screen should show insights
// Learning progress over time
// Skill development trends
// Repository contribution statistics
```

### 4. Implement Project Management

```typescript
// Create, edit, delete projects
// Link projects to skills
// Track project completion status
```

### 5. Implement Certifications

```typescript
// Upload and manage certifications
// Verify certifications with backend
// Display certification badges
```

## Testing

All existing tests pass (66/66). The API service can be tested independently:

```typescript
// Test API responses
import { api } from '@/services/api'

// Mock test
const user = await api.login('test@example.com', 'password')
expect(user.token).toBeDefined()
```

## Troubleshooting

### Token Expired
- Tokens expire based on `JWT_EXPIRES_IN` setting
- User will need to login again
- Frontend should redirect to login page on 401 response

### GitHub Sync Fails
- Check if GitHub token is valid in `.env`
- Verify API backend is running at `https://skillvista.onrender.com`
- Check network connectivity

### AsyncStorage Issues
- Clear app cache if having storage issues
- On Android: Settings → Apps → SkillVista → Storage → Clear Cache
- On iOS: Delete app and reinstall

## Architecture

```
src/
├── services/
│   └── api.ts              # Centralized API client
├── screens/
│   ├── GitHubLoginScreen/  # Login/Registration
│   ├── HomeScreen/         # Dashboard with sync
│   ├── SettingsScreen/     # Settings & logout
│   └── ...
├── app/
│   └── index.tsx           # Auth bootstrapping
└── ...
```

## Security Notes

1. **Never commit `.env` file** - Contains secrets
2. **JWT tokens stored locally** - Use device security features
3. **HTTPS only** - All API calls use secure endpoints
4. **CORS enabled** - Backend accepts requests from app domain
5. **Rate limiting** - Backend implements 300 requests per 15 minutes

## Support

For issues or questions:
1. Check backend logs: `https://skillvista.onrender.com/api/health`
2. Review API responses in browser network tab
3. Check frontend console for error messages
4. Verify all environment variables are set
