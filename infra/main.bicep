// JUMPSTART USA platform — one environment (staging or prod) per resource group.
//   az deployment group create -g rg-jumpstart-<env> -f infra/main.bicep \
//     -p infra/<env>.bicepparam -p postgresAdminPassword=... sessionSecret=...
// See infra/README.md for the full bootstrap sequence.

@allowed(['staging', 'prod'])
param env string

param location string = resourceGroup().location

// Static Web Apps is only offered in a subset of regions.
param swaLocation string = 'eastus2'

/**
 * SECRETS ARE OPTIONAL, and an empty value means "this deployment does not
 * manage that secret" — it is left exactly as it is in Key Vault.
 *
 * They used to be required, and infra/README told you to generate fresh random
 * ones on every deployment. That is correct for the first bootstrap and
 * actively dangerous afterwards: re-running it would have reset the live
 * Postgres admin password and rotated SESSION_SECRET, signing every user out.
 * A template you cannot safely re-run is a template that stops describing
 * reality, which is how WEB_ORIGIN came to be set by hand (see #97).
 *
 * Bootstrap: supply all of them. Re-run to change configuration: supply none.
 */
@secure()
@description('Postgres admin password. EMPTY leaves the existing server password and database-url secret untouched. Only set it on first bootstrap, or to deliberately rotate.')
param postgresAdminPassword string = ''

@secure()
@description('Express session signing secret (openssl rand -hex 32). EMPTY leaves the existing one alone — rotating it signs every user out.')
param sessionSecret string = ''

@secure()
@description('AES-256-GCM key for encrypted columns, 64 hex chars (openssl rand -hex 32). EMPTY leaves the existing one alone. Rotating it makes every stored TOTP secret unreadable and forces enrolled users to re-enroll — treat it like the database password.')
param encryptionKey string = ''

// ── Outbound email (Microsoft Graph, client credentials) ────────────────────
// Security NOTIFICATIONS ride on this, not just invitations: account lockout,
// second-factor reset, email and role changes. With it unset the API still
// runs and every one of those is silently skipped, which is why /api/health
// reports mail status and the API says so at boot.
//
// Needs an Entra app registration with the Mail.Send APPLICATION permission,
// admin-consented, and a mailbox to send as (EMAIL_FROM).
@description('Entra tenant id for the Mail.Send app registration. Empty disables outbound email.')
param graphTenantId string = ''

@description('Entra application (client) id for the Mail.Send app registration.')
param graphClientId string = ''

@secure()
@description('Client secret for the Mail.Send app registration. Empty disables outbound email.')
param graphClientSecret string = ''

@description('Mailbox notifications are sent from. Must exist in the tenant.')
param emailFrom string = 'no-reply@jumpstartusa.org'

// Custom front-door origin (e.g. https://app.jumpstartusa.org). Empty = the
// SWA default hostname stays canonical. When set, the default hostname moves
// to WEB_ORIGIN_ALIASES so both hosts keep working through a cutover.
param customWebOrigin string = ''

var prefix = 'js-${env}'
var uniq = take(uniqueString(resourceGroup().id), 6)
var isProd = env == 'prod'
var pgAdminUser = 'jumpstart_admin'
var pgDatabase = 'jumpstart'

// ── Telemetry ───────────────────────────────────────────────────────────────

resource logs 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

// ── Network: app integration subnet, delegated DB subnet, one-off jobs ─────

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: '${prefix}-vnet'
  location: location
  properties: {
    addressSpace: { addressPrefixes: ['10.20.0.0/16'] }
    subnets: [
      {
        name: 'snet-app'
        properties: {
          addressPrefix: '10.20.1.0/24'
          delegations: [
            { name: 'appservice', properties: { serviceName: 'Microsoft.Web/serverFarms' } }
          ]
        }
      }
      {
        name: 'snet-db'
        properties: {
          addressPrefix: '10.20.2.0/24'
          delegations: [
            { name: 'postgres', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }
          ]
        }
      }
      {
        name: 'snet-jobs'
        properties: {
          addressPrefix: '10.20.3.0/24'
          delegations: [
            { name: 'aci', properties: { serviceName: 'Microsoft.ContainerInstance/containerGroups' } }
          ]
        }
      }
    ]
  }
}

resource pgDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${prefix}.private.postgres.database.azure.com'
  location: 'global'
}

resource pgDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: pgDnsZone
  name: '${prefix}-vnet-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

