import AsyncStorage from '@react-native-async-storage/async-storage';
import { appEnv } from '@/config/env';

const API_BASE_URL = 'https://skillvista-1.onrender.com/api';
const AUTH_TOKEN_KEY = 'skillvista.auth.token';
const USER_DATA_KEY = 'skillvista.user.data';

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  avatarUrl: string;
  profileUrl: string;
  publicRepos: number;
  followers: number;
  following: number;
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  stars: number;
  language: string;
  languages: string[];
  topics: string[];
  updatedAt: string;
}

export interface SkillInference {
  skill: string;
  score: number;
}

export interface GitHubSyncResponse {
  provider: string;
  studentName: string;
  syncedAt: string;
  source: string;
  githubUser: GitHubUser;
  repositories: GitHubRepository[];
  inferredSkills: SkillInference[];
  totals: {
    repositories: number;
    inferredSkills: number;
  };
}

class SkillVistaAPI {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (typeof options.headers === 'object' && options.headers !== null) {
      Object.assign(headers, options.headers);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const text = await response.text();
      
      if (!response.ok) {
        try {
          const error = JSON.parse(text);
          const err: any = new Error(error.error || `API error: ${response.status}`);
          err.needsOAuth = error.needsOAuth;
          throw err;
        } catch (parseError) {
          if ((parseError as Error).message.includes('needsOAuth')) throw parseError;
          throw new Error(`Server error (${response.status}): ${text || 'No response body'}`);
        }
      }

      if (!text) {
        throw new Error('Empty response from server');
      }

      try {
        return JSON.parse(text);
      } catch (parseError) {
        console.error('JSON parse error:', parseError, 'Response:', text);
        throw new Error('Invalid response format from server');
      }
    } catch (error: any) {
      console.error('API request error:', error);
      throw error;
    }
  }

  async health() {
    return this.request('/health');
  }

  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });

    // Store token
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, response.token);
    await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(response.user));

    return response;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Store token
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, response.token);
    await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(response.user));

    return response;
  }

  async getGithubOAuthUrl(): Promise<{ authUrl: string; state: string; expiresInSeconds: number }> {
    return this.request('/integrations/github/oauth/start', {
      method: 'GET',
    });
  }

  // 🚀 NEW: Quick check if GitHub is already connected (instant, no loading needed)
  async checkGitHubStatus(): Promise<{
    connected: boolean;
    githubUsername: string | null;
    lastSync: { at: string; details: any } | null;
    backgroundSync: { inProgress: boolean; lastSyncAt: string | null; error: string | null };
  }> {
    return this.request('/integrations/github/status', {
      method: 'GET',
    });
  }

  // 🚀 NEW: Get cached GitHub data from database (instant, no GitHub API calls)
  async getGitHubData(): Promise<{
    repositories: any[];
    skills: any[];
    projects: any[];
    githubUser: { login: string; id: string } | null;
    totals: { repositories: number; skills: number; projects: number };
    cached: boolean;
    syncInProgress: boolean;
    lastSyncAt: string | null;
  }> {
    return this.request('/integrations/github/data', {
      method: 'GET',
    });
  }

  // 🚀 NEW: Trigger background sync (returns immediately, sync happens in background)
  async triggerBackgroundSync(includePrivate = true, limit = 50): Promise<{
    started: boolean;
    message: string;
    status: { inProgress: boolean; lastSyncAt: string | null };
  }> {
    return this.request('/integrations/github/background-sync', {
      method: 'POST',
      body: JSON.stringify({ includePrivate, limit }),
    });
  }

  // 🚀 NEW: Get background sync status (poll this to check if sync completed)
  async getGitHubSyncStatus(): Promise<{
    inProgress: boolean;
    lastSyncAt: string | null;
    error: string | null;
  }> {
    return this.request('/integrations/github/sync-status', {
      method: 'GET',
    });
  }

  // 🚀 NEW: App startup - checks connection, returns cached data, auto-syncs if needed
  // Call this when app opens for seamless experience
  async autoSyncGitHub(): Promise<{
    connected: boolean;
    needsAuth: boolean;
    repositories: any[];
    skills: any[];
    projects: any[];
    githubUser: { login: string; id: string } | null;
    totals?: { repositories: number; skills: number; projects: number };
    syncStatus?: { triggered: boolean; inProgress: boolean; lastSyncAt: string | null };
  }> {
    return this.request('/integrations/github/auto-sync', {
      method: 'GET',
    });
  }

  async syncGitHubRepos(includePrivate = false, limit = 30): Promise<GitHubSyncResponse> {
    return this.request('/integrations/github/sync', {
      method: 'POST',
      body: JSON.stringify({ includePrivate, limit }),
    });
  }

  async syncGitHubReposOAuth(
    includePrivate = false,
    limit = 30
  ): Promise<GitHubSyncResponse> {
    return this.request('/integrations/github/oauth/sync', {
      method: 'POST',
      body: JSON.stringify({ includePrivate, limit }),
    });
  }

  async checkIntegrationHealth(): Promise<any> {
    return this.request('/integrations/health', {
      method: 'GET',
    });
  }

  async getStudents(): Promise<{ students: any[] }> {
    return this.request('/graph/students', {
      method: 'GET',
    });
  }

  async getKnowledgeGraphData(filter?: string): Promise<{
    nodes: any[];
    edges: any[];
    categories: string[];
    metadata: any;
  }> {
    const url = filter ? `/graph/data?filter=${encodeURIComponent(filter)}` : '/graph/data';
    return this.request(url, {
      method: 'GET',
    });
  }

  async searchSkills(query: string): Promise<{
    query: string;
    results: any[];
  }> {
    return this.request(`/graph/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
    });
  }

  async logout() {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_DATA_KEY);
  }

  async getStoredToken(): Promise<string | null> {
    return AsyncStorage.getItem(AUTH_TOKEN_KEY);
  }

  async getStoredUser() {
    const user = await AsyncStorage.getItem(USER_DATA_KEY);
    return user ? JSON.parse(user) : null;
  }
}

export const api = new SkillVistaAPI();
