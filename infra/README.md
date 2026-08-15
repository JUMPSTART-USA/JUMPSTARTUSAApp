# Azure deployment

One Bicep template ([main.bicep](main.bicep)) stamps a complete environment into
a resource group:

| Resource | Purpose |
|---|---|
| PostgreSQL Flexible Server (B2s, PG 16) | Private-only (VNet-delegated subnet + private DNS); 14-day PITR |
| App Service (Linux container) | NestJS API; Always On, `/api/health` health check, VNet-integrated; prod gets a `staging` slot for swap deploys |
| Static Web App (Standard) | React SPA; the App Service is a **linked backend**, so `/api/*` is same-origin — cookie auth works with no CORS |
| Container Registry (Basic) | `jumpstart-api` (runtime) and `jumpstart-migrate` (release-time migrations) images |
| Key Vault (RBAC) | `database-url`, `session-secret`; App Service reads them via managed identity |
| Log Analytics + Application Insights | Telemetry; wire alerts here |
| User-assigned identity `js-<env>-jobs-identity` | Lets CI-launched migration containers pull from ACR |

Deploys run from GitHub Actions ([deploy.yml](../.github/workflows/deploy.yml)):
push to `main` → staging (migrate → API → SPA → smoke test) → manual approval →
production (migrate → slot deploy → warm → **swap** → SPA).

## One-time bootstrap