// ── PostgreSQL Flexible Server (private access only) ───────────────────────

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-03-01-preview' = {
  name: '${prefix}-pg-${uniq}'
  location: location
  sku: {
    name: 'Standard_B2s'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: pgAdminUser
    // null is omitted from the request, so an unspecified password leaves the
    // live server's password exactly as it is.
    administratorLoginPassword: empty(postgresAdminPassword) ? null : postgresAdminPassword
    storage: { storageSizeGB: 32, autoGrow: 'Enabled' }
    backup: {
      backupRetentionDays: 14
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: '${vnet.id}/subnets/snet-db'
      privateDnsZoneArmResourceId: pgDnsZone.id
    }
  }
  dependsOn: [pgDnsLink]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-03-01-preview' = {
  parent: postgres
  name: pgDatabase
}

// ── Container registry ──────────────────────────────────────────────────────

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acrjs${env}${uniq}'
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
  }
}

// ── Key Vault (RBAC mode) + secrets ─────────────────────────────────────────

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${prefix}-${uniq}'
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    /**
     * ONE-WAY DOOR: purge protection cannot be turned off once it is on, and
     * the vault (and any deleted secret in it) then cannot be purged before
     * the 30-day retention elapses. That is the point — it stops a sufficiently
     * privileged compromise from destroying SESSION_SECRET and the database
     * credential outright. The cost is that a torn-down environment holds its
     * vault name for 30 days, so redeploying this template from scratch under
     * the same name inside that window will fail on the name still being taken.
     */
    enablePurgeProtection: true
  }
}

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(postgresAdminPassword)) {
  parent: keyVault
  name: 'database-url'
  properties: {
    value: 'postgresql://${pgAdminUser}:${postgresAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${pgDatabase}?schema=public&sslmode=require'
  }
}

resource secretSessionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(sessionSecret)) {
  parent: keyVault
  name: 'session-secret'
  properties: {
    value: sessionSecret
  }
}

resource secretEncryptionKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(encryptionKey)) {
  parent: keyVault
  name: 'encryption-key'
  properties: {
    value: encryptionKey
  }
}

resource secretGraphClientSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(graphClientSecret)) {
  parent: keyVault
  name: 'graph-client-secret'
  properties: {
    value: graphClientSecret
  }
}

// ── Identity for one-off jobs (CI-triggered migration containers) ──────────

resource jobsIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-jobs-identity'
  location: location
}

// ── App Service (Linux container) ───────────────────────────────────────────

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${prefix}-plan'
  location: location
  kind: 'linux'
  sku: isProd ? { name: 'P0v3', tier: 'Premium0V3' } : { name: 'B1', tier: 'Basic' }
  properties: {
    reserved: true
  }
}

/**
 * The container image. EMPTY means "leave whatever is deployed alone".
 *
 * The template used to hardcode the containerapps-helloworld placeholder, on
 * the reasoning that the first CI deploy overrides it. True at bootstrap, and
 * a live-environment outage on every re-run after that: what-if showed this
 * replacing the running API with the placeholder until the next merge to main
 * happened to re-set it. Same shape of bug as the secrets above — a bootstrap
 * value re-applied to a running system.
 */
@description('Container image for the API, e.g. myacr.azurecr.io/jumpstart-api:sha. EMPTY leaves the currently deployed image untouched — CI owns this after bootstrap.')
param containerImage string = ''

var apiAppSettings = [
  { name: 'WEBSITES_PORT', value: '3001' }
  { name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE', value: 'false' }
  { name: 'API_PORT', value: '3001' }
  /**
   * BOTH deployed environments run the production code path. Staging used to
   * run NODE_ENV=staging, and because every production protection was gated on
   * `NODE_ENV === 'production'`, that one string turned three of them off at
   * once on a public HTTPS host: the Secure cookie flag, the Swagger gate and
   * the error-detail gate. Staging exists to exercise what production runs.
   *
   * APP_ENV carries the "which deployment is this" meaning instead. Nothing in
   * the API gates behaviour on it — see apps/api/src/config/env.ts.
   */
  { name: 'NODE_ENV', value: 'production' }
  { name: 'APP_ENV', value: isProd ? 'production' : 'staging' }
  // Swagger publishes the whole API surface and mounts outside the Nest
  // guards, so it stays off in both deployed environments.
  { name: 'ENABLE_API_DOCS', value: 'false' }
  {
    name: 'WEB_ORIGIN'
    value: customWebOrigin != '' ? customWebOrigin : 'https://${staticSite.properties.defaultHostname}'
  }
  {
    name: 'WEB_ORIGIN_ALIASES'
    value: customWebOrigin != '' ? 'https://${staticSite.properties.defaultHostname}' : ''
  }
  // NOTE: there is deliberately no RP_ID setting. The API derives the WebAuthn
  // relying-party id from WEB_ORIGIN's host (config/env.ts rpId()) precisely so
  // it cannot drift; a standalone RP_ID here was dead config that read as
  // though it configured passkey binding.
  /**
   * VaultName/SecretName rather than SecretUri: a SecretUri has to be read off
   * the secret RESOURCE, which only exists in this deployment when the run is
   * managing that secret. Referencing by name resolves to the current version
   * either way, so a configuration-only re-run keeps pointing at the secrets
   * that are already there.
   */
  { name: 'DATABASE_URL', value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=database-url)' }
  { name: 'SESSION_SECRET', value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=session-secret)' }
  { name: 'ENCRYPTION_KEY', value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=encryption-key)' }
  { name: 'GRAPH_TENANT_ID', value: graphTenantId }
  { name: 'GRAPH_CLIENT_ID', value: graphClientId }
  { name: 'EMAIL_FROM', value: emailFrom }
  { name: 'GRAPH_CLIENT_SECRET', value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=graph-client-secret)' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
]

resource api 'Microsoft.Web/sites@2023-12-01' = {
  name: '${prefix}-api'
  location: location
  kind: 'app,linux,container'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    virtualNetworkSubnetId: '${vnet.id}/subnets/snet-app'
    vnetRouteAllEnabled: true
    siteConfig: {
      // null is omitted from the request, so the deployed image stays put.
      linuxFxVersion: empty(containerImage) ? null : 'DOCKER|${containerImage}'
      acrUseManagedIdentityCreds: true
      alwaysOn: true
      healthCheckPath: '/api/health'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      appSettings: apiAppSettings
    }
  }
}

