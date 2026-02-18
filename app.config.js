import 'dotenv/config';
import appConfig from './app.json';

const { expo } = appConfig;

export default ({ config }) => ({
  ...config,
  ...expo,
  extra: {
    ...expo.extra,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_SCHEMA: process.env.SUPABASE_SCHEMA,
      SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      GITHUB_REDIRECT_URI: process.env.GITHUB_REDIRECT_URI,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      NOTION_TOKEN: process.env.NOTION_TOKEN,
    },
  },
});

