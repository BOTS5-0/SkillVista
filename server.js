const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

// Initialize Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

console.log('=== SkillVista Backend Starting ===');
console.log('Supabase configured:', Boolean(supabase));
console.log('SUPABASE_URL set:', Boolean(SUPABASE_URL));
console.log('SUPABASE_SERVICE_ROLE_KEY set:', Boolean(SUPABASE_SERVICE_KEY));

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const API_PREFIX = '/api';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || '';
const GITHUB_STATIC_TOKEN = process.env.GITHUB_TOKEN || '';

// Demo in-memory stores. Replace with persistent DB tables in production.
const usersByEmail = new Map();
const usersById = new Map();
const pendingGithubStates = new Map();
const githubTokensByUserId = new Map(); // fallback if Supabase not configured

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(
  `${API_PREFIX}/`,
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);

const safeString = (value) => (typeof value === 'string' ? value.trim() : '');

const createAuthToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

const authGuard = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: missing bearer token' });
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: invalid or expired token' });
  }
};

const githubClient = (token) =>
  axios.create({
    baseURL: 'https://api.github.com',
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

const inferSkills = (repos) => {
  const counts = new Map();

  const bump = (raw) => {
    const value = safeString(raw).toLowerCase();
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  };

  for (const repo of repos) {
    bump(repo.language);
    if (Array.isArray(repo.topics)) {
      for (const topic of repo.topics) bump(topic);
    }

    const description = `${safeString(repo.name)} ${safeString(repo.description)}`.toLowerCase();
    const keywords = [
      'react',
      'node',
      'express',
      'next',
      'typescript',
      'javascript',
      'python',
      'java',
      'go',
      'docker',
      'kubernetes',
      'graphql',
      'postgres',
      'mongodb'
    ];

    for (const keyword of keywords) {
      if (description.includes(keyword)) bump(keyword);
    }
  }

  return [...counts.entries()]
    .map(([skill, score]) => ({ skill, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
};

const toRepoSummary = (repo, languageMap, commitCount) => ({
  id: repo.id,
  name: repo.name,
  fullName: repo.full_name,
  description: repo.description,
  private: repo.private,
  htmlUrl: repo.html_url,
  defaultBranch: repo.default_branch,
  stars: repo.stargazers_count,
  forks: repo.forks_count,
  openIssues: repo.open_issues_count,
  topics: Array.isArray(repo.topics) ? repo.topics : [],
  language: repo.language,
  languages: Object.keys(languageMap),
  commitSampleCount: commitCount,
  updatedAt: repo.updated_at,
  pushedAt: repo.pushed_at
});

const getGithubTokenForUser = async (userId, allowStaticFallback = true) => {
  // First try Supabase if configured
  if (supabase) {
    let studentId = null;
    
    // Try to get student from memory cache first
    const user = usersById.get(userId);
    if (user?.email) {
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('email', user.email)
        .single();
      if (student) studentId = student.id;
    }
    
    // If not in memory, try looking up by ID directly
    if (!studentId) {
      const numericId = parseInt(userId, 10);
      if (!isNaN(numericId)) {
        studentId = numericId;
      }
    }
    
    if (studentId) {
      // Get GitHub token from integration_accounts
      const { data: integration } = await supabase
        .from('integration_accounts')
        .select('access_token')
        .eq('student_id', studentId)
        .eq('provider', 'github')
        .single();
      
      if (integration?.access_token) {
        return integration.access_token;
      }
    }
  }
  
  // Fallback to in-memory storage
  const oauthToken = githubTokensByUserId.get(userId);
  if (oauthToken && oauthToken.accessToken) return oauthToken.accessToken;
  
  // Only use static token if explicitly allowed (for /sync endpoint, not /oauth/sync)
  if (allowStaticFallback && GITHUB_STATIC_TOKEN) return GITHUB_STATIC_TOKEN;
  return '';
};

// Helper to save GitHub token to Supabase
const saveGithubToken = async (userId, tokenData, githubUser) => {
  // Always save to in-memory as fallback
  githubTokensByUserId.set(userId, tokenData);
  
  if (!supabase) return;
  
  try {
    let studentId = null;
    
    // First try to get student from memory cache
    const user = usersById.get(userId);
    if (user?.email) {
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('email', user.email)
        .single();
      if (student) studentId = student.id;
    }
    
    // If not in memory, try looking up by ID directly (userId might be the student ID)
    if (!studentId) {
      const numericId = parseInt(userId, 10);
      if (!isNaN(numericId)) {
        const { data: student } = await supabase
          .from('students')
          .select('id')
          .eq('id', numericId)
          .single();
        if (student) studentId = student.id;
      }
    }
    
    if (!studentId) {
      console.error('Could not find student for userId:', userId);
      return;
    }
    
    // Check if integration account already exists
    const { data: existing } = await supabase
      .from('integration_accounts')
      .select('id')
      .eq('student_id', studentId)
      .eq('provider', 'github')
      .single();
    
    const integrationData = {
      student_id: studentId,
      provider: 'github',
      external_user_id: String(githubUser?.id || ''),
      external_username: githubUser?.login || '',
      access_token: tokenData.accessToken,
      scopes: tokenData.scope ? tokenData.scope.split(',') : [],
      updated_at: new Date().toISOString()
    };
    
    let saveError;
    if (existing) {
      // Update existing record
      const { error } = await supabase
        .from('integration_accounts')
        .update(integrationData)
        .eq('id', existing.id);
      saveError = error;
    } else {
      // Insert new record
      integrationData.connected_at = new Date().toISOString();
      const { error } = await supabase
        .from('integration_accounts')
        .insert(integrationData);
      saveError = error;
    }
    
    if (saveError) {
      console.error('Failed to save GitHub token:', saveError);
    } else {
      console.log(`GitHub token saved for student ${studentId}`);
    }
  } catch (err) {
    console.error('Error saving GitHub token to Supabase:', err);
  }
};

app.get(`${API_PREFIX}/health`, (req, res) => {
  res.json({
    ok: true,
    service: 'skillvista-backend',
    mode: process.env.NODE_ENV || 'development'
  });
});

app.post(`${API_PREFIX}/auth/register`, async (req, res) => {
  const name = safeString(req.body?.name);
  const email = safeString(req.body?.email).toLowerCase();
  const password = safeString(req.body?.password);

  console.log('Register attempt:', { name, email, supabaseConfigured: Boolean(supabase) });

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }

  // Check if Supabase is configured
  if (supabase) {
    console.log('Using Supabase for registration');
    
    // Check if user exists in Supabase
    const { data: existing, error: checkError } = await supabase
      .from('students')
      .select('id')
      .eq('email', email)
      .single();
    
    console.log('Existing user check:', { existing, checkError: checkError?.message });
    
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Create user in Supabase
    const passwordHash = await bcrypt.hash(password, 10);
    const { data: newStudent, error } = await supabase
      .from('students')
      .insert({ name, email, password_hash: passwordHash })
      .select('id, name, email')
      .single();
    
    console.log('Insert result:', { newStudent, error: error?.message });
    
    if (error) {
      console.error('Supabase register error:', error);
      return res.status(500).json({ error: 'Failed to create user', details: error.message });
    }

    // Also cache in memory for token operations
    const user = { id: String(newStudent.id), name: newStudent.name, email: newStudent.email, passwordHash };
    usersByEmail.set(email, user);
    usersById.set(user.id, user);

    const token = createAuthToken(user);
    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  }

  // Fallback to in-memory if Supabase not configured
  if (usersByEmail.has(email)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10)
  };

  usersByEmail.set(email, user);
  usersById.set(user.id, user);

  const token = createAuthToken(user);
  return res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email }
  });
});

