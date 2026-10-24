#!/usr/bin/env bash
#
# GridRisk deploy: build the web app against the deployed backend, then cdk deploy.
#
# Expects AWS credentials already in the environment (this script loads no secrets itself).
# Env (all optional unless noted):
#   AWS_REGION       default us-east-1
#   WEB_ORIGIN       passed through to the stack (CORS + Location key referrer)
#   DISPATCH_EMAIL   passed through to the stack (SNS email subscription)
#   DEMO_EMAIL       prefilled on the public sign-in as the guest account (default demo@example.com)
#   DEMO_PASSWORD    the guest account's password, baked into the build so judges can sign in
#
# The web build reads VITE_COGNITO_* from SSM if the stack is already deployed; on a first-ever
# deploy those params do not exist yet, so the build falls back to empty values and you re-run
# the script (or just the web build + a second cdk deploy) once the pool exists.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"

export AWS_REGION="${AWS_REGION:-us-east-1}"

ssm() {
  # Prints the SSM parameter value, or empty string if it does not exist.
  node --import tsx "${SCRIPT_DIR}/ssm-read.ts" "$1"
}

echo "==> Reading Cognito config from SSM (region ${AWS_REGION})"
POOL_ID="$(ssm /gridrisk/cognito-user-pool-id || true)"
CLIENT_ID="$(ssm /gridrisk/cognito-client-id || true)"
KEY_NAME="$(ssm /gridrisk/location-api-key-name || true)"
MAP_KEY=""
if [[ -n "${KEY_NAME}" ]]; then
  MAP_KEY="$(node --import tsx "${SCRIPT_DIR}/location-key.ts" "${KEY_NAME}" || true)"
fi

echo "==> Building apps/web (live mode, same-origin /api)"
VITE_DATA_MODE=live \
VITE_API_URL=/api \
VITE_AWS_REGION="${AWS_REGION}" \
VITE_COGNITO_USER_POOL_ID="${POOL_ID}" \
VITE_COGNITO_CLIENT_ID="${CLIENT_ID}" \
VITE_LOCATION_API_KEY="${MAP_KEY}" \
VITE_GUEST_EMAIL="${DEMO_EMAIL:-demo@example.com}" \
VITE_GUEST_PASSWORD="${DEMO_PASSWORD:-}" \
  npm run build -w @gridrisk/web --prefix "${REPO_ROOT}"

echo "==> Deploying GridRiskStack"
cd "${INFRA_DIR}"
WEB_ORIGIN="${WEB_ORIGIN:-}" \
DISPATCH_EMAIL="${DISPATCH_EMAIL:-}" \
  npx cdk deploy GridRiskStack --require-approval never

echo "==> Done. WebUrl:"
ssm /gridrisk/web-url || true
echo ""
