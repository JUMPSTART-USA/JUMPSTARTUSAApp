#!/usr/bin/env bash
# Run `prisma migrate deploy` as a one-off Azure Container Instance inside the
# environment's VNet (the database has no public endpoint). Fails the pipeline
# if the migration container exits non-zero.
#
# Required env: AZURE_RG, ACR_NAME, KEYVAULT_NAME, JOBS_SUBNET_ID,
#               JOBS_IDENTITY_ID, IMAGE_TAG, JOB_NAME
set -euo pipefail

DATABASE_URL=$(az keyvault secret show \
  --vault-name "$KEYVAULT_NAME" --name database-url --query value -o tsv)

cleanup() {
  az container delete -g "$AZURE_RG" -n "$JOB_NAME" --yes >/dev/null 2>&1 || true
}
trap cleanup EXIT

az container create \
  --resource-group "$AZURE_RG" \
  --name "$JOB_NAME" \
  --image "$ACR_NAME.azurecr.io/jumpstart-migrate:$IMAGE_TAG" \
  --acr-identity "$JOBS_IDENTITY_ID" \
  --assign-identity "$JOBS_IDENTITY_ID" \
  --subnet "$JOBS_SUBNET_ID" \
  --os-type Linux --cpu 1 --memory 1.5 \
  --restart-policy Never \
  --secure-environment-variables DATABASE_URL="$DATABASE_URL" \
  --output none

echo "Migration container started; waiting for completion…"
for i in $(seq 1 60); do
  state=$(az container show -g "$AZURE_RG" -n "$JOB_NAME" \
    --query 'containers[0].instanceView.currentState.state' -o tsv 2>/dev/null || echo "Pending")
  if [ "$state" = "Terminated" ]; then
    exit_code=$(az container show -g "$AZURE_RG" -n "$JOB_NAME" \
      --query 'containers[0].instanceView.currentState.exitCode' -o tsv)
    echo "--- migration logs ---"
    az container logs -g "$AZURE_RG" -n "$JOB_NAME" || true
    echo "----------------------"
    if [ "$exit_code" = "0" ]; then
      echo "Migrations applied."
      exit 0
    fi
    echo "Migration failed with exit code $exit_code"
    exit 1
  fi
  sleep 5
done

echo "Timed out waiting for the migration container."
az container logs -g "$AZURE_RG" -n "$JOB_NAME" || true
exit 1