app.post(`${API_PREFIX}/auth/login`, async (req, res) => {
  const email = safeString(req.body?.email).toLowerCase();
  const password = safeString(req.body?.password);

  // Check if Supabase is configured
  if (supabase) {
    const { data: student, error } = await supabase
      .from('students')
      .select('id, name, email, password_hash')
      .eq('email', email)
      .single();
    
    if (error || !student) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!student.password_hash) {
      return res.status(401).json({ error: 'Account not set up for password login' });
    }

    const valid = await bcrypt.compare(password, student.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Cache in memory for token operations
    const user = { id: String(student.id), name: student.name, email: student.email, passwordHash: student.password_hash };
    usersByEmail.set(email, user);
    usersById.set(user.id, user);

    const token = createAuthToken(user);
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  }

  // Fallback to in-memory
  const user = usersByEmail.get(email);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createAuthToken(user);
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.get(`${API_PREFIX}/graph`, (req, res) => {
  res.json({ nodes: [], edges: [], filters: req.query || {} });
});

app.get(`${API_PREFIX}/graph/search`, (req, res) => {
  res.json({ query: safeString(req.query?.q), results: [] });
});

app.get(`${API_PREFIX}/graph/students`, async (req, res) => {
  if (supabase) {
    const { data: students, error } = await supabase
      .from('students')
      .select('id, name, email')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Failed to fetch students:', error);
      return res.status(500).json({ error: 'Failed to fetch students' });
    }
    
    return res.json({ students: students || [] });
  }

  // Fallback to in-memory
  const students = [...usersByEmail.values()].map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email
  }));
  res.json({ students });
});

