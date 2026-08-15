using './main.bicep'

param env = 'prod'

/**
 * The CANONICAL origin. Set here, not by hand on the App Service.
 *
 * This was missing, and the parameter defaults to empty — which makes the
 * template point WEB_ORIGIN at the Static Web Apps default hostname. Applying
 * the template without it would have undone the custom-domain cutover: every
 * state-changing request from app.jumpstartusa.org answering 403, and the
 * derived WebAuthn rpID going with it. That is exactly the outage #97 was
 * written about, arriving by a different route — the slot-sticky fix protects
 * against a SWAP carrying the wrong value, not against the template supplying
 * one.
 */
param customWebOrigin = 'https://app.jumpstartusa.org'

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
