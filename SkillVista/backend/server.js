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
const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://127.0.0.1:8000';
const DEFAULT_ENTITY_LABELS = ['Language', 'Framework', 'Database', 'CloudService', 'Tool', 'Concept'];

// Temporary in-memory stores for OAuth state (short-lived, don't need DB)
const pendingGithubStates = new Map();
const githubTokensByUserId = new Map();

// Background sync tracking (in-memory, per-user)
const backgroundSyncStatus = new Map(); // userId -> { inProgress: boolean, lastSyncAt: Date, error: string|null }

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
const normalizeEntityText = (value) =>
  safeString(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w.+# -]/g, '');

const nlpClient = axios.create({
  baseURL: NLP_SERVICE_URL,
  timeout: 45000
});

const detectId = (row, candidates) => {
  for (const key of candidates) {
    if (row && row[key] != null) return row[key];
  }
  return null;
};

const labelToNodeType = (label) => {
  const value = safeString(label).toLowerCase();
  if (value === 'language' || value === 'framework') return 'skill';
  if (value === 'database' || value === 'cloudservice' || value === 'tool') return 'technology';
  return 'concept';
};

const resolveAlias = async (text, fallbackType) => {
  const alias = normalizeEntityText(text);
  if (!supabase || !alias) {
    return { canonicalName: safeString(text), targetType: fallbackType };
  }

  const { data, error } = await supabase
    .from('entity_aliases')
    .select('canonical_name, target_type')
    .eq('alias', alias)
    .single();

  if (error || !data) {
    return { canonicalName: safeString(text), targetType: fallbackType };
  }

  return {
    canonicalName: data.canonical_name,
    targetType: data.target_type
  };
};

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

const normalizeSkillToken = (raw) =>
  safeString(raw)
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/[^\w.+#/-]/g, '');

const SKILL_ALIASES = {
  cpp: 'c++',
  'c-plus-plus': 'c++',
  'nodejs': 'node.js',
  'node': 'node.js',
  'vuejs': 'vue.js',
  'reactnative': 'react-native',
  'nextjs': 'next.js',
  'expressjs': 'express',
  'nestjs': 'nest.js',
  'scikitlearn': 'scikit-learn',
  'postgres': 'postgresql',
  'mongo': 'mongodb',
  'jupyter-notebook': 'jupyter',
  'jupyter-nb': 'jupyter',
  'nb': 'notebook',
  'github-actions': 'github-actions',
  cicd: 'ci/cd'
};

const canonicalSkillName = (raw) => {
  const normalized = normalizeSkillToken(raw);
  return SKILL_ALIASES[normalized] || normalized;
};

const inferSkills = (repos) => {
  const counts = new Map();

  const bump = (raw, weight = 1) => {
    const value = canonicalSkillName(raw);
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + weight);
  };

  for (const repo of repos) {
    bump(repo.language, 2);
    if (Array.isArray(repo.languages)) {
      for (const language of repo.languages) bump(language, 2.5);
    }
    if (Array.isArray(repo.topics)) {
      for (const topic of repo.topics) bump(topic, 3);
    }

    const description = `${safeString(repo.name)} ${safeString(repo.description)} ${safeString(repo.fullName)}`.toLowerCase();
    
    // Comprehensive skill keywords from keywords.csv
    const keywords = [
      // Languages
      'javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'c', 'php', 'ruby', 'go',
      'swift', 'kotlin', 'rust', 'scala', 'dart', 'lua', 'r', 'matlab', 'julia', 'perl',
      'haskell', 'elixir', 'clojure', 'erlang', 'f#', 'groovy', 'ocaml', 'assembly', 'cobol',
      'fortran', 'vhdl', 'verilog', 'sql', 'html', 'css', 'sass', 'less', 'xml', 'json',
      'yaml', 'markdown', 'latex', 'bash', 'powershell', 'zsh', 'awk', 'sed',
      
      // Frontend Frameworks
      'react', 'vue', 'vue.js', 'angular', 'next.js', 'nextjs', 'nuxt', 'nuxt.js', 'svelte',
      'sveltekit', 'astro', 'remix', 'solid.js', 'solidjs', 'qwik', 'alpine.js', 'alpinejs',
      'ember', 'ember.js', 'backbone', 'backbone.js', 'jquery', 'bootstrap', 'tailwind',
      'tailwindcss', 'material-ui', 'mui', 'chakra', 'chakra-ui', 'ant-design', 'antd',
      
      // Backend Frameworks
      'node', 'node.js', 'nodejs', 'express', 'express.js', 'expressjs', 'fastify', 'koa',
      'hapi', 'nestjs', 'nest.js', 'django', 'flask', 'fastapi', 'spring', 'spring-boot',
      'springboot', 'rails', 'ruby-on-rails', 'laravel', 'symfony', 'phoenix', 'asp.net',
      'aspnet', '.net', 'dotnet', 'gin', 'echo', 'fiber', 'actix', 'rocket',
      
      // Mobile
      'react-native', 'reactnative', 'flutter', 'swiftui', 'uikit', 'jetpack-compose',
      'xamarin', 'ionic', 'capacitor', 'nativescript', 'expo',
      
      // AI/ML
      'tensorflow', 'pytorch', 'scikit-learn', 'sklearn', 'keras', 'huggingface',
      'hugging-face', 'opencv', 'numpy', 'pandas', 'matplotlib', 'seaborn', 'plotly',
      'jupyter', 'nltk', 'spacy', 'langchain', 'openai', 'gpt', 'llm', 'stable-diffusion',
      'mlflow', 'machine-learning', 'deep-learning', 'neural-network', 'ai', 'ml',
      
      // Databases
      'postgresql', 'postgres', 'mysql', 'mariadb', 'sqlite', 'oracle', 'sql-server',
      'sqlserver', 'mongodb', 'dynamodb', 'cassandra', 'couchdb', 'neo4j', 'influxdb',
      'timescaledb', 'cockroachdb', 'fauna', 'planetscale', 'supabase', 'firebase',
      
      // Caching & Messaging
      'redis', 'memcached', 'rabbitmq', 'kafka', 'celery', 'bull', 'zeromq',
      
      // ORMs & APIs
      'graphql', 'apollo', 'prisma', 'hasura', 'typeorm', 'sequelize', 'mongoose',
      'hibernate', 'sqlalchemy', 'drizzle', 'kysely', 'rest', 'restful', 'grpc',
      
      // Cloud Platforms
      'aws', 'amazon-web-services', 'azure', 'gcp', 'google-cloud', 'firebase', 'appwrite',
      'cloudflare', 'cloudflare-workers', 'deno', 'vercel', 'netlify', 'heroku',
      'digitalocean', 'linode', 'render', 'railway',
      
      // Containers & Virtualization
      'docker', 'kubernetes', 'k8s', 'podman', 'vagrant', 'vmware', 'hyper-v',
      
      // Infrastructure as Code
      'terraform', 'ansible', 'puppet', 'chef', 'pulumi',
      
      // CI/CD
      'jenkins', 'github-actions', 'gitlab-ci', 'circleci', 'travis-ci', 'argocd', 'argo',
      
      // Web Servers & Proxies
      'nginx', 'apache', 'caddy', 'traefik', 'kong', 'haproxy',
      
      // Testing
      'jest', 'mocha', 'jasmine', 'cypress', 'playwright', 'puppeteer', 'selenium',
      'webdriverio', 'vitest', 'testing-library', 'pytest', 'junit', 'rspec',
      
      // Build Tools
      'webpack', 'vite', 'esbuild', 'rollup', 'parcel', 'gulp', 'grunt', 'npm', 'yarn',
      'pnpm', 'bun', 'turbo', 'turborepo',
      
      // Version Control
      'git', 'github', 'gitlab', 'bitbucket',
      
      // Search
      'elasticsearch', 'elastic', 'algolia', 'meilisearch', 'solr',
      
      // Payments & Auth
      'stripe', 'paypal', 'square', 'auth0', 'okta', 'clerk', 'cognito', 'keycloak',
      
      // Communication Services
      'twilio', 'sendgrid', 'mailchimp', 'ses',
      
      // Mapping
      'openstreetmap', 'mapbox', 'leaflet', 'google-maps',
      
      // Web Technologies
      'webassembly', 'wasm', 'webrtc', 'webgl', 'three.js', 'threejs', 'd3', 'd3.js',
      'chart.js', 'chartjs', 'websocket', 'socket.io', 'socketio',
      
      // IoT
      'arduino', 'raspberry-pi', 'raspberrypi', 'esp32', 'mqtt', 'iot',
      
      // Big Data
      'spark', 'hadoop', 'hive', 'flink', 'airflow', 'snowflake', 'databricks',
      'tableau', 'power-bi', 'powerbi', 'looker',
      
      // Monitoring & Observability
      'sonarqube', 'sentry', 'newrelic', 'datadog', 'splunk', 'elk', 'logstash',
      'kibana', 'prometheus', 'grafana', 'nagios', 'zabbix',
      
      // Service Mesh & K8s Tools
      'helm', 'istio', 'linkerd', 'openshift',
      
      // Security
      'oauth', 'jwt', 'ssl', 'tls', 'https', 'encryption', 'security', 'pentesting',
      'owasp', 'vault', 'burp-suite',
      
      // Architecture
      'microservices', 'monolith', 'serverless', 'event-driven', 'lambda', 'functions',
      
      // Methodologies
      'tdd', 'ddd', 'oop', 'functional', 'agile', 'scrum', 'kanban', 'devops', 'sre',
      'gitflow', 'cicd', 'ci/cd'
    ];

    for (const keyword of keywords) {
      if (description.includes(keyword)) bump(keyword, 1);
    }
  }

  const WEAK_GENERIC_TERMS = new Set(['ai', 'ml', 'llm', 'gpt', 'github', 'gitlab', 'bitbucket', 'rest', 'restful']);
  const HARD_BLOCK_TERMS = new Set([
    'ai',
    'llm',
    'gpt',
    'jupyter',
    'notebook',
    'jupyter-nb',
    'github',
    'gitlab',
    'bitbucket',
    'api',
    'apis'
  ]);
  const CORE_KEEP = new Set(['mongodb', 'fastapi', 'git', 'docker', 'kubernetes', 'postgresql', 'mysql', 'redis']);

  const ranked = [...counts.entries()]
    .filter(([skill, score]) => {
      if (HARD_BLOCK_TERMS.has(skill)) return false;
      if (CORE_KEEP.has(skill)) return true;
      if (WEAK_GENERIC_TERMS.has(skill)) return score >= 4;
      return score >= 1.5;
    })
    .map(([skill, score]) => ({ skill, score }))
    .sort((a, b) => b.score - a.score);

  // Keep results rich; if strict filters produce too few, backfill with best non-noisy skills.
  if (ranked.length < 30) {
    const existing = new Set(ranked.map((item) => item.skill));
    const backfill = [...counts.entries()]
      .filter(([skill, score]) => {
        if (existing.has(skill)) return false;
        if (HARD_BLOCK_TERMS.has(skill)) return false;
        if (skill.length < 2) return false;
        return score >= 1;
      })
      .map(([skill, score]) => ({ skill, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30 - ranked.length);
    ranked.push(...backfill);
  }

  return ranked.slice(0, 80);
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
    .select('*')
    .eq('name', name)
    .single();
  
  if (existing) return { ...existing, id: detectId(existing, ['skill_id', 'id']) };
  
  // Create new
  const { data: created, error } = await supabase
    .from('skills')
    .insert({ name })
    .select('*')
    .single();
  
  if (error && error.code === '23505') {
    // Unique constraint - try to fetch again
    const { data } = await supabase.from('skills').select('*').eq('name', name).single();
    return data ? { ...data, id: detectId(data, ['skill_id', 'id']) } : null;
  }
  
  return created ? { ...created, id: detectId(created, ['skill_id', 'id']) } : null;
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
    .select('*')
    .eq('name', name)
    .single();
  
  if (existing) return { ...existing, id: detectId(existing, ['id', 'technology_id']) };
  
  const { data: created, error } = await supabase
    .from('technologies')
    .insert({ name })
    .select('*')
    .single();
  
  if (error && error.code === '23505') {
    const { data } = await supabase.from('technologies').select('*').eq('name', name).single();
    return data ? { ...data, id: detectId(data, ['id', 'technology_id']) } : null;
  }
  
  return created ? { ...created, id: detectId(created, ['id', 'technology_id']) } : null;
};

const getOrCreateConcept = async (conceptName) => {
  if (!supabase || !conceptName) return null;

  const name = conceptName.toLowerCase().trim();
  const { data: existing } = await supabase
    .from('concepts')
    .select('*')
    .eq('name', name)
    .single();

  if (existing) return { ...existing, id: detectId(existing, ['id', 'concept_id']) };

  const { data: created, error } = await supabase
    .from('concepts')
    .insert({ name })
    .select('*')
    .single();

  if (error && error.code === '23505') {
    const { data } = await supabase.from('concepts').select('*').eq('name', name).single();
    return data ? { ...data, id: detectId(data, ['id', 'concept_id']) } : null;
  }

  return created ? { ...created, id: detectId(created, ['id', 'concept_id']) } : null;
};

const upsertEmbeddingByType = async (targetType, id, embedding) => {
  if (!supabase || !id || !Array.isArray(embedding) || !embedding.length) return;
  const table = targetType === 'skill' ? 'skills' : targetType === 'technology' ? 'technologies' : 'concepts';
  const idColumn = targetType === 'skill' ? 'skill_id' : 'id';
  await supabase
    .from(table)
    .update({ embedding_384: embedding })
    .eq(idColumn, id);
};

const getOrCreateNodeByType = async (targetType, name) => {
  if (targetType === 'skill') return getOrCreateSkill(name);
  if (targetType === 'technology') return getOrCreateTechnology(name);
  return getOrCreateConcept(name);
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
  const inferredSet = new Set(inferredSkills.map((s) => canonicalSkillName(s.skill)));
  
  // Calculate skill metrics from all repos
  const skillMetrics = new Map();
  
  for (const skillData of inferredSkills) {
    const skillName = canonicalSkillName(skillData.skill);
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
      const repoText = `${safeString(repo.name)} ${safeString(repo.description)} ${safeString(repo.full_name)}`.toLowerCase();
      const normalizedSkill = canonicalSkillName(skillName);
      
      // Check if this skill/language is used in this repo
      const isLanguageMatch = Object.keys(repoLanguages).some(
        lang => canonicalSkillName(lang) === normalizedSkill
      );
      const isTopicMatch = (repo.topics || []).some(
        t => canonicalSkillName(t) === normalizedSkill
      );
      const isDescriptionMatch = repoText.includes(normalizedSkill.replace(/-/g, ' ')) || repoText.includes(normalizedSkill);
      
      if (isLanguageMatch || isTopicMatch || isDescriptionMatch) {
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
    
    const proficiencyScore = Math.min((usageScore + volumeScore + qualityScore) / 100, 1);
    
    // Calculate confidence score (0-100)
    // Higher confidence with more data points
    const dataPoints = repoCount + totalCommits;
    const confidenceScore = Math.min((dataPoints * 5) / 100, 1);
    
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

  // Remove stale generic labels if they are not currently inferred.
  const genericNoiseSkills = ['ai', 'ml', 'llm', 'gpt', 'jupyter', 'notebook', 'jupyter-nb', 'api', 'apis'];
  for (const label of genericNoiseSkills) {
    if (inferredSet.has(label)) continue;
    try {
      const noiseSkill = await getOrCreateSkill(label);
      if (!noiseSkill?.id) continue;
      await supabase
        .from('student_skills')
        .delete()
        .eq('student_id', studentId)
        .eq('skill_id', noiseSkill.id);
    } catch (err) {
      console.error(`Error removing stale generic skill ${label}:`, err);
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
              watchers: repo.watchers_count,
              language: repo.language,
              topics: repo.topics,
              private: repo.private,
              pushed_at: repo.pushed_at,
              created_at: repo.created_at,
              open_issues: repo.open_issues_count,
              default_branch: repo.default_branch,
              full_name: repo.full_name
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

// ============================================
// 🚀 GITHUB STATUS & BACKGROUND SYNC ENDPOINTS
// ============================================

// Quick check if GitHub is already connected (no loading, instant response)
app.get(`${API_PREFIX}/integrations/github/status`, authGuard, async (req, res) => {
  try {
    const token = await getGithubTokenForUser(req.user.id);
    const isConnected = Boolean(token);
    
    // Get last sync info from database
    let lastSync = null;
    let githubUsername = null;
    
    if (supabase && isConnected) {
      // Get integration account info
      const { data: integration } = await supabase
        .from('integration_accounts')
        .select('external_username, connected_at, updated_at')
        .eq('student_id', req.user.id)
        .eq('provider', 'github')
        .single();
      
      if (integration) {
        githubUsername = integration.external_username;
      }
      
      // Get last successful sync
      const { data: syncRun } = await supabase
        .from('sync_runs')
        .select('finished_at, details')
        .eq('student_id', req.user.id)
        .eq('provider', 'github')
        .eq('status', 'success')
        .order('finished_at', { ascending: false })
        .limit(1)
        .single();
      
      if (syncRun) {
        lastSync = {
          at: syncRun.finished_at,
          details: syncRun.details
        };
      }
    }
    
    // Check background sync status
    const bgStatus = backgroundSyncStatus.get(req.user.id);
    
    return res.json({
      connected: isConnected,
      githubUsername,
      lastSync,
      backgroundSync: bgStatus || { inProgress: false, lastSyncAt: null, error: null }
    });
  } catch (err) {
    console.error('GitHub status check error:', err);
    return res.json({ connected: false, githubUsername: null, lastSync: null, backgroundSync: { inProgress: false } });
  }
});

// Get cached GitHub data from database (instant, no GitHub API calls)
app.get(`${API_PREFIX}/integrations/github/data`, authGuard, async (req, res) => {
  if (!supabase) {
    return res.json({ 
      repositories: [], 
      skills: [], 
      projects: [],
      githubUser: null,
      cached: true,
      message: 'Database not configured'
    });
  }
  
  try {
    // Fetch all stored data in parallel
    const [reposResult, skillsResult, projectsResult, integrationResult] = await Promise.all([
      // GitHub repos
      supabase
        .from('github_repos')
        .select(`
          id, name, full_name, description, html_url, is_private, language, topics,
          stars, forks, watchers, pushed_at, repo_updated_at, last_synced_at
        `)
        .eq('student_id', req.user.id)
        .order('pushed_at', { ascending: false }),
      
      // Student skills with proficiency
      supabase
        .from('student_skills')
        .select(`
          proficiency_score, confidence_score, usage_count, last_used,
          skill:skills(id, name)
        `)
        .eq('student_id', req.user.id)
        .order('proficiency_score', { ascending: false }),
      
      // Projects with linked skills
      supabase
        .from('projects')
        .select('id, name, description, url, metadata, last_synced_at, project_skills(skill:skills(name))')
        .eq('student_id', req.user.id)
        .order('last_synced_at', { ascending: false }),
      
      // GitHub integration info
      supabase
        .from('integration_accounts')
        .select('external_username, external_user_id')
        .eq('student_id', req.user.id)
        .eq('provider', 'github')
        .single()
    ]);
    
    const repositories = reposResult.data || [];
    const skills = (skillsResult.data || []).map(s => ({
      skill: s.skill?.name,
      proficiencyScore: s.proficiency_score,
      confidenceScore: s.confidence_score,
      usageCount: s.usage_count,
      lastUsed: s.last_used
    }));
    const projects = projectsResult.data || [];
    
    // Get GitHub user info if available
    let githubUser = null;
    if (integrationResult.data) {
      githubUser = {
        login: integrationResult.data.external_username,
        id: integrationResult.data.external_user_id
      };
    }
    
    // Check if background sync is in progress
    const bgStatus = backgroundSyncStatus.get(req.user.id);
    
    return res.json({
      repositories,
      skills,
      projects,
      githubUser,
      totals: {
        repositories: repositories.length,
        skills: skills.length,
        projects: projects.length
      },
      cached: true,
      syncInProgress: bgStatus?.inProgress || false,
      lastSyncAt: bgStatus?.lastSyncAt || null
    });
  } catch (err) {
    console.error('Error fetching cached GitHub data:', err);
    return res.status(500).json({ error: 'Failed to fetch cached data' });
  }
});

// Trigger background sync (returns immediately, sync happens in background)
app.post(`${API_PREFIX}/integrations/github/background-sync`, authGuard, async (req, res) => {
  const token = await getGithubTokenForUser(req.user.id);
  if (!token) {
    return res.status(400).json({
      error: 'GitHub not connected',
      needsAuth: true
    });
  }
  
  const userId = req.user.id;
  
  // Check if sync is already in progress
  const currentStatus = backgroundSyncStatus.get(userId);
  if (currentStatus?.inProgress) {
    return res.json({
      started: false,
      message: 'Sync already in progress',
      status: currentStatus
    });
  }
  
  // Mark sync as in progress
  backgroundSyncStatus.set(userId, {
    inProgress: true,
    startedAt: new Date().toISOString(),
    lastSyncAt: currentStatus?.lastSyncAt || null,
    error: null
  });
  
  // Return immediately to client
  res.json({
    started: true,
    message: 'Background sync started',
    status: backgroundSyncStatus.get(userId)
  });
  
  // Run sync in background (don't await)
  const includePrivate = Boolean(req.body?.includePrivate);
  const limit = Number(req.body?.limit) || 50;
  
  runGithubSync({
    token,
    limit,
    includePrivate,
    studentId: userId
  })
    .then(() => {
      backgroundSyncStatus.set(userId, {
        inProgress: false,
        lastSyncAt: new Date().toISOString(),
        error: null
      });
      console.log(`Background sync completed for user ${userId}`);
    })
    .catch((error) => {
      backgroundSyncStatus.set(userId, {
        inProgress: false,
        lastSyncAt: backgroundSyncStatus.get(userId)?.lastSyncAt || null,
        error: error.message || 'Sync failed'
      });
      console.error(`Background sync failed for user ${userId}:`, error.message);
    });
});

// Get background sync status
app.get(`${API_PREFIX}/integrations/github/sync-status`, authGuard, (req, res) => {
  const status = backgroundSyncStatus.get(req.user.id) || {
    inProgress: false,
    lastSyncAt: null,
    error: null
  };
  return res.json(status);
});

// 🔥 APP STARTUP ENDPOINT: Check connection, return cached data, auto-sync if needed
// Call this when app opens - it returns immediately with cached data and syncs in background
app.get(`${API_PREFIX}/integrations/github/auto-sync`, authGuard, async (req, res) => {
  const userId = req.user.id;
  const token = await getGithubTokenForUser(userId);
  
  // If not connected, return early
  if (!token) {
    return res.json({
      connected: false,
      needsAuth: true,
      repositories: [],
      skills: [],
      projects: [],
      githubUser: null
    });
  }
  
  // Get cached data from database immediately
  let repositories = [];
  let skills = [];
  let projects = [];
  let githubUser = null;
  
  if (supabase) {
    try {
      const [reposResult, skillsResult, projectsResult, integrationResult] = await Promise.all([
        supabase
          .from('github_repos')
          .select('id, name, full_name, description, html_url, is_private, language, topics, stars, forks, pushed_at')
          .eq('student_id', userId)
          .order('pushed_at', { ascending: false }),
        
        supabase
          .from('student_skills')
          .select('proficiency_score, confidence_score, usage_count, last_used, skill:skills(id, name)')
          .eq('student_id', userId)
          .order('proficiency_score', { ascending: false }),
        
        supabase
          .from('projects')
          .select('id, name, description, url, metadata')
          .eq('student_id', userId)
          .order('last_synced_at', { ascending: false }),
        
        supabase
          .from('integration_accounts')
          .select('external_username, external_user_id')
          .eq('student_id', userId)
          .eq('provider', 'github')
          .single()
      ]);
      
      repositories = reposResult.data || [];
      skills = (skillsResult.data || []).map(s => ({
        skill: s.skill?.name,
        proficiencyScore: s.proficiency_score,
        confidenceScore: s.confidence_score,
        usageCount: s.usage_count,
        lastUsed: s.last_used
      }));
      projects = projectsResult.data || [];
      
      if (integrationResult.data) {
        githubUser = {
          login: integrationResult.data.external_username,
          id: integrationResult.data.external_user_id
        };
      }
    } catch (err) {
      console.error('Error fetching cached data for auto-sync:', err);
    }
  }
  
  // Check if we should trigger background sync
  const currentStatus = backgroundSyncStatus.get(userId);
  const lastSyncTime = currentStatus?.lastSyncAt ? new Date(currentStatus.lastSyncAt) : null;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  let syncTriggered = false;
  
  // Trigger sync if: not already running AND (never synced OR last sync > 5 min ago)
  if (!currentStatus?.inProgress && (!lastSyncTime || lastSyncTime < fiveMinutesAgo)) {
    syncTriggered = true;
    
    // Mark sync as in progress
    backgroundSyncStatus.set(userId, {
      inProgress: true,
      startedAt: new Date().toISOString(),
      lastSyncAt: currentStatus?.lastSyncAt || null,
      error: null
    });
    
    // Run sync in background (don't await)
    runGithubSync({
      token,
      limit: 50,
      includePrivate: true,
      studentId: userId
    })
      .then(() => {
        backgroundSyncStatus.set(userId, {
          inProgress: false,
          lastSyncAt: new Date().toISOString(),
          error: null
        });
        console.log(`Auto background sync completed for user ${userId}`);
      })
      .catch((error) => {
        backgroundSyncStatus.set(userId, {
          inProgress: false,
          lastSyncAt: backgroundSyncStatus.get(userId)?.lastSyncAt || null,
          error: error.message || 'Sync failed'
        });
        console.error(`Auto background sync failed for user ${userId}:`, error.message);
      });
  }
  
  // Return cached data immediately
  return res.json({
    connected: true,
    needsAuth: false,
    repositories,
    skills,
    projects,
    githubUser,
    totals: {
      repositories: repositories.length,
      skills: skills.length,
      projects: projects.length
    },
    syncStatus: {
      triggered: syncTriggered,
      inProgress: currentStatus?.inProgress || syncTriggered,
      lastSyncAt: currentStatus?.lastSyncAt || null
    }
  });
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

const fetchEntitiesFromNlp = async (text, labels = DEFAULT_ENTITY_LABELS) => {
  const { data } = await nlpClient.post('/extract/entities', { text, labels });
  return Array.isArray(data?.entities) ? data.entities : [];
};

const fetchEmbeddingFromNlp = async (text) => {
  const { data } = await nlpClient.post('/embed', { text });
  return Array.isArray(data?.embedding) ? data.embedding : [];
};

const createCooccurrenceEdges = async (nodes) => {
  if (!supabase || nodes.length < 2) return;

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      if (!a?.id || !b?.id || !a?.targetType || !b?.targetType) continue;
      // eslint-disable-next-line no-await-in-loop
      await supabase.from('knowledge_edges').insert({
        source_id: a.id,
        target_id: b.id,
        source_type: a.targetType,
        target_type: b.targetType,
        relation_type: 'RELATED_TO',
        weight: 1
      });
    }
  }
};

const runIntelligencePipeline = async ({
  studentId,
  provider = 'manual',
  sourceTable = 'notion_pages',
  sourcePk = 'manual',
  sourceText,
  projectId = null
}) => {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!sourceText || !safeString(sourceText)) throw new Error('sourceText is required.');

  const { data: runRow, error: runInsertError } = await supabase
    .from('intelligence_runs')
    .insert({
      student_id: studentId,
      provider,
      status: 'running',
      started_at: new Date().toISOString()
    })
    .select('id')
    .single();

  if (runInsertError) {
    throw new Error(`Failed to create intelligence run: ${runInsertError.message}`);
  }

  const runId = runRow.id;

  try {
    const entities = await fetchEntitiesFromNlp(sourceText);
    const linkedNodes = [];
    let processed = 0;

    for (const entity of entities) {
      const extractedText = safeString(entity?.text);
      if (!extractedText) continue;

      const initialType = labelToNodeType(entity?.label);
      // eslint-disable-next-line no-await-in-loop
      const alias = await resolveAlias(extractedText, initialType);
      const canonicalName = safeString(alias.canonicalName || extractedText);
      const targetType = alias.targetType || initialType;

      // eslint-disable-next-line no-await-in-loop
      const node = await getOrCreateNodeByType(targetType, canonicalName);
      if (!node || !node.id) continue;

      // eslint-disable-next-line no-await-in-loop
      const embedding = await fetchEmbeddingFromNlp(canonicalName);
      // eslint-disable-next-line no-await-in-loop
      await upsertEmbeddingByType(targetType, node.id, embedding);

      // eslint-disable-next-line no-await-in-loop
      await supabase.from('entity_mentions').insert({
        student_id: studentId,
        project_id: projectId,
        source_table: sourceTable,
        source_pk: String(sourcePk),
        source_text: sourceText,
        extracted_text: extractedText,
        normalized_text: canonicalName,
        target_type: targetType,
        target_id: node.id,
        label: safeString(entity?.label) || null,
        extraction_confidence: entity?.score ?? null,
        metadata: {
          start: entity?.start ?? null,
          end: entity?.end ?? null,
          run_id: runId
        }
      });

      if (targetType === 'skill') {
        // eslint-disable-next-line no-await-in-loop
        await supabase.from('student_skill_evidence').insert({
          student_id: studentId,
          skill_id: node.id,
          evidence_type: provider === 'github' ? 'github_repo' : provider === 'certification' ? 'certification' : 'notion_page',
          evidence_ref: String(sourcePk),
          weight: Number(entity?.score ?? 0.75),
          metadata: {
            source_table: sourceTable,
            label: safeString(entity?.label)
          }
        });
      }

      if (projectId) {
        if (targetType === 'skill') {
          // eslint-disable-next-line no-await-in-loop
          await linkProjectSkill(projectId, node.id, 1);
        } else if (targetType === 'technology') {
          // eslint-disable-next-line no-await-in-loop
          await linkProjectTechnology(projectId, node.id);
        } else {
          // eslint-disable-next-line no-await-in-loop
          await supabase.from('project_concepts').upsert(
            { project_id: projectId, concept_id: node.id },
            { onConflict: 'project_id,concept_id' }
          );
        }
      }

      linkedNodes.push({ id: node.id, targetType });
      processed += 1;
    }

    await createCooccurrenceEdges(linkedNodes);
    await supabase.rpc('recompute_student_skill_scores', { input_student_id: studentId });
    await supabase
      .from('intelligence_runs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        stats: { processed_entities: processed }
      })
      .eq('id', runId);

    return { runId, processed };
  } catch (error) {
    await supabase
      .from('intelligence_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: error.message || 'Intelligence pipeline failed'
      })
      .eq('id', runId);
    throw error;
  }
};

const enqueueSyncJob = async ({ studentId, provider, payload }) => {
  const { data, error } = await supabase
    .from('sync_queue')
    .insert({
      student_id: studentId,
      provider,
      payload: payload || {},
      status: 'queued'
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to enqueue job: ${error.message}`);
  return data;
};

const runQueueWorkerOnce = async () => {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data: queuedJobs, error: queuedError } = await supabase
    .from('sync_queue')
    .select('*')
    .eq('status', 'queued')
    .lte('next_run_at', new Date().toISOString())
    .order('next_run_at', { ascending: true })
    .limit(1);

  if (queuedError) throw new Error(`Failed to poll queue: ${queuedError.message}`);
  if (!queuedJobs || !queuedJobs.length) return { processed: false, reason: 'no queued jobs' };

  const job = queuedJobs[0];
  const attempts = Number(job.attempts || 0) + 1;

  await supabase
    .from('sync_queue')
    .update({ status: 'running', attempts, locked_at: new Date().toISOString() })
    .eq('id', job.id);

  try {
    const payload = job.payload || {};
    const sourceText =
      payload.sourceText || [payload.title, payload.description, payload.readme, payload.tags].filter(Boolean).join('\n');

    await runIntelligencePipeline({
      studentId: job.student_id,
      provider: job.provider,
      sourceTable: payload.sourceTable || (job.provider === 'github' ? 'github_repos' : 'notion_pages'),
      sourcePk: String(payload.sourcePk || payload.repoId || payload.pageId || job.id),
      sourceText,
      projectId: payload.projectId || null
    });

    await supabase
      .from('sync_queue')
      .update({ status: 'success', last_error: null })
      .eq('id', job.id);

    return { processed: true, jobId: job.id, status: 'success' };
  } catch (error) {
    const maxAttempts = Number(job.max_attempts || 5);
    const exhausted = attempts >= maxAttempts;
    await supabase
      .from('sync_queue')
      .update({
        status: exhausted ? 'dead' : 'failed',
        last_error: error.message || 'Queue worker failed',
        next_run_at: exhausted ? job.next_run_at : new Date(Date.now() + 5 * 60 * 1000).toISOString()
      })
      .eq('id', job.id);
    return {
      processed: true,
      jobId: job.id,
      status: exhausted ? 'dead' : 'failed',
      error: error.message || 'Queue worker failed'
    };
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

app.post(`${API_PREFIX}/intelligence/extract`, authGuard, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase is not configured.' });
    }

    const studentId = Number(req.body?.studentId);
    const provider = safeString(req.body?.provider) || 'manual';
    const sourceTable = safeString(req.body?.sourceTable) || 'notion_pages';
    const sourcePk = safeString(req.body?.sourcePk) || crypto.randomUUID();
    const sourceText = safeString(req.body?.sourceText);
    const projectIdRaw = req.body?.projectId;
    const projectId = projectIdRaw == null ? null : Number(projectIdRaw);

    if (!studentId || !sourceText) {
      return res.status(400).json({ error: 'studentId and sourceText are required.' });
    }

    const result = await runIntelligencePipeline({
      studentId,
      provider,
      sourceTable,
      sourcePk,
      sourceText,
      projectId
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    return res.status(502).json({
      error: 'Intelligence extraction failed',
      details: error.message
    });
  }
});

app.post(`${API_PREFIX}/sync/queue`, authGuard, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase is not configured.' });
    }

    const studentId = Number(req.body?.studentId);
    const provider = safeString(req.body?.provider);
    const payload = req.body?.payload || {};

    if (!studentId || !provider) {
      return res.status(400).json({ error: 'studentId and provider are required.' });
    }

    const job = await enqueueSyncJob({ studentId, provider, payload });
    return res.status(201).json({ queued: true, job });
  } catch (error) {
    return res.status(502).json({ error: 'Failed to enqueue sync job', details: error.message });
  }
});

app.post(`${API_PREFIX}/sync/worker/run-once`, authGuard, async (req, res) => {
  try {
    const result = await runQueueWorkerOnce();
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ error: 'Sync worker execution failed', details: error.message });
  }
});

app.post(`${API_PREFIX}/search/semantic`, authGuard, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase is not configured.' });
    }
    const text = safeString(req.body?.text);
    const matchThreshold = Number(req.body?.threshold ?? 0.55);
    const matchCount = Number(req.body?.count ?? 20);
    if (!text) return res.status(400).json({ error: 'text is required' });

    const embedding = await fetchEmbeddingFromNlp(text);
    const { data, error } = await supabase.rpc('match_knowledge_nodes', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: matchCount
    });

    if (error) throw new Error(error.message);
    return res.json({ query: text, results: data || [] });
  } catch (error) {
    return res.status(502).json({ error: 'Semantic search failed', details: error.message });
  }
});

app.get(`${API_PREFIX}/students/:studentId/skills`, authGuard, async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Supabase is not configured.' });
    const studentId = Number(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Invalid studentId' });

    const { data, error } = await supabase
      .from('student_skills')
      .select('student_id, skill_id, proficiency_score, confidence_score, usage_count, last_used, skills(*)')
      .eq('student_id', studentId)
      .order('proficiency_score', { ascending: false });

    if (error) throw new Error(error.message);
    return res.json({ studentId, skills: data || [] });
  } catch (error) {
    return res.status(502).json({ error: 'Failed to fetch student skills', details: error.message });
  }
});

app.get(`${API_PREFIX}/students/:studentId/graph`, authGuard, async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Supabase is not configured.' });
    const studentId = Number(req.params.studentId);
    const depth = Number(req.query.depth || 2);
    const seedLimit = Math.min(Math.max(Number(req.query.seedLimit || 40), 5), 100);
    if (!studentId) return res.status(400).json({ error: 'Invalid studentId' });

    const { data: seedSkills, error: skillError } = await supabase
      .from('student_skills')
      .select('skill_id, skills(name)')
      .eq('student_id', studentId)
      .order('proficiency_score', { ascending: false })
      .limit(seedLimit);

    if (skillError) throw new Error(skillError.message);
    const blockedSeedSkills = new Set(['ai', 'ml', 'llm', 'gpt', 'jupyter', 'jupyter-nb', 'notebook', 'api', 'apis']);
    const filteredSeedSkills = (seedSkills || []).filter(
      (row) => !blockedSeedSkills.has((row.skills?.name || '').toLowerCase().trim())
    );

    const edges = [];
    for (const skill of filteredSeedSkills) {
      // eslint-disable-next-line no-await-in-loop
      const { data: traversal, error } = await supabase.rpc('get_related_nodes', {
        input_source_id: skill.skill_id,
        input_source_type: 'skill',
        max_depth: depth,
        max_rows: 200
      });
      if (error) throw new Error(error.message);
      edges.push(...(traversal || []));
    }

    return res.json({ studentId, depth, seedSkills: filteredSeedSkills, edges });
  } catch (error) {
    return res.status(502).json({ error: 'Failed to fetch graph', details: error.message });
  }
});

app.get(`${API_PREFIX}/students/:studentId/recommendations`, authGuard, async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Supabase is not configured.' });
    const studentId = Number(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: 'Invalid studentId' });

    const { data: weakSkills, error: weakError } = await supabase
      .from('student_skills')
      .select('skill_id, proficiency_score, confidence_score, skills(name)')
      .eq('student_id', studentId)
      .order('proficiency_score', { ascending: true })
      .limit(5);

    if (weakError) throw new Error(weakError.message);
    const weakSkillIds = (weakSkills || []).map((item) => item.skill_id);

    let conceptSuggestions = [];
    if (weakSkillIds.length) {
      const { data, error } = await supabase
        .from('knowledge_edges')
        .select('target_id, target_type, relation_type, weight')
        .eq('source_type', 'skill')
        .in('source_id', weakSkillIds)
        .in('relation_type', ['DEPENDS_ON', 'RELATED_TO'])
        .limit(50);

      if (error) throw new Error(error.message);
      const conceptIds = [...new Set((data || []).filter((row) => row.target_type === 'concept').map((row) => row.target_id))];
      if (conceptIds.length) {
        const conceptsResult = await supabase.from('concepts').select('id, name').in('id', conceptIds).limit(10);
        if (conceptsResult.error) throw new Error(conceptsResult.error.message);
        conceptSuggestions = conceptsResult.data || [];
      }
    }

    return res.json({
      studentId,
      skillGaps: weakSkills || [],
      suggestedConcepts: conceptSuggestions
    });
  } catch (error) {
    return res.status(502).json({ error: 'Failed to build recommendations', details: error.message });
  }
});

app.post(`${API_PREFIX}/integrations/notion/sync`, authGuard, async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Supabase is not configured.' });
    const studentId = Number(req.body?.studentId);
    const sourceText = safeString(req.body?.sourceText || req.body?.content);
    if (!studentId || !sourceText) {
      return res.status(400).json({ error: 'studentId and sourceText/content are required.' });
    }

    const job = await enqueueSyncJob({
      studentId,
      provider: 'notion',
      payload: {
        sourceTable: 'notion_pages',
        sourcePk: safeString(req.body?.sourcePk) || crypto.randomUUID(),
        sourceText,
        tags: req.body?.tags || null
      }
    });

    return res.status(202).json({ queued: true, provider: 'notion', job });
  } catch (error) {
    return res.status(502).json({ error: 'Notion sync enqueue failed', details: error.message });
  }
});

app.post(`${API_PREFIX}/integrations/certifications/sync`, authGuard, async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Supabase is not configured.' });
    const studentId = Number(req.body?.studentId);
    const sourceText = safeString(req.body?.sourceText || `${req.body?.name || ''} ${req.body?.issuer || ''}`);
    if (!studentId || !sourceText) {
      return res.status(400).json({ error: 'studentId and sourceText/name+issuer are required.' });
    }

    const job = await enqueueSyncJob({
      studentId,
      provider: 'certification',
      payload: {
        sourceTable: 'certifications',
        sourcePk: safeString(req.body?.sourcePk) || crypto.randomUUID(),
        sourceText,
        metadata: req.body?.metadata || {}
      }
    });

    return res.status(202).json({ queued: true, provider: 'certification', job });
  } catch (error) {
    return res.status(502).json({ error: 'Certification sync enqueue failed', details: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SkillVista backend running on http://localhost:${PORT}${API_PREFIX}`);
});