app.post(`${API_PREFIX}/graph/projects`, authGuard, (req, res) => {
  res.status(501).json({ message: 'Project persistence is not wired to DB yet', body: req.body || {} });
});

app.post(`${API_PREFIX}/graph/certifications`, authGuard, (req, res) => {
  res
    .status(501)
    .json({ message: 'Certification persistence is not wired to DB yet', body: req.body || {} });
});

app.get(`${API_PREFIX}/integrations/health`, authGuard, async (req, res) => {
  const token = await getGithubTokenForUser(req.user.id);
  const github = {
    configured: Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET && GITHUB_REDIRECT_URI),
    hasToken: Boolean(token),
    oauthConnected: githubTokensByUserId.has(req.user.id)
  };

  if (!token) {
    return res.json({ github, githubApi: { reachable: false, reason: 'No GitHub token available' } });
  }

  try {
    const client = githubClient(token);
    const { data } = await client.get('/rate_limit');
    return res.json({
      github,
      githubApi: {
        reachable: true,
        rateLimit: data?.resources?.core || null
      }
    });
  } catch (error) {
    return res.status(502).json({
      github,
      githubApi: {
        reachable: false,
        reason: error.response?.data?.message || error.message
      }
    });
  }
});

app.get(`${API_PREFIX}/integrations/github/oauth/start`, authGuard, (req, res) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_REDIRECT_URI) {
    return res.status(400).json({
      error: 'Missing GITHUB_CLIENT_ID or GITHUB_REDIRECT_URI in .env'
    });
  }

  const statePayload = {
    sub: req.user.id,
    nonce: crypto.randomUUID()
  };

  const state = jwt.sign(statePayload, JWT_SECRET, { expiresIn: '10m' });
  pendingGithubStates.set(state, {
    userId: req.user.id,
    createdAt: Date.now()
  });

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: 'read:user user:email repo',
    state,
    allow_signup: 'true'
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  return res.json({ authUrl, state, expiresInSeconds: 600 });
});

