#!/usr/bin/env bash
# Run a one-off Azure Container Instance inside the environment's VNet (the
# database has no public endpoint). By default the jumpstart-migrate image's
# own CMD runs (`prisma migrate deploy`); set JOB_COMMAND to run something
# else in the same image — e.g. the sample seeders. Fails the pipeline if the
# container exits non-zero.
#
# Required env: AZURE_RG, ACR_NAME, KEYVAULT_NAME, JOBS_SUBNET_ID,
#               JOBS_IDENTITY_ID, IMAGE_TAG, JOB_NAME
# Optional env: JOB_COMMAND (overrides the image CMD)
#               JOB_NEEDS_ENCRYPTION_KEY=true — also pass ENCRYPTION_KEY, read
#               from the same vault. Opt-in rather than always: `migrate
#               deploy` has no business holding the key that decrypts TOTP
#               secrets, and a job should carry only what it needs.
set -euo pipefail

# Migrations and seeds run as app_migrator — the only role permitted to change
# the schema (docs/database-roles.md). An environment that has not had the
# least-privilege roles applied has no migrator-database-url secret and falls
# back to database-url, which is still the administrator credential there.
#
# The fallback is announced rather than silent: once an environment has been
# converted, seeing this line again means DDL is about to run on the API's own
# credential, which is precisely what the role split exists to prevent.
DATABASE_URL=$(az keyvault secret show \
  --vault-name "$KEYVAULT_NAME" --name migrator-database-url --query value -o tsv 2>/dev/null || true)

if [ -z "$DATABASE_URL" ]; then
  echo "NOTE: no migrator-database-url secret in $KEYVAULT_NAME — falling back to database-url."
  echo "      Least-privilege roles are not applied in this environment (docs/database-roles.md)."
  DATABASE_URL=$(az keyvault secret show \
    --vault-name "$KEYVAULT_NAME" --name database-url --query value -o tsv)
fi

SECRET_ENV=(DATABASE_URL="$DATABASE_URL")
if [ "${JOB_NEEDS_ENCRYPTION_KEY:-}" = "true" ]; then
  ENCRYPTION_KEY=$(az keyvault secret show \
    --vault-name "$KEYVAULT_NAME" --name encryption-key --query value -o tsv)
  SECRET_ENV+=(ENCRYPTION_KEY="$ENCRYPTION_KEY")
fi

cleanup() {
  az container delete -g "$AZURE_RG" -n "$JOB_NAME" --yes >/dev/null 2>&1 || true
}
trap cleanup EXIT

COMMAND_ARGS=()
if [ -n "${JOB_COMMAND:-}" ]; then
  COMMAND_ARGS=(--command-line "$JOB_COMMAND")
fi

az container create \
  --resource-group "$AZURE_RG" \
  --name "$JOB_NAME" \
  --image "$ACR_NAME.azurecr.io/jumpstart-migrate:$IMAGE_TAG" \
  --acr-identity "$JOBS_IDENTITY_ID" \
  --assign-identity "$JOBS_IDENTITY_ID" \
  --subnet "$JOBS_SUBNET_ID" \
  --os-type Linux --cpu 1 --memory 1.5 \
  --restart-policy Never \
  --secure-environment-variables "${SECRET_ENV[@]}" \
  ${COMMAND_ARGS[@]+"${COMMAND_ARGS[@]}"} \
  --output none

echo "Job container started; waiting for completion…"
for i in $(seq 1 60); do
  state=$(az container show -g "$AZURE_RG" -n "$JOB_NAME" \
    --query 'containers[0].instanceView.currentState.state' -o tsv 2>/dev/null || echo "Pending")
  if [ "$state" = "Terminated" ]; then
    exit_code=$(az container show -g "$AZURE_RG" -n "$JOB_NAME" \
      --query 'containers[0].instanceView.currentState.exitCode' -o tsv)
    echo "--- job logs ---"
    az container logs -g "$AZURE_RG" -n "$JOB_NAME" || true
    echo "----------------"
    if [ "$exit_code" = "0" ]; then
      echo "Job completed."
      exit 0
    fi
    echo "Job failed with exit code $exit_code"
    exit 1
  fi
  sleep 5
done

echo "Timed out waiting for the job container."
az container logs -g "$AZURE_RG" -n "$JOB_NAME" || true
exit 1
