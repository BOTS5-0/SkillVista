import Constants from 'expo-constants';

export interface AppEnv {
  NODE_ENV?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SCHEMA?: string;
  SUPABASE_STORAGE_BUCKET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_REDIRECT_URI?: string;
  GITHUB_TOKEN?: string;
  NOTION_TOKEN?: string;
}

const extra = (Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {}) as {
  env?: AppEnv;
};

export const appEnv: AppEnv = extra.env ?? {};
