# Deployment

Two independent deploy targets. The theme app extension is hosted by Shopify's
CDN; the application backend runs on AWS. They are released separately.

```
                    ┌─ .github/workflows/deploy-shopify-extension.yml
git push / release ─┤     build homexperia.min.js  →  shopify app deploy  →  Shopify CDN
                    │
                    └─ .github/workflows/deploy-aws-backend.yml
                          docker build  →  Amazon ECR  →  AWS runtime
```

`.github/workflows/ci.yml` runs lint, typecheck and both builds on every push
and pull request to `main`.

## Environment variables

| Variable | Where | Secret | Notes |
| --- | --- | --- | --- |
| `SHOPIFY_API_KEY` | AWS runtime | no | Public client ID |
| `SHOPIFY_API_SECRET` | AWS runtime | **yes** | Secrets Manager |
| `SHOPIFY_APP_URL` | AWS runtime | no | Must match `application_url` in `shopify.app.toml` |
| `SCOPES` | AWS runtime | no | Must match `shopify.app.toml` |
| `DATABASE_URL` | AWS runtime | **yes** | RDS PostgreSQL connection string |
| `HOMEXPERIA_API_SECRET` | AWS runtime | **yes** | Shared secret for `POST /api/storefront-token` |
| `HOMEXPERIA_TARGET_URL` | **CI build only** | no | Compiled into the extension asset |

`HOMEXPERIA_TARGET_URL` is not an AWS runtime variable. It is injected into
`homexperia.min.js` at build time and served from Shopify's CDN, so changing it
requires re-running the extension deploy. Setting it in AWS has no effect.

## GitHub configuration

Repository **secrets**:

- `SHOPIFY_APP_AUTOMATION_TOKEN` — App Automation Token, generated in the Dev
  Dashboard under Settings. This replaced Partner CLI tokens.
- `AWS_DEPLOY_ROLE_ARN` — IAM role assumed via GitHub OIDC. No static AWS keys.

Repository **variables**:

- `HOMEXPERIA_TARGET_URL`
- `AWS_REGION`
- `ECR_REPOSITORY`
- `AWS_RUNTIME` — `ecs` or `apprunner`. While unset, the image is built and
  pushed but no rollout happens.
- `ECS_CLUSTER` + `ECS_SERVICE`, or `APPRUNNER_SERVICE_ARN`

## Database migrations

Migrations run when the container starts (`npm run docker-start` →
`prisma migrate deploy`), not from CI, because RDS normally sits in a private
subnet the runners cannot reach. Prisma takes an advisory lock, so parallel task
starts are safe.

The initial migration is `prisma/migrations/0_init` and targets PostgreSQL.

## Releasing

- **Backend**: push to `main`. CI validates, then the backend workflow builds and
  rolls out.
- **Extension / app version**: publish a GitHub Release, or run
  *Deploy Shopify extension* manually. This replaces the active app version for
  every merchant, so it is intentionally not automatic on push. The manual run
  offers a "release" toggle; turning it off creates the version without serving
  it, for release from the Dev Dashboard later.

## Local development

```bash
npm ci
npx prisma generate
npm run dev
```

`shopify.app.toml` ships with `automatically_update_urls_on_dev = false` so local
development cannot overwrite the production app URLs. To run `shopify app dev`
against the dev store, set it to `true` temporarily and change it back before
committing.
