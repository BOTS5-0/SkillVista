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

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('Supabase client initialized successfully');
} else {
  console.warn('WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Database features disabled.');
}

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const API_PREFIX = '/api';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || '';
const GITHUB_STATIC_TOKEN = process.env.GITHUB_TOKEN || '';

// Temporary in-memory stores for OAuth state (short-lived, don't need DB)
const pendingGithubStates = new Map();
const githubTokensByUserId = new Map();

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

const getGithubTokenForUser = async (userId) => {
  // First check in-memory cache
  const oauthToken = githubTokensByUserId.get(userId);
  if (oauthToken && oauthToken.accessToken) return oauthToken.accessToken;
  
  // Then check database
  if (supabase) {
    const { data } = await supabase
      .from('integration_accounts')
      .select('access_token')
      .eq('student_id', userId)
      .eq('provider', 'github')
      .single();
    
    if (data?.access_token) {
      // Cache it in memory for performance
      githubTokensByUserId.set(userId, { accessToken: data.access_token });
      return data.access_token;
    }
  }
  
  if (GITHUB_STATIC_TOKEN) return GITHUB_STATIC_TOKEN;
  return '';
};

// Helper to store or update integration account in database
const saveIntegrationAccount = async (studentId, provider, data) => {
  if (!supabase) return null;
  
  // Check if account already exists
  const { data: existing } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('student_id', studentId)
    .eq('provider', provider)
    .single();
  
  if (existing) {
    // Update existing
    const { data: updated, error } = await supabase
      .from('integration_accounts')
      .update({
        access_token: data.accessToken,
        external_user_id: data.externalUserId,
        external_username: data.externalUsername,
        scopes: data.scopes ? data.scopes.split(',') : [],
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();
    
    if (error) console.error('Error updating integration account:', error);
    return updated;
  } else {
    // Insert new
    const { data: inserted, error } = await supabase
      .from('integration_accounts')
      .insert({
        student_id: studentId,
        provider,
        access_token: data.accessToken,
        external_user_id: data.externalUserId,
        external_username: data.externalUsername,
        scopes: data.scopes ? data.scopes.split(',') : [],
        connected_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) console.error('Error inserting integration account:', error);
    return inserted;
  }
};

// Helper to create or get a skill by name
const getOrCreateSkill = async (skillName) => {
  if (!supabase || !skillName) return null;
  
  const name = skillName.toLowerCase().trim();
  
  // Try to find existing
  const { data: existing } = await supabase
    .from('skills')
    .select('id, name')
    .eq('name', name)
    .single();
  
  if (existing) return existing;
  
  // Create new
  const { data: created, error } = await supabase
    .from('skills')
    .insert({ name })
    .select('id, name')
    .single();
  
  if (error && error.code === '23505') {
    // Unique constraint - try to fetch again
    const { data } = await supabase.from('skills').select('id, name').eq('name', name).single();
    return data;
  }
  
  return created;
};

// Helper to get or create a source (github, notion, certification, manual, other)
const getOrCreateSource = async (sourceName, kind) => {
  if (!supabase || !sourceName) return null;
  
  const name = sourceName.toLowerCase().trim();
  
  const { data: existing } = await supabase
    .from('sources')
    .select('id, name, kind')
    .eq('name', name)
    .single();
  
  if (existing) return existing;
  
  const { data: created, error } = await supabase
    .from('sources')
    .insert({ name, kind })
    .select('id, name, kind')
    .single();
  
  if (error && error.code === '23505') {
    const { data } = await supabase.from('sources').select('id, name, kind').eq('name', name).single();
    return data;
  }
  
  return created;
};

// Helper to get or create a technology
const getOrCreateTechnology = async (techName) => {
  if (!supabase || !techName) return null;
  
  const name = techName.toLowerCase().trim();
  
  const { data: existing } = await supabase
    .from('technologies')
    .select('id, name')
    .eq('name', name)
    .single();
  
  if (existing) return existing;
  
  const { data: created, error } = await supabase
    .from('technologies')
    .insert({ name })
    .select('id, name')
    .single();
  
  if (error && error.code === '23505') {
    const { data } = await supabase.from('technologies').select('id, name').eq('name', name).single();
    return data;
  }
  
  return created;
};

// Helper to create or update a project from external source
const createOrUpdateProject = async (studentId, sourceId, projectData) => {
  if (!supabase) return null;
  
  // Check if project exists by source_external_id
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('student_id', studentId)
    .eq('source_id', sourceId)
    .eq('source_external_id', projectData.sourceExternalId)
    .single();
  
  const record = {
    student_id: studentId,
    source_id: sourceId,
    name: projectData.name,
    description: projectData.description || '',
    url: projectData.url,
    source_external_id: projectData.sourceExternalId,
    metadata: projectData.metadata || {},
    updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString()
  };
  
  if (existing) {
    const { data } = await supabase
      .from('projects')
      .update(record)
      .eq('id', existing.id)
      .select('id')
      .single();
    return data;
  } else {
    const { data, error } = await supabase
      .from('projects')
      .insert(record)
      .select('id')
      .single();
    if (error) console.error('Error creating project:', error);
    return data;
  }
};

// Helper to link a project to skills with usage tracking
const linkProjectSkill = async (projectId, skillId, usageCount = 1) => {
  if (!supabase || !projectId || !skillId) return;
  
  await supabase
    .from('project_skills')
    .upsert({
      project_id: projectId,
      skill_id: skillId,
      usage_count: usageCount,
      last_used: new Date().toISOString()
    }, { onConflict: 'project_id,skill_id' });
};

// Helper to link a project to technologies
const linkProjectTechnology = async (projectId, technologyId) => {
  if (!supabase || !projectId || !technologyId) return;
  
  await supabase
    .from('project_technologies')
    .upsert({
      project_id: projectId,
      technology_id: technologyId
    }, { onConflict: 'project_id,technology_id' });
};

// 🔥 INTELLIGENCE LAYER: Update student_skills with aggregated proficiency
const updateStudentSkills = async (studentId, inferredSkills, repoDetailsMap, repos) => {
  if (!supabase || !studentId) return { updated: 0 };
  
  let updated = 0;
  
  // Calculate skill metrics from all repos
  const skillMetrics = new Map();
  
  for (const skillData of inferredSkills) {
    const skillName = skillData.skill.toLowerCase().trim();
    const skill = await getOrCreateSkill(skillName);
    if (!skill) continue;
    
    // Calculate proficiency based on:
    // - Usage count (how many repos use this skill)
    // - Recency (when was it last used)
    // - Depth (commits, stars, etc. as a proxy for depth)
    
    let totalBytes = 0;
    let totalCommits = 0;
    let totalStars = 0;
    let lastUsedDate = null;
    let repoCount = 0;
    
    for (const repo of repos) {
      const repoDetail = repoDetailsMap.get(repo.id);
      const repoLanguages = repoDetail?.languageBytes || {};
      
      // Check if this skill/language is used in this repo
      const isLanguageMatch = Object.keys(repoLanguages).some(
        lang => lang.toLowerCase() === skillName
      );
      const isTopicMatch = (repo.topics || []).some(
        t => t.toLowerCase() === skillName
      );
      
      if (isLanguageMatch || isTopicMatch) {
        repoCount++;
        totalStars += repo.stargazers_count || 0;
        totalCommits += (repoDetail?.commits || []).length;
        
        if (isLanguageMatch) {
          const langKey = Object.keys(repoLanguages).find(
            l => l.toLowerCase() === skillName
          );
          totalBytes += repoLanguages[langKey] || 0;
        }
        
        // Track most recent usage
        const pushedAt = repo.pushed_at ? new Date(repo.pushed_at) : null;
        if (pushedAt && (!lastUsedDate || pushedAt > lastUsedDate)) {
          lastUsedDate = pushedAt;
        }
      }
    }
    
    // Calculate proficiency score (0-100)
    // Based on: usage frequency, code volume, project quality
    const usageScore = Math.min(repoCount * 15, 40); // Max 40 from usage
    const volumeScore = Math.min(Math.log10(totalBytes + 1) * 5, 30); // Max 30 from volume
    const qualityScore = Math.min((totalStars * 2) + (totalCommits * 0.5), 30); // Max 30 from quality
    
    const proficiencyScore = Math.min(Math.round(usageScore + volumeScore + qualityScore), 100);
    
    // Calculate confidence score (0-100)
    // Higher confidence with more data points
    const dataPoints = repoCount + totalCommits;
    const confidenceScore = Math.min(Math.round(dataPoints * 5), 100);
    
    skillMetrics.set(skill.id, {
      skillId: skill.id,
      proficiencyScore,
      confidenceScore,
      usageCount: skillData.score,
      lastUsed: lastUsedDate?.toISOString() || new Date().toISOString()
    });
  }
  
  // Upsert student_skills records
  for (const [skillId, metrics] of skillMetrics) {
    try {
      const { error } = await supabase
        .from('student_skills')
        .upsert({
          student_id: studentId,
          skill_id: skillId,
          proficiency_score: metrics.proficiencyScore,
          confidence_score: metrics.confidenceScore,
          usage_count: metrics.usageCount,
          last_used: metrics.lastUsed
        }, { onConflict: 'student_id,skill_id' });
      
      if (!error) updated++;
    } catch (err) {
      console.error(`Error updating student_skill for skill ${skillId}:`, err);
    }
  }
  
  return { updated };
};

// Helper to persist GitHub repos and related data (FULL KNOWLEDGE GRAPH)
const persistGithubData = async (studentId, githubUser, repos, repoDetailsMap, inferredSkills) => {
  if (!supabase) return { savedRepos: 0, savedSkills: 0, savedProjects: 0, studentSkillsUpdated: 0 };
  
  let savedRepos = 0;
  let savedSkills = 0;
  let savedProjects = 0;
  
  // 1️⃣ Get or create the 'github' source
  const githubSource = await getOrCreateSource('github', 'github');
  
  // Save each repository
  for (const repo of repos) {
    try {
      const repoData = {
        student_id: studentId,
        github_repo_id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description || '',
        html_url: repo.html_url,
        is_private: repo.private || false,
        default_branch: repo.default_branch,
        language: repo.language,
        topics: Array.isArray(repo.topics) ? repo.topics.join(',') : '',
        stars: repo.stargazers_count || 0,
        forks: repo.forks_count || 0,
        watchers: repo.watchers_count || 0,
        open_issues: repo.open_issues_count || 0,
        pushed_at: repo.pushed_at,
        repo_updated_at: repo.updated_at,
        last_synced_at: new Date().toISOString(),
        raw: repo
      };
      
      // Check if repo already exists
      const { data: existingRepo } = await supabase
        .from('github_repos')
        .select('id')
        .eq('student_id', studentId)
        .eq('github_repo_id', repo.id)
        .single();
      
      let savedRepo;
      if (existingRepo) {
        const { data } = await supabase
          .from('github_repos')
          .update(repoData)
          .eq('id', existingRepo.id)
          .select('id')
          .single();
        savedRepo = data;
      } else {
        const { data } = await supabase
          .from('github_repos')
          .insert(repoData)
          .select('id')
          .single();
        savedRepo = data;
      }
      
      if (savedRepo) {
        savedRepos++;
        const repoDetail = repoDetailsMap.get(repo.id);
        
        // Save languages to github_repo_languages
        if (repoDetail?.languages && typeof repoDetail.languageBytes === 'object') {
          for (const [lang, bytes] of Object.entries(repoDetail.languageBytes)) {
            await supabase
              .from('github_repo_languages')
              .upsert({
                repo_id: savedRepo.id,
                language: lang,
                bytes: bytes || 0
              }, { onConflict: 'repo_id,language' });
          }
        }
        
        // Save topics to github_repo_topics
        if (Array.isArray(repo.topics)) {
          for (const topic of repo.topics) {
            await supabase
              .from('github_repo_topics')
              .upsert({
                repo_id: savedRepo.id,
                topic: topic
              }, { onConflict: 'repo_id,topic' });
          }
        }
        
        // Save commits to github_commits
        if (repoDetail?.commits && Array.isArray(repoDetail.commits)) {
          for (const commit of repoDetail.commits) {
            const commitData = {
              repo_id: savedRepo.id,
              sha: commit.sha,
              author_login: commit.author?.login || commit.commit?.author?.name,
              author_email: commit.commit?.author?.email,
              message: commit.commit?.message,
              commit_url: commit.html_url,
              committed_at: commit.commit?.author?.date,
              raw: commit
            };
            
            // Check if commit exists
            const { data: existingCommit } = await supabase
              .from('github_commits')
              .select('id')
              .eq('repo_id', savedRepo.id)
              .eq('sha', commit.sha)
              .single();
            
            if (!existingCommit) {
              await supabase.from('github_commits').insert(commitData);
            }
          }
        }
        
        // 2️⃣ Create PROJECT from this repo (Activity Layer)
        if (githubSource) {
          const project = await createOrUpdateProject(studentId, githubSource.id, {
            name: repo.name,
            description: repo.description || '',
            url: repo.html_url,
            sourceExternalId: repo.id.toString(),
            metadata: {
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              language: repo.language,
              topics: repo.topics,
              private: repo.private
            }
          });
          
          if (project) {
            savedProjects++;
            
            // 3️⃣ Link PROJECT_SKILLS (Knowledge Graph Layer)
            // Link skills from languages
            if (repoDetail?.languageBytes) {
              for (const lang of Object.keys(repoDetail.languageBytes)) {
                const skill = await getOrCreateSkill(lang);
                if (skill) {
                  await linkProjectSkill(project.id, skill.id, 1);
                }
              }
            }
            
            // Link skills from topics
            if (Array.isArray(repo.topics)) {
              for (const topic of repo.topics) {
                const skill = await getOrCreateSkill(topic);
                if (skill) {
                  await linkProjectSkill(project.id, skill.id, 1);
                }
              }
            }
            
            // 4️⃣ Link PROJECT_TECHNOLOGIES
            // Languages are also technologies
            if (repoDetail?.languageBytes) {
              for (const lang of Object.keys(repoDetail.languageBytes)) {
                const tech = await getOrCreateTechnology(lang);
                if (tech) {
                  await linkProjectTechnology(project.id, tech.id);
                }
              }
            }
          }
        }
      }
    } catch (repoError) {
      console.error(`Error saving repo ${repo.name}:`, repoError);
    }
  }
  
  // Save inferred skills to skills table
  for (const skillData of inferredSkills) {
    const skill = await getOrCreateSkill(skillData.skill);
    if (skill) savedSkills++;
  }
  
  // 5️⃣ INTELLIGENCE LAYER: Update student_skills with proficiency scoring
  const studentSkillsResult = await updateStudentSkills(studentId, inferredSkills, repoDetailsMap, repos);
  
  return { 
    savedRepos, 
    savedSkills, 
    savedProjects,
    studentSkillsUpdated: studentSkillsResult.updated
  };
};

// Helper to create a sync run record
const createSyncRun = async (studentId, provider, status, message = null, details = {}) => {
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from('sync_runs')
    .insert({
      student_id: studentId,
      provider,
      status,
      message,
      details,
      started_at: new Date().toISOString(),
      finished_at: status === 'success' || status === 'failed' ? new Date().toISOString() : null
    })
    .select()
    .single();
  
  if (error) console.error('Error creating sync run:', error);
  return data;
};

const updateSyncRun = async (syncRunId, status, message = null, details = {}) => {
  if (!supabase || !syncRunId) return null;
  
  const { data, error } = await supabase
    .from('sync_runs')
    .update({
      status,
      message,
      details,
      finished_at: new Date().toISOString()
    })
    .eq('id', syncRunId)
    .select()
    .single();
  
  if (error) console.error('Error updating sync run:', error);
  return data;
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

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }

  try {
    // Check if user already exists by email
    const { data: existingUser } = await supabase
      .from('students')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert new student into Supabase
    const { data: newStudent, error } = await supabase
      .from('students')
      .insert({
        name,
        email,
        password_hash: passwordHash
      })
      .select('id, name, email')
      .single();

    if (error) {
      console.error('Supabase register error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ error: 'User already exists' });
      }
      return res.status(500).json({ error: 'Failed to create user' });
    }

    const token = createAuthToken(newStudent);
    return res.status(201).json({
      token,
      user: { id: newStudent.id, name: newStudent.name, email: newStudent.email }
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post(`${API_PREFIX}/auth/login`, async (req, res) => {
  const email = safeString(req.body?.email).toLowerCase();
  const password = safeString(req.body?.password);

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }

  try {
    // Fetch student from Supabase by email
    const { data: student, error } = await supabase
      .from('students')
      .select('id, name, email, password_hash')
      .eq('email', email)
      .single();

    if (error || !student) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, student.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = createAuthToken(student);
    return res.json({ token, user: { id: student.id, name: student.name, email: student.email } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get(`${API_PREFIX}/graph`, (req, res) => {
  res.json({ nodes: [], edges: [], filters: req.query || {} });
});

app.get(`${API_PREFIX}/graph/search`, (req, res) => {
  res.json({ query: safeString(req.query?.q), results: [] });
});

app.get(`${API_PREFIX}/graph/students`, async (req, res) => {
  if (!supabase) {
    return res.json({ students: [] });
  }

  try {
    const { data: students, error } = await supabase
      .from('students')
      .select('id, name, email');

    if (error) {
      console.error('Error fetching students:', error);
      return res.json({ students: [] });
    }

    res.json({ students: students || [] });
  } catch (err) {
    console.error('Get students error:', err);
    res.json({ students: [] });
  }
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

    const scope = safeString(tokenResponse.data?.scope);
    
    // Store in memory cache
    githubTokensByUserId.set(pendingState.userId, {
      accessToken,
      tokenType: safeString(tokenResponse.data?.token_type) || 'bearer',
      scope,
      createdAt: Date.now()
    });

    // Fetch GitHub user info to store external_user_id and username
    let githubUserInfo = null;
    try {
      const ghClient = githubClient(accessToken);
      const { data } = await ghClient.get('/user');
      githubUserInfo = data;
    } catch (e) {
      console.warn('Could not fetch GitHub user info:', e.message);
    }

    // Store in database
    await saveIntegrationAccount(pendingState.userId, 'github', {
      accessToken,
      externalUserId: githubUserInfo?.id?.toString(),
      externalUsername: githubUserInfo?.login,
      scopes: scope
    });

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

const runGithubSync = async ({ token, limit, includePrivate, studentId }) => {
  const perPage = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const visibility = includePrivate ? 'all' : 'public';
  const client = githubClient(token);

  // Create sync run record
  const syncRun = await createSyncRun(studentId, 'github', 'running', 'Fetching GitHub data...');

  try {
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
    const repoDetailsMap = new Map();

    const repoDetails = await Promise.all(
      repos.map(async (repo) => {
        try {
          const [languagesRes, commitsRes] = await Promise.all([
            client.get(`/repos/${repo.owner.login}/${repo.name}/languages`),
            client.get(`/repos/${repo.owner.login}/${repo.name}/commits`, { params: { per_page: 10 } })
          ]);

          const languages = languagesRes.data || {};
          const commits = Array.isArray(commitsRes.data) ? commitsRes.data : [];
          
          // Store raw data for persistence
          repoDetailsMap.set(repo.id, {
            languages: Object.keys(languages),
            languageBytes: languages,
            commits: commits
          });

          return toRepoSummary(repo, languages, commits.length);
        } catch (error) {
          repoDetailsMap.set(repo.id, { languages: [], languageBytes: {}, commits: [] });
          return toRepoSummary(repo, {}, 0);
        }
      })
    );

    const inferredSkills = inferSkills(repoDetails);
    const githubUser = {
      id: meRes.data?.id,
      login: meRes.data?.login,
      name: meRes.data?.name,
      avatarUrl: meRes.data?.avatar_url,
      profileUrl: meRes.data?.html_url,
      publicRepos: meRes.data?.public_repos,
      followers: meRes.data?.followers,
      following: meRes.data?.following
    };

    // Persist data to Supabase
    let dbStats = { savedRepos: 0, savedSkills: 0, savedProjects: 0, studentSkillsUpdated: 0 };
    if (studentId) {
      dbStats = await persistGithubData(studentId, githubUser, repos, repoDetailsMap, inferredSkills);
    }

    // Update sync run as success
    await updateSyncRun(syncRun?.id, 'success', 'GitHub sync completed successfully', {
      reposFound: repos.length,
      reposSaved: dbStats.savedRepos,
      projectsSaved: dbStats.savedProjects,
      skillsFound: inferredSkills.length,
      skillsSaved: dbStats.savedSkills,
      studentSkillsUpdated: dbStats.studentSkillsUpdated
    });

    return {
      githubUser,
      repositories: repoDetails,
      inferredSkills,
      totals: {
        repositories: repoDetails.length,
        inferredSkills: inferredSkills.length
      },
      dbStats
    };
  } catch (error) {
    // Update sync run as failed
    await updateSyncRun(syncRun?.id, 'failed', error.message || 'GitHub sync failed', {
      error: error.response?.data || error.message
    });
    throw error;
  }
};

app.post(`${API_PREFIX}/integrations/github/oauth/sync`, authGuard, async (req, res) => {
  const token = await getGithubTokenForUser(req.user.id);
  if (!token) {
    return res.status(400).json({
      error: 'No GitHub token found. Connect OAuth first or set GITHUB_TOKEN in .env'
    });
  }

  const studentName = safeString(req.body?.studentName) || req.user.name || 'Unknown Student';
  const includePrivate = Boolean(req.body?.includePrivate);
  const limit = Number(req.body?.limit) || 30;

  try {
    const syncPayload = await runGithubSync({ 
      token, 
      limit, 
      includePrivate, 
      studentId: req.user.id 
    });
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
    const syncPayload = await runGithubSync({ 
      token, 
      limit, 
      includePrivate, 
      studentId: req.user.id 
    });
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
