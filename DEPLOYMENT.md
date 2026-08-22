# Deployment

Production architecture:

```
Git repository
      ↓
Jenkins  (validation, build, Docker build)
      ↓
deploy/deploy.sh  →  migrate  →  replace container  →  health check
      ↓
Docker (host networking) on EC2
      ↓                    ↓
PostgreSQL 127.0.0.1:5432  app on 127.0.0.1:3000
                                 ↓
                           Nginx  →  https://shopify.homexperia.com
```

Jenkins is the only production deployment mechanism. GitHub Actions runs
pull-request validation only and cannot deploy or publish anything.

## Known paths

| | |
| --- | --- |
| Application directory | `/home/sopify/app` |
| Runtime env file | `/home/sopify/.config/homexperia-shopify/app.env` |
| Database | `homexperia_shopify` |
| Runtime DB role | `homexperia_shopify_app` (owner, not superuser) |
| DB address from the container | `127.0.0.1:5432` (host networking) |
| Container name | `homexperia-shopify-app` |
| Nginx upstream | `http://127.0.0.1:3000` |

The runtime env file sits outside `/home/sopify/app` on purpose: a Jenkins
checkout or redeploy of the application directory can never overwrite or expose
it.

## Docker networking

The container runs with `--network host`.

PostgreSQL listens only on `127.0.0.1:5432`, which is correct and must not
change. A bridge-network container cannot reach it: `127.0.0.1` inside a bridge
container is the container itself, and the bridge gateway address is not one
PostgreSQL is listening on. Reaching it from a bridge network would require
opening `listen_addresses`, which would weaken a currently sound configuration.

Host networking removes the boundary instead of widening PostgreSQL's exposure,
which is why it is the right trade on a single-host deployment.

Because host networking means the app binds directly to a host interface,
**`HOST=127.0.0.1` matters**. Without it the app would listen on `0.0.0.0` and
port 3000 would be reachable on the EC2 network interface, bypassing Nginx and
TLS. `react-router-serve` binds to `process.env.HOST` when set.

Port 3000 is free on this host; 5173, 8080, 5432, 80 and 443 belong to the
existing Homexperia application and Nginx and are untouched.

## Environment variables

Read from the code, not assumed.

### Runtime — non-secret

| Variable | Value | Source |
| --- | --- | --- |
| `SHOPIFY_API_KEY` | client ID | Shopify production app — **pending** |
| `SHOPIFY_APP_URL` | `https://shopify.homexperia.com` | fixed |
| `SCOPES` | must match `shopify.app.toml` | repository |
| `NODE_ENV` | `production` | fixed |
| `HOST` | `127.0.0.1` | fixed — see above |
| `PORT` | `3000` | fixed |

### Runtime — secret (Jenkins Credentials Store)

| Variable | Source |
| --- | --- |
| `SHOPIFY_API_SECRET` | Shopify production app — **pending** |
| `DATABASE_URL` | `postgresql://homexperia_shopify_app:PASSWORD@127.0.0.1:5432/homexperia_shopify` |
| `HOMEXPERIA_API_SECRET` | Homexperia — shared with their backend team |

### Build-time only — never in the runtime env file

| Variable | Notes |
| --- | --- |
| `HOMEXPERIA_TARGET_URL` | Compiled into the extension asset and served by Shopify's CDN. Setting it on the server has no effect; changing it requires re-running the Shopify release. |

### Not used in production

`SHOP_CUSTOM_DOMAIN` and `FRONTEND_PORT` are development-only. Leave unset.

## Jenkins configuration

Credentials Store (secret text):

| ID | Contains |
| --- | --- |
| `homexperia-target-url` | `HOMEXPERIA_TARGET_URL` for the extension build |
| `shopify-app-automation-token` | App Automation Token — **pending** |
| `shopify-app-client-id` | Production Shopify Client ID — **pending**. Injected as `SHOPIFY_FLAG_CLIENT_ID`, which overrides the development `client_id` in `shopify.app.toml`, so the production ID is never committed |

The runtime secrets (`SHOPIFY_API_SECRET`, `DATABASE_URL`,
`HOMEXPERIA_API_SECRET`) are consumed by the container through the env file, not
by the pipeline. Add them to the Credentials Store and have the job that
provisions the env file write them, or provision the file out of band.

### Creating the runtime env file from Jenkins

`deploy/app.env.example` is the template. To generate it from credentials:

