---
name: "ci-cd-pipeline"
description: "Helps build and optimize CI/CD pipelines for GitHub Actions, GitLab CI, Jenkins, etc. Invoke when user asks to set up CI/CD, configure deployment pipeline, or automate build/deploy workflows."
---

# CI/CD Pipeline Builder

Helps developers quickly set up and optimize continuous integration / continuous deployment pipelines. Supports GitHub Actions, GitLab CI, Jenkins, and other mainstream platforms.

## When to Use

- User asks to set up CI/CD from scratch for a new project
- User wants to optimize existing CI/CD pipeline
- User asks about multi-environment deployment (dev/staging/prod)
- User mentions "自动化部署", "持续集成", "流水线", "pipeline"

## Supported Platforms

### GitHub Actions (Primary)
- Workflow files go in `.github/workflows/`
- YAML format with `on:`, `jobs:`, `steps:` structure
- Common triggers: push, pull_request, release, schedule

### GitLab CI
- Config file: `.gitlab-ci.yml` at repo root
- Uses `stages:`, `jobs:`, `script:` structure

### Jenkins
- `Jenkinsfile` at repo root
- Declarative or scripted pipeline syntax

## Standard Pipeline Stages

1. **Checkout** — pull source code
2. **Install dependencies** — npm install / pip install / etc.
3. **Lint & Type check** — eslint, tsc --noEmit, etc.
4. **Test** — unit tests, integration tests
5. **Build** — production build
6. **Deploy** — to target environment

## GitHub Actions Next.js Example

```yaml
name: CI/CD

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

      - name: Deploy to production
        if: github.ref == 'refs/heads/master'
        run: echo "Add deployment command here"
```

## Deployment Targets

- Vercel / Netlify
- Cloud hosting (Tencent CloudBase, AWS, etc.)
- Self-hosted servers via SSH
- Docker registries + container platforms
- Static file hosting (OSS, S3, CDN)

## Environment Variables

- Never hardcode secrets in pipeline config
- Use platform secrets management:
  - GitHub: Repository Secrets / Environments
  - GitLab: CI/CD Variables
  - Jenkins: Credentials Plugin
- Reference as `${{ secrets.SECRET_NAME }}` in workflow

## Best Practices

- Use `npm ci` instead of `npm install` for reproducible builds
- Cache dependencies to speed up builds
- Run lint and tests on every PR
- Deploy only from main/master branch
- Use environment-specific configs for dev/staging/prod
- Add rollback mechanism
- Set up notifications (Slack, email, etc.) for build failures

## CloudBase / Tencent Cloud Deployment

For Tencent CloudBase (云托管) deployments, use the CloudBase CLI:

```bash
# Install CLI
npm install -g @cloudbase/cli

# Login
tcb login --apiKeyId $TENCENT_SECRET_ID --apiKey $TENCENT_SECRET_KEY

# Deploy
tcb framework deploy --env $ENV_ID
```

Store credentials in GitHub Secrets, not in code.