Prereqs: Azure CLI ≥ 2.60, an owner/contributor account on the subscription,
and (recommended) the [Microsoft nonprofit Azure grant](https://nonprofit.microsoft.com).

### 1. Resource groups + infrastructure

```sh
az login
az account set --subscription <SUBSCRIPTION_ID>

az group create -n rg-jumpstart-staging -l eastus2
az group create -n rg-jumpstart-prod    -l eastus2

# Staging (keep the generated secrets somewhere safe, e.g. the org password manager)
az deployment group create -g rg-jumpstart-staging \
  -f infra/main.bicep -p infra/staging.bicepparam \
  -p postgresAdminPassword=$(openssl rand -hex 24) \
  -p sessionSecret=$(openssl rand -hex 32) \
  -p encryptionKey=$(openssl rand -hex 32)

# Production
az deployment group create -g rg-jumpstart-prod \
  -f infra/main.bicep -p infra/prod.bicepparam \
  -p postgresAdminPassword=$(openssl rand -hex 24) \
  -p sessionSecret=$(openssl rand -hex 32) \
  -p encryptionKey=$(openssl rand -hex 32)
```

Each deployment prints an `outputs` block — you need those values in step 3.

### 2. GitHub → Azure OIDC (no stored cloud credentials)

```sh
app_id=$(az ad app create --display-name gh-jumpstart-deploy --query appId -o tsv)
az ad sp create --id "$app_id"

# Federated credentials: one per GitHub environment
for env in staging production; do
  az ad app federated-credential create --id "$app_id" --parameters "{
    \"name\": \"gh-$env\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:JUMPSTART-USA/JUMPSTARTUSAApp:environment:$env\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }"
done

# Grant the deployer: Contributor on both RGs + Key Vault secret read
sp_object_id=$(az ad sp show --id "$app_id" --query id -o tsv)
sub=$(az account show --query id -o tsv)
for rg in rg-jumpstart-staging rg-jumpstart-prod; do
  az role assignment create --assignee-object-id "$sp_object_id" \
    --assignee-principal-type ServicePrincipal \
    --role Contributor --scope "/subscriptions/$sub/resourceGroups/$rg"
  kv=$(az keyvault list -g "$rg" --query '[0].name' -o tsv)
  az role assignment create --assignee-object-id "$sp_object_id" \
    --assignee-principal-type ServicePrincipal \
    --role "Key Vault Secrets User" \
    --scope "$(az keyvault show -n "$kv" --query id -o tsv)"
done
```

### 3. GitHub environments

Create `staging` and `production` environments in the repo settings. Set
`production` to accept deployments from **protected branches only**, so prod can
never be shipped from a feature branch.

A required reviewer on `production` would be the natural deploy gate, but on a
private repo that rule needs GitHub Enterprise — Team only unlocks deployment
branch policies. The gate is therefore the workflow itself: the `production` job
runs on `workflow_dispatch` only, so merging to `main` deploys staging and
nothing else. See `.github/workflows/deploy.yml`.

Variables for each environment (from the Bicep outputs):

| Variable | Value |
|---|---|
| `AZURE_CLIENT_ID` | `$app_id` from step 2 |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |
| `AZURE_RG` | `rg-jumpstart-staging` / `rg-jumpstart-prod` |
| `ACR_NAME` | output `acrName` |
| `WEBAPP_NAME` | output `webAppName` |
| `KEYVAULT_NAME` | output `keyVaultName` |
| `JOBS_SUBNET_ID` | output `jobsSubnetId` |
| `JOBS_IDENTITY_ID` | output `jobsIdentityId` |

Secret for each environment:

| Secret | Value |
|---|---|
| `SWA_DEPLOY_TOKEN` | `az staticwebapp secrets list -n <staticWebAppName> -g <rg> --query properties.apiKey -o tsv` |

### 4. First deploy

Push to `main`: CI runs, then staging deploys. Production does **not** follow
automatically — review staging, then release it:

```bash
gh workflow run deploy.yml --ref main
```

or use **Run workflow** on the Deploy workflow in the Actions tab. Either way the
run re-checks that CI passed for that commit before touching prod.

### 5. Production go-live (once)

- **Do not run the demo seed.** Create the real admin with a one-off container
  (same pattern as the migration job) or a temporary jump box; then log in and
  enroll TOTP immediately.
- Point `app.jumpstartusa.org` at the prod Static Web App
  (`az staticwebapp hostname set …`), then update the `WEB_ORIGIN` app setting
  on the API to the custom domain.
- Set optional integrations as App Service settings / Key Vault secrets when
  ready: `BLOOMERANG_API_KEY`, `POSTMARK_SERVER_TOKEN`, `TURNSTILE_SECRET_KEY`,
  `SENTRY_DSN`, `S3_*`.
- Add alert rules on Application Insights: availability test on `/api/health`,
  5xx spike, Postgres CPU/storage.

## Notes

- **Migrations** run release-time via the `jumpstart-migrate` image as a
  one-off ACI in the VNet ([run-migration-job.sh](../.github/scripts/run-migration-job.sh)) —
  the database never gets a public endpoint, and app containers never migrate
  at boot.
- **Rollback**: prod API rolls back with a second slot swap; database
  migrations should stay backward-compatible one release in each direction.
- **Scaling up later**: raise the App Service plan SKU and enable Postgres
  zone-redundant HA in `main.bicep` — both are single-line changes.

## Slot-sticky app settings (prod)

`WEB_ORIGIN` and `WEB_ORIGIN_ALIASES` are declared in `slotConfigNames`
(main.bicep) so they stay bound to the slot they are set on. They were not,
once: after the custom-domain cutover the values were set by hand on the
production slot, the next release swapped slots, and the pre-cutover value
rode back into production — every write from app.jumpstartusa.org answered
403, and the WebAuthn rpID (derived from WEB_ORIGIN) moved with it.

If you ever set these with the CLI, use `--slot-settings` (not `--settings`)
and set them on BOTH slots:

    az webapp config appsettings set -n js-prod-api -g rg-jumpstart-prod \
      --slot-settings WEB_ORIGIN="https://app.jumpstartusa.org" \
      WEB_ORIGIN_ALIASES="https://proud-flower-0e1a5cd0f.7.azurestaticapps.net"
    az webapp config appsettings set -n js-prod-api -g rg-jumpstart-prod --slot staging \
      --slot-settings WEB_ORIGIN="https://app.jumpstartusa.org" \
      WEB_ORIGIN_ALIASES="https://proud-flower-0e1a5cd0f.7.azurestaticapps.net"

Verify after any prod release: a POST with `Origin: https://app.jumpstartusa.org`
must answer 401 (auth), never 403 (origin rejected).
