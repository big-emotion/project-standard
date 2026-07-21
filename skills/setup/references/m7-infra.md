# M7 — Infrastructure & secrets

Where Big Emotion apps run and where their secrets live. The default deploy
target is the shared OVH VPS (Docker + host-level Traefik, § a); Azure App
Service is a documented variant with no templates (§ b). Transactional mail
rides the Microsoft 365 tenant (§ c). The secrets doctrine (§ d) governs all
of it.

This file is fully parameterized, and the plugin is public: no real coordinates
(VPS host, domains, Azure app names) appear anywhere in it. Collect them from
the operator at interview time — the placeholders below are never given
defaults here.

| Template | Installed as | Notes |
| --- | --- | --- |
| `m7-infra/docker-compose.deploy.yml` | `<app>/deploy/docker-compose.yml` | Traefik labels + `proxy`/`myresolver` constants |
| `m7-infra/env.template` | `<app>/deploy/env.template` | Committed as the *names* catalogue; the real `.env` is filled on the VPS by a human, never committed |
| `m7-infra/dockerfile.next` | `<app>/Dockerfile` | Next.js standalone variant; other frameworks adapt |

`<app>` is the directory that builds the deployable artefact — the repo root,
or a subdirectory on split-toolchain repos (e.g. the support-agent repo's
`portal/`).

## a. VPS pattern — Docker + shared Traefik

One long-lived VPS, one host-level Traefik, one container per app. Traefik
routes by `Host(...)` label and terminates TLS with a single ACME resolver, so
onboarding a new app is: DNS record + compose file with labels + `.env` — no
per-app nginx, no per-app certbot.

### Prerequisites

- VPS with Docker Engine + the compose plugin.
- Host-level Traefik v2 already running, owning `:80`/`:443`, with the ACME
  resolver named `myresolver` (http-challenge) and watching the external
  Docker network `proxy` (`docker network create proxy`, once per VPS). Both
  names are constants of the pattern — every app compose references them.
- An SSH keypair dedicated to deploys; the public half in
  `~{{vps_ssh_user}}/.ssh/authorized_keys` on the VPS. One key serves every
  repo deploying to the same VPS/user.
- Control of the DNS zone `{{app_hostname}}` belongs to (OVH, below).

### GitHub `production` environment — the vars/secret split

Each repo gets a GitHub environment named `production` carrying the deploy
access:

