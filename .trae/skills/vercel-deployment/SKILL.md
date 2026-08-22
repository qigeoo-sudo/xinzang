---
name: "vercel-deployment"
description: "Deploys projects to Vercel with auto-configuration. Invoke when user asks to deploy to Vercel, set up Vercel deployment, or needs one-click deployment for frontend/Next.js projects."
---

# Vercel Deployment

Deep integration with Vercel deployment capabilities. Describe your project and the AI handles project configuration, build command setup, environment variable configuration, and deployment — a true one-click deployment experience.

## When to Use

- User asks to deploy a project to Vercel
- User wants to set up Vercel for a Next.js project
- User asks for preview environments / PR previews
- User mentions "部署到 Vercel", "上线", "一键部署"
- User wants to deploy static sites, Next.js apps, or serverless functions

## Prerequisites

1. **Vercel account** — user must have a Vercel account
2. **Vercel CLI** — `npm install -g vercel` or `npx vercel`
3. **Authentication** — `vercel login` or `VERCEL_TOKEN` environment variable

## Deployment Workflow

### Step 1: Check Project Type

Detect the project framework:
- **Next.js** — `next.config.js` or `next.config.ts`, `app/` or `pages/` directory
- **React (Vite/CRA)** — `vite.config.*`, package.json has `react-scripts` or `vite`
- **Vue/Nuxt** — `nuxt.config.*`, `vite.config.*` with vue
- **Static site** — plain HTML/CSS/JS, or build output in `dist/` or `out/`
- **Svelte/Astro/etc.** — check config files

### Step 2: Determine Build Settings

| Framework | Build Command | Output Directory | Install Command |
|-----------|--------------|-----------------|-----------------|
| Next.js | `next build` | `.next` | `npm install` |
| Vite React | `npm run build` | `dist` | `npm install` |
| Create React App | `npm run build` | `build` | `npm install` |
| Vue (Vite) | `npm run build` | `dist` | `npm install` |
| Nuxt | `npm run build` | `.output` | `npm install` |
| Static HTML | — | project root | — |

### Step 3: Deploy via Vercel CLI

```bash
# First deployment (interactive)
vercel

# Subsequent deployments
vercel --prod

# Deploy with specific token (for CI)
vercel --prod --token $VERCEL_TOKEN
```

### Step 4: Environment Variables

Set environment variables via CLI:
```bash
vercel env add DATABASE_URL production
vercel env add NEXTAUTH_SECRET production
```

Or in `vercel.json`:
```json
{
  "env": {
    "CUSTOM_VAR": "value"
  }
}
```

**Never commit secrets to git.** Use Vercel project settings or CLI to add secrets.

## vercel.json Configuration

```json
{
  "framework": "nextjs",
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "regions": ["hnd1"],
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 10
    }
  }
}
```

## GitHub Integration (Auto-Deploy)

1. Push project to GitHub
2. Import repo in Vercel dashboard
3. Vercel auto-deploys on every push
4. Each PR gets a preview URL

## Preview Deployments

- Every PR generates a unique preview URL
- Comment on PR with deployment status
- Preview URLs follow pattern: `{project}-git-{branch}-{team}.vercel.app`

## Common Issues

**Build fails with Node version mismatch**
- Add `.nvmrc` file with required version, or set in Vercel project settings

**Environment variables not picked up**
- For Next.js, variables must be prefixed with `NEXT_PUBLIC_` to be exposed to client-side
- Server-side variables work without prefix

**Large build size**
- Enable image optimization in Next.js
- Use Vercel's built-in CDN for static assets
- Consider incremental static regeneration

## Deployment Commands Quick Reference

```bash
# Login
vercel login

# Deploy (dev/preview)
vercel

# Deploy to production
vercel --prod

# Deploy with custom domain
vercel --prod --domain example.com

# List deployments
vercel ls

# Check logs
vercel logs [url]

# Remove deployment
vercel remove [url]

# Set env var
vercel env add VAR_NAME [environment]

# Pull env vars locally
vercel env pull
```