app.get(`${API_PREFIX}/integrations/github/oauth/callback`, async (req, res) => {
  const code = safeString(req.query?.code);
  const state = safeString(req.query?.state);
  const oauthError = safeString(req.query?.error);

  if (oauthError) {
    return res.status(400).json({ error: `GitHub OAuth error: ${oauthError}` });
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_REDIRECT_URI) {
    return res.status(400).json({
      error: 'Missing GitHub OAuth env settings (GITHUB_CLIENT_ID/SECRET/REDIRECT_URI)'
    });
  }

  const pendingState = pendingGithubStates.get(state);
  if (!pendingState) {
    return res.status(400).json({ error: 'Invalid or expired OAuth state' });
  }

  try {
    const decoded = jwt.verify(state, JWT_SECRET);
    if (decoded.sub !== pendingState.userId) {
      return res.status(400).json({ error: 'OAuth state user mismatch' });
    }

    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_REDIRECT_URI,
        state
      },
      {
        headers: {
          Accept: 'application/json'
        },
        timeout: 20000
      }
    );

    const accessToken = safeString(tokenResponse.data?.access_token);
    if (!accessToken) {
      return res.status(502).json({ error: 'GitHub did not return an access token' });
    }

    // Fetch GitHub user info to store with the token
    let githubUser = null;
    try {
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      githubUser = {
        id: userResponse.data?.id,
        login: userResponse.data?.login,
        name: userResponse.data?.name,
        avatar_url: userResponse.data?.avatar_url
      };
    } catch (err) {
      console.warn('Failed to fetch GitHub user info:', err.message);
    }

    const tokenData = {
      accessToken,
      tokenType: safeString(tokenResponse.data?.token_type) || 'bearer',
      scope: safeString(tokenResponse.data?.scope),
      createdAt: Date.now()
    };

    // Save to Supabase (and in-memory fallback)
    await saveGithubToken(pendingState.userId, tokenData, githubUser);

    pendingGithubStates.delete(state);

    // Return a nice HTML page so user knows to go back to app
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>GitHub Connected - SkillVista</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.1);
            border-radius: 16px;
            backdrop-filter: blur(10px);
          }
          .checkmark {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 { margin: 0 0 10px 0; font-size: 24px; }
          p { margin: 0; opacity: 0.9; font-size: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="checkmark">✓</div>
          <h1>GitHub Connected!</h1>
          <p>You can now close this window and return to SkillVista.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    pendingGithubStates.delete(state);
    return res.status(502).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Connection Failed - SkillVista</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #DC2626 0%, #EF4444 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.1);
            border-radius: 16px;
            backdrop-filter: blur(10px);
          }
          .icon { font-size: 64px; margin-bottom: 20px; }
          h1 { margin: 0 0 10px 0; font-size: 24px; }
          p { margin: 0; opacity: 0.9; font-size: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">✕</div>
          <h1>Connection Failed</h1>
          <p>Please close this window and try again in SkillVista.</p>
        </div>
      </body>
      </html>
    `);
  }
});

const runGithubSync = async ({ token, limit, includePrivate }) => {
  const perPage = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const visibility = includePrivate ? 'all' : 'public';
  const client = githubClient(token);

  const [meRes, reposRes] = await Promise.all([
    client.get('/user'),
    client.get('/user/repos', {
      params: {
        sort: 'updated',
        direction: 'desc',
        per_page: perPage,
        visibility,
        affiliation: 'owner,collaborator,organization_member'
      }
    })
  ]);

  const repos = Array.isArray(reposRes.data) ? reposRes.data : [];

  const repoDetails = await Promise.all(
    repos.map(async (repo) => {
      try {
        const [languagesRes, commitsRes] = await Promise.all([
          client.get(`/repos/${repo.owner.login}/${repo.name}/languages`),
          client.get(`/repos/${repo.owner.login}/${repo.name}/commits`, { params: { per_page: 10 } })
        ]);

        const languages = languagesRes.data || {};
        const commitCount = Array.isArray(commitsRes.data) ? commitsRes.data.length : 0;
        return toRepoSummary(repo, languages, commitCount);
      } catch (error) {
        return toRepoSummary(repo, {}, 0);
      }
    })
  );

  const inferredSkills = inferSkills(repoDetails);

  return {
    githubUser: {
      id: meRes.data?.id,
      login: meRes.data?.login,
      name: meRes.data?.name,
      avatarUrl: meRes.data?.avatar_url,
      profileUrl: meRes.data?.html_url,
      publicRepos: meRes.data?.public_repos,
      followers: meRes.data?.followers,
      following: meRes.data?.following
    },
    repositories: repoDetails,
    inferredSkills,
    totals: {
      repositories: repoDetails.length,
      inferredSkills: inferredSkills.length
    }
  };
};

app.post(`${API_PREFIX}/integrations/github/oauth/sync`, authGuard, async (req, res) => {
  // Don't allow static token fallback - must have OAuth token
  const token = await getGithubTokenForUser(req.user.id, false);
  if (!token) {
    return res.status(400).json({
      error: 'No GitHub OAuth token found. Please connect your GitHub account first.',
      needsOAuth: true
    });
  }

  const studentName = safeString(req.body?.studentName) || req.user.name || 'Unknown Student';
  const includePrivate = Boolean(req.body?.includePrivate);
  const limit = Number(req.body?.limit) || 30;

  try {
    const syncPayload = await runGithubSync({ token, limit, includePrivate });
    return res.json({
      provider: 'github',
      studentName,
      syncedAt: new Date().toISOString(),
      source: githubTokensByUserId.has(req.user.id) ? 'oauth' : 'env_token',
      ...syncPayload
    });
  } catch (error) {
    return res.status(502).json({
      error: 'GitHub sync failed',
      details: error.response?.data || error.message
    });
  }
});

app.post(`${API_PREFIX}/integrations/github/sync`, authGuard, async (req, res) => {
  const token = GITHUB_STATIC_TOKEN || await getGithubTokenForUser(req.user.id);
  if (!token) {
    return res.status(400).json({ error: 'Set GITHUB_TOKEN in .env or connect OAuth first' });
  }

  const studentName = safeString(req.body?.studentName) || req.user.name || 'Unknown Student';
  const includePrivate = Boolean(req.body?.includePrivate);
  const limit = Number(req.body?.limit) || 30;

  try {
    const syncPayload = await runGithubSync({ token, limit, includePrivate });
    return res.json({
      provider: 'github',
      studentName,
      syncedAt: new Date().toISOString(),
      source: GITHUB_STATIC_TOKEN ? 'env_token' : 'oauth',
      ...syncPayload
    });
  } catch (error) {
    return res.status(502).json({
      error: 'GitHub sync failed',
      details: error.response?.data || error.message
    });
  }
});

app.post(`${API_PREFIX}/integrations/notion/sync`, authGuard, (req, res) => {
  res.status(501).json({ message: 'Notion sync not implemented in this file yet' });
});

app.post(`${API_PREFIX}/integrations/certifications/sync`, authGuard, (req, res) => {
  res.status(501).json({ message: 'Certification sync not implemented in this file yet' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SkillVista backend running on http://localhost:${PORT}${API_PREFIX}`);
});
