using './main.bicep'

param env = 'staging'

/**
 * The CANONICAL origin. Set here, not by hand on the App Service.
 *
 * This was missing, and the parameter defaults to empty — which makes the
 * template point WEB_ORIGIN at the Static Web Apps default hostname. Applying
 * the template without it would have undone the custom-domain cutover: every
 * state-changing request from staging.jumpstartusa.org answering 403, and the
 * derived WebAuthn rpID going with it. The same failure #97 was written about,
 * arriving by a different route.
 */
param customWebOrigin = 'https://staging.jumpstartusa.org'

/**
 * Graph identifiers. Not secrets — a tenant id and an application id — so they
 * belong in version control rather than hand-set on the App Service, which is
 * how they came to be invisible to this template in the first place.
 *
 * The CLIENT SECRET is not here: it lives in Key Vault as `graph-client-secret`
 * and the template references it by name.
 */
param graphTenantId = 'c45dea2f-d715-4993-a517-f7959689cff1'
param graphClientId = 'c6ecea3a-252a-47ce-ab5f-1c0402b9113b'
param emailFrom = 'no-reply@jumpstartusa.org'

/**
 * Secrets are deliberately NOT set here. Empty means "leave whatever is
 * already in Key Vault alone", so this file can be re-applied to change
 * configuration without rotating the session secret, resetting the database
 * password, or blanking the Graph client secret.
 *
 * Bootstrapping a NEW environment, or deliberately rotating one, supplies them
 * on the command line:
 *   -p postgresAdminPassword=$(openssl rand -hex 24)
 *   -p sessionSecret=$(openssl rand -hex 32)
 *   -p encryptionKey=$(openssl rand -hex 32)
 *   -p graphClientSecret=...
 */