| Name | Kind | Content |
| --- | --- | --- |
| `DEPLOY_HOST` | variable | `{{vps_host}}` |
| `DEPLOY_USER` | variable | `{{vps_ssh_user}}` |
| `DEPLOY_PORT` | variable | `{{vps_ssh_port}}` |
| `DEPLOY_KNOWN_HOSTS` | variable | pinned `ssh-keyscan` output (the VPS's *public* host keys) |
| `DEPLOY_SSH_KEY` | **secret** | the deploy private key |

Why the split: variables stay **readable** after creation — auditable, and
onboarding the next repo on the same VPS is "copy four values". Secrets are
**write-only** — the private key can never be read back out of GitHub, by
anyone or by a compromised read-scope token; re-provisioning means a human
re-enters it from their password manager. Everything sensitive is the key;
host/user/port are coordinates and `known_hosts` is public-key material, so
they belong in variables.

Capture `DEPLOY_KNOWN_HOSTS` once per VPS:

```sh
ssh-keyscan -p {{vps_ssh_port}} -H {{vps_host}}
```

Paste the full output. The deploy workflow writes it to `~/.ssh/known_hosts`
and connects with `-o UserKnownHostsFile=…` — never
`StrictHostKeyChecking=no`, which would accept any host silently.

### Deploy job shape (the `PROJECT-SPECIFIC` section of `deploy-production.yml`)

M6's `deploy-production.yml` template ends its deploy job with a
`# PROJECT-SPECIFIC: deploy steps` marker. For the VPS pattern, fill it with
the shape of the live support-agent workflow — build in CI, ship a tarball,
restart over SSH (no image registry involved):

1. `docker build -t {{project_slug}}:deploy <app>` — the multi-stage
   Dockerfile runs its own install + build inside the app context.
2. `docker save {{project_slug}}:deploy | gzip > /tmp/{{project_slug}}.tar.gz`.
3. Configure SSH: write `secrets.DEPLOY_SSH_KEY` to `~/.ssh/deploy_key` and
   `vars.DEPLOY_KNOWN_HOSTS` to `~/.ssh/known_hosts` (`umask 077`,
   `chmod 600`).
4. `scp` the tarball to `/tmp` on the VPS, and `scp`
   `<app>/deploy/docker-compose.yml` from **this checkout** to
   `{{deploy_path}}/deploy/docker-compose.yml`. Shipping the compose from the
   checkout is deliberate: the container must restart with the compose that
   matches the deployed image — reading the VPS git clone once silently
   deployed a stale file (website SWBE-26 lesson).
5. `ssh` and run, as one command:
   `docker load < /tmp/{{project_slug}}.tar.gz`, then
   `docker tag {{project_slug}}:deploy {{project_slug}}:live`, then
   `cd {{deploy_path}} && docker compose -f deploy/docker-compose.yml up -d
   --no-deps --pull never {{project_slug}}`, then remove the tarball.
   `--pull never` forces the locally loaded image — there is no registry to
   pull from, and a pull attempt would fail or fetch the wrong thing.
6. Smoke check: `curl -fsS` `https://{{app_hostname}}/` and assert HTTP 200.
   On the first-ever deploy allow extra time — Traefik still has to obtain
   the Let's Encrypt certificate.

The `.env` is **never** shipped by the workflow — it is created and edited in
place on the VPS by a human (§ d). Keep the M6 ancestry guard and the
pre-build validation steps that precede this section.

### DNS record via OVH

Create the app's record in the OVH-managed zone **before** the first deploy —
the ACME http-challenge and the smoke check both need `{{app_hostname}}`
resolving to the VPS:

- OVH manager: web console → Domains → the zone → add an `A` record
  `{{app_hostname}}` → the VPS public IP.
- Or the `ovhcloud` MCP: `create-domain-zone-record` (type `A`, subdomain,
  target IP) followed by `refresh-domain-zone-zone`.

Zone-management scope: OVH owns the zone's records; the MX/SPF records point
mail at Microsoft 365 and must not be touched when adding app records (§ c).

### First-deploy checklist

```
[ ] DNS A record {{app_hostname}} → VPS public IP, resolving (dig +short)
[ ] Deploy public key in ~{{vps_ssh_user}}/.ssh/authorized_keys on the VPS
[ ] `docker network ls` on the VPS shows `proxy` (external, watched by Traefik)
[ ] {{deploy_path}}/deploy/ exists on the VPS
[ ] .env created at {{deploy_path}}/deploy/.env by a human from env.template,
    every value filled (the workflow never ships it)
[ ] GitHub `production` environment: 4 DEPLOY_* variables + DEPLOY_SSH_KEY secret
[ ] deploy-production.yml PROJECT-SPECIFIC section filled (M6) and on the
    default branch
[ ] Tag a release and watch the run
```

### Verification

- `curl -I https://{{app_hostname}}` → 200 with a valid Let's Encrypt
  certificate (first request after deploy may lag while ACME completes).
- On the VPS: `docker ps` shows the container `Up`;
  `docker logs {{project_slug}}` is clean.
- If Traefik never picks the router up: check the container is on the `proxy`
  network and the labels for typos — Traefik logs name the offending router.

## b. Azure App Service variant (documented, no templates)

One live implementation exists — the website repo,
where the client mandates its own Azure tenant. It is a **variant, not the
default**: choose it only when the client's tenant/compliance/isolation
requirements rule out the shared VPS. M7 deliberately ships no Azure
templates — a single client-shaped implementation would freeze its accidents
into the standard; adopt from the website repo's runbooks instead.

The model, in brief:

- **Three environments**: a dedicated production App Service (no slots,
  deployed on `v*` tag), a staging App Service whose Production slot serves
  the recette (deployed on every push to `develop`), and an on-demand `dev`
  slot sandbox (`workflow_dispatch` only). App names and hostnames:
  internal reference file.
- **OIDC login, no publish-profile secrets**: `azure/login` with a federated
  credential on a managed identity. The credential's entity type must be
  **Environment** — once the job declares `environment: <name>`, GitHub
  issues the token with subject `repo:<org>/<repo>:environment:<name>`
  regardless of trigger branch, and a Branch-type credential is rejected with
  `AADSTS700213`. The client-id/tenant-id/subscription-id triplet stored as
  GitHub secrets are identifiers, not key material. RBAC: **Website
  Contributor** scoped to the app itself, not the resource group.
- **Oryx disabled** (`SCM_DO_BUILD_DURING_DEPLOYMENT=false`,
  `ENABLE_ORYX_BUILD=false`, re-set idempotently on every deploy): Azure's
  build service would rebuild `node_modules` and clobber the pre-built
  bundle.
- **Next standalone bundle assembly**: the workflow builds, assembles the
  `.next/standalone` bundle (preserving the pnpm symlink farm), then
  `azure/webapps-deploy` with `clean: true` and startup command
  `node server.js`.

Pointers (in the website repo):
`docs/runbooks/azure-production-setup.md` (production App Service, OIDC
credential + RBAC, app settings, gated go-live flip, rotation),
`docs/runbooks/azure-staging-slot-setup.md` (staging slot + `dev` sandbox,
OIDC pitfalls, auto-generated-workflow conflict), and
`.github/workflows/deploy-{production,staging,dev}.yml`.

## c. Transactional mail — M365 tenant SMTP

Decision: transactional mail (magic links, notifications) is sent through the
Microsoft 365 tenant that already owns the domain's mailboxes — no
third-party ESP (Resend was replaced by this pattern). One less vendor, one
less secret class, and the From address is a real tenant mailbox so
SPF/DKIM/DMARC align without extra DNS.

**Primary pattern — SMTP AUTH** via nodemailer: `smtp.office365.com:587`,
STARTTLS. Env names (core section of `env.template`): `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`.

Ops prerequisites — the part that always bites, because Microsoft disables
SMTP AUTH by default:

1. **Authenticated SMTP on the mailbox**: M365 admin center → Users → Active
   users → the sending mailbox → Mail → Manage email apps → enable
   *Authenticated SMTP*.
2. **App password**: the mailbox needs MFA enrolled; mint the app password
   under the mailbox's *Security info*. `SMTP_PASSWORD` is this app password,
   never the account password.
3. **Tenant policy check**: Security Defaults (or a Conditional Access
   policy) can block legacy auth tenant-wide — per-mailbox settings do not
   override it. If SMTP AUTH stays refused after 1–2, that is the tenant
   policy: use the fallback below rather than weakening tenant security.

**Fallback — Microsoft Graph `sendMail`** (client credentials), for tenants
that keep SMTP AUTH blocked:

- Entra app registration with **Application** permission `Mail.Send` + admin
  consent.
- An `ApplicationAccessPolicy` scoping the app to the sending mailbox only —
  without it, application-level `Mail.Send` lets the app send as *any*
  mailbox in the tenant.
- Token via the client-credentials grant, then
  `POST /users/<sender>/sendMail`.
- Env names: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`,
  `MAIL_SENDER` (+ optional `MAIL_FROM_NAME`) — these replace the `SMTP_*`
  rows in the `.env`.

The live worked example is the support-agent portal
(`portal/src/lib/graph-mail.ts`): its tenant keeps Security Defaults on, so
production runs the Graph fallback.

**DNS scope**: OVH manages the zone; Microsoft 365 manages the mailboxes. The
zone's MX points at `*.mail.protection.outlook.com` and SPF includes the
Outlook senders — deploys and app records never touch these. `MAIL_FROM` must
be a tenant mailbox (or alias) so the tenant's SPF/DKIM cover it.

## d. Secrets doctrine

Three storage tiers, and a value lives in exactly one operational tier:

| Tier | Where | Written by | Read by |
| --- | --- | --- | --- |
| GitHub environment secrets + variables | repo Settings → Environments (e.g. `production`) | a human, once per repo | CI workflows only |
| VPS `.env` | `{{deploy_path}}/deploy/.env`, edited in place over SSH | a human, from `env.template` | the app container (`env_file`) |
| Provider portals | OVH manager, M365 admin / Entra, third-party dashboards (ElevenLabs, Prismic, …) | the provider mints the value | humans, to fill the two tiers above |

Provider portals are where values are *born* (and revoked); the other two
tiers are where running systems *consume* them. Values transit from portal to
tier via a human and a password manager — never via the repo, a PR, CI logs,
or chat.

Names per tier — the standard core; projects append their own rows with the
same discipline (name + purpose + where obtained, in `env.template`'s
`# PROJECT-SPECIFIC:` section):

| Tier | Secrets (write-only) | Variables / non-secret |
| --- | --- | --- |
| GitHub `production` env | `DEPLOY_SSH_KEY` | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_KNOWN_HOSTS` |
| VPS `.env` | `AUTH_SECRET`, `SMTP_PASSWORD` (or `GRAPH_CLIENT_SECRET`), project API keys & webhook secrets | `AUTH_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `MAIL_FROM` |
| Provider portals | app passwords, API keys, client secrets — referenced by *name* in docs, obtained per operator | account/tenant identifiers |

Principles:

- **Per-user credentials.** API keys are personal: each operator mints their
  own key at the provider and puts it in their own local, gitignored `.env`.
  Nothing is shared through the repo, and an operator leaving means revoking
  one key, not rotating everyone's. Service credentials that must be shared
  (the deploy key, the sending mailbox's app password) live only in their
  operational tier above.
- **`env.template` documents names, never values.** It is the committed
  catalogue that lets a fresh human fill a fresh `.env` without archaeology.
- **gitleaks is the enforcement layer.** M1's `gitleaks` CI job (with
  `.gitleaks.toml`) runs on every PR of every repo, so a value that does leak
  into a commit fails CI before it lands. Local real values exist only in
  gitignored `.env` files.
- **This plugin repo is public: no secret values, and no coordinates either.**
  Templates and references carry names, storage locations, and acquisition
  steps only. Hostnames, IPs, SSH ports, account handles and resource names
  are `{{placeholders}}` filled in at interview time and never written back
  into the plugin — a coordinate committed here is a leak even when it is
  not a secret.
