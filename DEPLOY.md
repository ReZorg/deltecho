# deltecho Cloudflare Deployment

This directory contains the artifacts for deploying the `deltecho` cognitive chat orchestrator to Cloudflare Containers.

## Prerequisites

1.  **Cloudflare Account**: You need a Cloudflare account with Workers & Pages enabled.
2.  **Docker**: Docker must be installed locally to build the container image.
3.  **Wrangler**: The Cloudflare CLI (`wrangler`) must be installed (`pnpm add -g wrangler`).
4.  **Email Account**: A dedicated IMAP/SMTP email account for the bot.

## Configuration

1.  Copy `.env.template` to `.env`:

    ```bash
    cp .env.template .env
    ```

2.  Fill in the required values in the `.env` file:

    - `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token with `Workers Scripts: Edit` permissions.
    - `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID.
    - `WEB_PASSWORD`: A password to protect the web UI.
    - `DC_EMAIL`: The bot's email address.
    - `DC_PASSWORD`: The bot's email password.

## Deployment Steps

1.  **Login to Wrangler**:

    ```bash
    npx wrangler login
    ```

2.  **Set Cloudflare Secrets**:

    Load the environment variables from your `.env` file and set them as secrets for the Cloudflare worker.

    ```bash
    source .env
    npx wrangler secret put WEB_PASSWORD <<< "$WEB_PASSWORD"
    npx wrangler secret put DC_EMAIL <<< "$DC_EMAIL"
    npx wrangler secret put DC_PASSWORD <<< "$DC_PASSWORD"
    ```

3.  **Deploy**:

    Run the deploy script from the root of the repository. This will build the Docker image and deploy it to Cloudflare Containers.

    ```bash
    ./deploy-cloudflare.sh
    ```

    The script will output the URL of your deployed bot.

## Architecture

-   **`Dockerfile.cloudflare`**: A multi-stage Dockerfile that builds the self-contained `server.js` and packages it into a minimal Node.js image with the `deltachat-rpc-server` binary.
-   **`packages/target-browser/wrangler.jsonc`**: Configures the Cloudflare Worker, the container binding, and Durable Objects for state.
-   **`packages/target-browser/cloudflare/worker.ts`**: The Cloudflare Worker entrypoint that proxies requests to the running container.
-   **`.env.template`**: A template for the required environment variables and secrets.
-   **`deploy-cloudflare.sh`**: A convenience script to automate the deployment process.
