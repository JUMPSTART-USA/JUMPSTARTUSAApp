// JUMPSTART USA platform — one environment (staging or prod) per resource group.
//   az deployment group create -g rg-jumpstart-<env> -f infra/main.bicep \
//     -p infra/<env>.bicepparam -p postgresAdminPassword=... sessionSecret=...
// See infra/README.md for the full bootstrap sequence.

@allowed(['staging', 'prod'])
param env string

param location string = resourceGroup().location

// Static Web Apps is only offered in a subset of regions.
param swaLocation string = 'eastus2'

@secure()
@minLength(16)
@description('Postgres admin password. Use URL-safe characters only (openssl rand -hex 24) — it is embedded in DATABASE_URL.')
param postgresAdminPassword string

@secure()
@minLength(32)
@description('Express session signing secret (openssl rand -hex 32).')
param sessionSecret string

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
    administratorLoginPassword: postgresAdminPassword
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

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-url'
  properties: {
    value: 'postgresql://${pgAdminUser}:${postgresAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${pgDatabase}?schema=public&sslmode=require'
  }
}

resource secretSessionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'session-secret'
  properties: {
    value: sessionSecret
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

var apiAppSettings = [
  // Placeholder image listens on 80 until the first CI deploy overrides the container.
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
  { name: 'DATABASE_URL', value: '@Microsoft.KeyVault(SecretUri=${secretDatabaseUrl.properties.secretUri})' }
  { name: 'SESSION_SECRET', value: '@Microsoft.KeyVault(SecretUri=${secretSessionSecret.properties.secretUri})' }
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
      linuxFxVersion: 'DOCKER|mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
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
      linuxFxVersion: 'DOCKER|mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
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
