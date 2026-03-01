#!/bin/bash

# Exit on error
set -e

# --- Configuration ---
WRANGLER_CONFIG_PATH="packages/target-browser/wrangler.jsonc"

# --- Pre-flight Checks ---
echo "🚀 Starting deltecho Cloudflare Deployment..."

# Check for .env file
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found. Please copy .env.template to .env and fill in the values."
    exit 1
fi

# Source environment variables
source .env

# Check for required environment variables
if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "❌ Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set in .env"
    exit 1
fi

# Check for wrangler
if ! command -v wrangler &> /dev/null
then
    echo "❌ Error: wrangler could not be found. Please install with 'pnpm add -g wrangler'."
    exit 1
fi

# --- Deployment ---
echo "
🔒 Setting secrets..."
wrangler secret put WEB_PASSWORD --config "$WRANGLER_CONFIG_PATH" <<< "$WEB_PASSWORD"
wrangler secret put DC_EMAIL --config "$WRANGLER_CONFIG_PATH" <<< "$DC_EMAIL"
wrangler secret put DC_PASSWORD --config "$WRANGLER_CONFIG_PATH" <<< "$DC_PASSWORD"
echo "✅ Secrets set successfully."

echo "
📦 Building and deploying to Cloudflare Containers..."

# Run wrangler deploy
# The GITHUB_SHA is used in the Dockerfile to tag the build
wrangler deploy --config "$WRANGLER_CONFIG_PATH" --containers-rollout=immediate --vars '{"VERSION_INFO_GIT_REF":"'$(git rev-parse --short HEAD)'"}'