```groovy
withCredentials([
  string(credentialsId: 'shopify-api-secret',     variable: 'SHOPIFY_API_SECRET'),
  string(credentialsId: 'shopify-database-url',   variable: 'DATABASE_URL'),
  string(credentialsId: 'homexperia-api-secret',  variable: 'HOMEXPERIA_API_SECRET')
]) {
  sh '''
    umask 077
    TMP="$(mktemp)"
    trap 'rm -f "$TMP"' EXIT
    {
      echo "SHOPIFY_API_KEY=..."
      echo "SHOPIFY_APP_URL=https://shopify.homexperia.com"
      echo "SCOPES=..."
      echo "NODE_ENV=production"
      echo "HOST=127.0.0.1"
      echo "PORT=3000"
      echo "SHOPIFY_API_SECRET=$SHOPIFY_API_SECRET"
      echo "DATABASE_URL=$DATABASE_URL"
      echo "HOMEXPERIA_API_SECRET=$HOMEXPERIA_API_SECRET"
    } > "$TMP"
    install -m 600 "$TMP" /home/sopify/.config/homexperia-shopify/app.env
  '''
}
```

`umask 077` means the temp file is never briefly world-readable, `trap` removes
it even on failure, and `install -m 600` sets the final permissions atomically.
`deploy.sh` refuses to run if the file is not mode 600 or 400.

Never echo these values, never pass them as `docker build --build-arg`, and
never write them into `/home/sopify/app`.

## Pipeline stages

| Stage | Runs when |
| --- | --- |
| Checkout | always |
| Install (`npm ci`) | always |
| Validate (prisma generate/validate, lint, typecheck) | always |
| Build (extension + application, bundle guard) | always |
| Docker build | `DEPLOY_BACKEND` |
| Deploy backend (`deploy/deploy.sh`) | `DEPLOY_BACKEND` |
| Release Shopify extension | `RELEASE_SHOPIFY` — **off by default** |

`RELEASE_SHOPIFY` publishes a new app version to every merchant with the app
installed. Backend-only changes must leave it off.

## Deployment sequence

`deploy/deploy.sh <tag>` performs, in order:

1. Verify the runtime env file exists and is mode 600/400.
2. `docker build`.
3. **Migrate** — `prisma migrate deploy` in a one-off `--rm` container with host
   networking. If it fails the script exits and the running revision is
   untouched.
4. Stop the current container and rename it to `homexperia-shopify-app-previous`.
5. Start the new container with `--restart unless-stopped`.
6. Poll `http://127.0.0.1:3000/healthz` (30 attempts, 2s apart).
7. On failure: print the last 50 log lines, remove the new container, restore
   the previous one, exit non-zero.

Migrations run before the swap rather than at container start, so a bad
migration fails the deployment instead of crash-looping the container.

Only resources named `homexperia-shopify-app*` are touched. No `docker system
prune`, no unrelated containers, images, or services.

### Manual commands

```bash
cd /home/sopify/app

./deploy/deploy.sh                      # build, migrate, deploy, verify
./deploy/rollback.sh                    # restore previous container

docker logs -f homexperia-shopify-app   # follow logs
docker ps --filter name=homexperia-shopify-app
curl -fsS http://127.0.0.1:3000/healthz
```

Rollback restores the previous image. It does **not** revert migrations —
Prisma migrations are forward-only, so check the migration before relying on it.

## Handed to the AWS team

- Nginx site for `shopify.homexperia.com` proxying to `http://127.0.0.1:3000`.
  Do not modify the existing `cms.homexperia.com` site.
- TLS via Certbot for the new host.
- How the Deploy stage reaches EC2: run the job on an agent on the host, or wrap
  `deploy/deploy.sh` in your own transport. The repository does not assume one.
- Creating `/home/sopify/.config/homexperia-shopify/app.env` with mode 600.

## Pending: production Shopify app

The production Shopify app does not exist yet. `application_url` and
`redirect_urls` are already set to the production domain and need no further
edit. `client_id` in `shopify.app.toml` is still the development app's, and is
overridden at release time by `SHOPIFY_FLAG_CLIENT_ID`.

Once the app is created in the Dev Dashboard, **no Git change is required** —
add these to the Credentials Store:

1. `shopify-app-client-id` — production Client ID.
2. `shopify-app-automation-token` — App Automation Token.
3. Production Client ID into `SHOPIFY_API_KEY` and Client Secret into
   `SHOPIFY_API_SECRET` in the runtime env file.
4. `homexperia-target-url` — final Homexperia experience URL.

Then run the pipeline once with `RELEASE_SHOPIFY` enabled to publish the
extension and app configuration to the production app.

## Local development

The tracked `shopify.app.toml` deliberately has **no `client_id`**, so the
repository is not tied to any one developer's Shopify app. Create your own
configuration once — it is gitignored:

```bash
npm ci
npx prisma generate

shopify app config link          # writes shopify.app.<name>.toml
shopify app config use <name>
npm run dev
```

`shopify.app.*.toml` is gitignored, so your Client ID and any tunnel URLs stay
local. The shared config keeps `automatically_update_urls_on_dev = false` so
nothing local can overwrite the production URLs; set it to `true` in your own
config instead.
