# Backend Database Linking Guide

This guide explains how to use `schema.md` for visualization workflows and what each variable in `.env` is used for.

## 1) How `schema.md` supports visualizations

Follow this flow:

1. Apply database structure:
   - Run `schema.sql`
   - Then run `alterations.sql`
2. Use graph-ready views:
   - `public.graph_nodes`
   - `public.graph_edges`
3. Build your visualization payload from those two views:
   - `graph_nodes` gives all entities (student/project/skill/source/certification)
   - `graph_edges` gives relationships (`BUILT`, `FROM`, `USES`, `CERTIFIED_IN`, `VALIDATES`)
4. Optional filtering:
   - Filter by student/project/skill in SQL before sending to frontend
5. Render in frontend:
   - Treat each row in `graph_nodes` as a node
   - Treat each row in `graph_edges` as an edge
   - Use `node_type`, `label`, and `data` for styling and metadata panels

## 2) Example SQL for visualization data

```sql
select * from public.graph_nodes;
select * from public.graph_edges;
```

Student-scoped example:

```sql
select *
from public.graph_nodes
where node_type <> 'student'
   or node_id in (
     select id::text from public.students where email = 'arin@example.com'
   );
```

## 3) `.env` variable reference

Supabase-first variables:

- `SUPABASE_URL`  
  Your Supabase project URL, used by client/server SDK initialization.

- `SUPABASE_ANON_KEY`  
  Public key for frontend/client usage under RLS policies.

- `SUPABASE_SERVICE_ROLE_KEY`  
  Privileged server-only key. Use for trusted backend jobs, migrations, and integration sync writes. Never expose to browser.

- `SUPABASE_DB_URL`  
  Direct Postgres connection string for SQL tools, migration runners, admin scripts.

- `SUPABASE_SCHEMA`  
  Database schema to target, usually `public`.

- `SUPABASE_STORAGE_BUCKET`  
  Storage bucket name for files/assets related to projects or visualization media.

Other active variables:

- `PORT`  
  Local port if/when Node backend runs.

- `NODE_ENV`  
  Runtime environment mode (`development`, `production`, etc.).

- `JWT_SECRET`, `JWT_EXPIRES_IN`  
  Legacy Node auth token settings (kept because backend is not deleted).

- `GITHUB_TOKEN`, `NOTION_TOKEN`  
  Optional static tokens for integration checks.

- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI`  
  OAuth settings for GitHub integration flow.

- `ENABLE_SYNC_JOBS`, `SYNC_SCHEDULE`  
  Controls scheduled sync checks in backend mode.

- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`  
  Legacy Neo4j settings kept for future reactivation.

## 4) Recommended usage pattern

1. Use `SUPABASE_ANON_KEY` in frontend for read operations with RLS.
2. Use `SUPABASE_SERVICE_ROLE_KEY` only in secure server/edge functions.
3. Read from `graph_nodes` and `graph_edges` for all chart rendering.
4. Write ingestion/sync data into normalized tables (`projects`, `project_skills`, `certifications`, `github_*`, `notion_pages`).
5. Let views abstract relationship-building for the visualization layer.

## 5) Frontend env integration (Expo)

- `app.config.js` loads `.env` and exposes only safe values under `extra.env`.
- Access these from the app via `appEnv` in `src/config/env.ts`.
- Do not expose secrets (service role keys, DB URLs, tokens) to the client.