/**
 * Settings that must NOT travel with a slot swap.
 *
 * Learned the hard way (2026-08-14): WEB_ORIGIN was set by hand on the
 * production slot after the custom-domain cutover, the next release swapped
 * the slots, and the pre-cutover value rode back into production — every
 * state-changing request from app.jumpstartusa.org started answering 403
 * "Cross-origin request rejected", and the derived WebAuthn rpID went with
 * it. Sticky settings stay bound to the slot they are set on.
 */
resource apiSlotStickySettings 'Microsoft.Web/sites/config@2023-12-01' = if (isProd) {
  parent: api
  name: 'slotConfigNames'
  properties: {
    appSettingNames: ['WEB_ORIGIN', 'WEB_ORIGIN_ALIASES']
  }
}

// Zero-downtime releases in prod: deploy to the slot, warm it, swap.
resource apiStagingSlot 'Microsoft.Web/sites/slots@2023-12-01' = if (isProd) {
  parent: api
  name: 'staging'
  location: location
  kind: 'app,linux,container'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    virtualNetworkSubnetId: '${vnet.id}/subnets/snet-app'
    vnetRouteAllEnabled: true
    siteConfig: {
      // null is omitted from the request, so the deployed image stays put.
      linuxFxVersion: empty(containerImage) ? null : 'DOCKER|${containerImage}'
      acrUseManagedIdentityCreds: true
      alwaysOn: true
      healthCheckPath: '/api/health'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: apiAppSettings
    }
  }
}

// ── Static Web App, serving the SPA with /api/* proxied to App Service ─────

resource staticSite 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${prefix}-web'
  location: swaLocation
  sku: { name: 'Standard', tier: 'Standard' }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

resource swaBackend 'Microsoft.Web/staticSites/linkedBackends@2023-12-01' = {
  parent: staticSite
  name: 'api'
  properties: {
    backendResourceId: api.id
    region: location
  }
}

// ── RBAC: pull images + read secrets ────────────────────────────────────────

var acrPullRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var kvSecretsUserRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource apiAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, api.id, 'acrpull')
  scope: acr
  properties: {
    roleDefinitionId: acrPullRole
    principalId: api.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource apiKvRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, api.id, 'kvread')
  scope: keyVault
  properties: {
    roleDefinitionId: kvSecretsUserRole
    principalId: api.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource jobsAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, jobsIdentity.id, 'acrpull')
  scope: acr
  properties: {
    roleDefinitionId: acrPullRole
    principalId: jobsIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource slotAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (isProd) {
  name: guid(acr.id, api.id, 'slot-acrpull')
  scope: acr
  properties: {
    roleDefinitionId: acrPullRole
    principalId: apiStagingSlot.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource slotKvRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (isProd) {
  name: guid(keyVault.id, api.id, 'slot-kvread')
  scope: keyVault
  properties: {
    roleDefinitionId: kvSecretsUserRole
    principalId: apiStagingSlot.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Outputs — record these as GitHub environment variables ─────────────────

output webAppName string = api.name
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output keyVaultName string = keyVault.name
output staticWebAppName string = staticSite.name
output staticWebAppHostname string = staticSite.properties.defaultHostname
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
output jobsSubnetId string = '${vnet.id}/subnets/snet-jobs'
output jobsIdentityId string = jobsIdentity.id
