/**
 * Cloudflare Worker for DeltEcho Chat Browser Target
 *
 * This Worker acts as a proxy to the Container running the browser target.
 * It handles routing, WebSocket upgrades, and container lifecycle management.
 */

import { Container, getContainer } from "@cloudflare/containers";
import { handleCognitiveRequest, CognitiveEnv } from "./cognitive-kv";

export interface Env extends CognitiveEnv {
  DELTECHO_CONTAINER: DurableObjectNamespace;
  DTE_KV: KVNamespace;
  DTE_R2: R2Bucket;
  WEB_PASSWORD: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  DGENKEY?: string;
  NEON_CONNECTION_URI?: string;
}

/**
 * DeltEcho Container configuration
 *
 * Each container instance runs the full browser target server
 * with its own DeltaChat accounts and data.
 */
export class DeltEchoContainer extends Container {
  // Port the container server listens on
  defaultPort = 8080;

  // Ports to wait for during startup
  requiredPorts = [8080];

  // Sleep after 30 minutes of inactivity to save resources
  sleepAfter = "30m";

  // Enable internet access for the container (needed for DeltaChat)
  enableInternet = true;

  // Environment variables for the container
  // Note: These are default values, can be overridden in startAndWaitForPorts
  env = {
    NODE_ENV: "production",
    USE_HTTP_IN_TEST: "true",
    WEB_PORT: "8080",
  };

  /**
   * Called when the container starts successfully
   */
  override onStart() {
    /* ignore-console-log */
    console.log("[DeltEcho] Container started successfully");
  }

  /**
   * Called when the container stops
   */
  override onStop() {
    /* ignore-console-log */
    console.log("[DeltEcho] Container stopped");
  }

  /**
   * Called when an error occurs in the container
   */
  override onError(error: unknown) {
    /* ignore-console-log */
    console.error("[DeltEcho] Container error:", error);
    // Don't rethrow - let the worker handle the error gracefully
  }
}

// Fixed container ID for shared instance mode
// All users share the same container in preview mode
const SHARED_CONTAINER_ID = "deltecho-shared-preview";

/**
 * Main Worker fetch handler
 *
 * Routes requests to the appropriate container instance based on
 * the session or user identifier.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    // Debug endpoint to check environment
    if (url.pathname === "/_debug") {
      return new Response(
        JSON.stringify({
          hasWebPassword: !!env.WEB_PASSWORD,
          webPasswordLength: env.WEB_PASSWORD?.length || 0,
          hasContainer: !!env.DELTECHO_CONTAINER,
          containerMode: "shared",
          containerId: SHARED_CONTAINER_ID,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Handle cognitive persistence routes at the Worker edge (KV + R2)
    // These are intercepted BEFORE forwarding to the container
    if (url.pathname.startsWith("/backend-api/cognitive/")) {
      const cogResponse = await handleCognitiveRequest(request, env, url);
      if (cogResponse) {
        return cogResponse;
      }
    }

    // Handle DreamGen status at the Worker edge
    if (url.pathname === "/backend-api/dreamgen/status" && request.method === "GET") {
      const hasKey = !!env.DGENKEY;
      return new Response(JSON.stringify({
        available: hasKey,
        endpoint: "/backend-api/dreamgen/completions",
        model: "lucid-v1-extra-large",
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle DreamGen text completions proxy at the Worker edge
    // This is used by the DreamGenNarrativeAdapter in the cognitive package
    if (url.pathname === "/backend-api/dreamgen/completions" && request.method === "POST") {
      const dgenKey = env.DGENKEY;
      if (!dgenKey) {
        return new Response(JSON.stringify({
          error: "DreamGen service not configured",
          message: "DGENKEY is not set. Set it via: wrangler secret put DGENKEY",
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      try {
        const body = await request.json() as Record<string, unknown>;
        const dgenResponse = await fetch("https://dreamgen.com/api/openai/v1/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${dgenKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        return new Response(dgenResponse.body, {
          status: dgenResponse.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({
          error: "DreamGen proxy error",
          message: String(error),
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Handle DreamGen chat narrative proxy at the Worker edge
    if (url.pathname === "/backend-api/dreamgen/narrative" && request.method === "POST") {
      const dgenKey = env.DGENKEY;
      if (!dgenKey) {
        return new Response(JSON.stringify({ error: "DGENKEY not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = await request.json();
      const dgenResponse = await fetch("https://dreamgen.com/api/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${dgenKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return new Response(dgenResponse.body, {
        status: dgenResponse.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Handle LLM status at the Worker edge (so it works without container auth)
    if (url.pathname === "/backend-api/llm/status" && request.method === "GET") {
      const hasKey = !!env.OPENAI_API_KEY;
      return new Response(JSON.stringify({
        available: hasKey,
        endpoint: "/backend-api/llm/chat",
        model: "gpt-4.1-mini",
        hasBaseUrl: !!env.OPENAI_BASE_URL,
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Handle LLM proxy at the Worker edge
    if (url.pathname === "/backend-api/llm/chat" && request.method === "POST") {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      try {
        const body = await request.json() as Record<string, unknown>;
        // Normalize the base URL: if it already contains /chat/completions, use it directly
        // Otherwise append /chat/completions to the base URL
        let llmUrl: string;
        const rawBaseUrl = env.OPENAI_BASE_URL || "";
        if (rawBaseUrl && rawBaseUrl.includes("/chat/completions")) {
          llmUrl = rawBaseUrl;
        } else if (rawBaseUrl) {
          // Strip trailing slash and append the path
          llmUrl = rawBaseUrl.replace(/\/+$/, "") + "/chat/completions";
        } else {
          llmUrl = "https://api.openai.com/v1/chat/completions";
        }
        /* ignore-console-log */
        console.log(`[DeltEcho] LLM proxy: ${llmUrl}`);
        const llmResponse = await fetch(llmUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!llmResponse.ok) {
          const errorText = await llmResponse.text();
          /* ignore-console-log */
          console.error(`[DeltEcho] LLM API error: ${llmResponse.status} ${errorText.substring(0, 200)}`);
          return new Response(JSON.stringify({
            error: "LLM API error",
            status: llmResponse.status,
            details: errorText.substring(0, 500),
            url: llmUrl,
          }), {
            status: llmResponse.status,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        return new Response(llmResponse.body, {
          status: llmResponse.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (error) {
        /* ignore-console-log */
        console.error(`[DeltEcho] LLM proxy error:`, error);
        return new Response(JSON.stringify({
          error: "LLM proxy error",
          message: String(error),
        }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // ─── Account Persistence via R2 ───────────────────────────────────
    // The container's disk is ephemeral - backup/restore account data to R2
    // These endpoints are called by the container's startup.sh and backup cron

    if (url.pathname === "/backend-api/accounts/backup" && request.method === "POST") {
      try {
        const tarData = await request.arrayBuffer();
        await env.DTE_R2.put("accounts/accounts-backup.tar.gz", tarData, {
          httpMetadata: { contentType: "application/gzip" },
          customMetadata: {
            backed_up_at: new Date().toISOString(),
            size_bytes: String(tarData.byteLength),
          },
        });
        // Also keep a timestamped copy for safety
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        await env.DTE_R2.put(`accounts/accounts-backup-${ts}.tar.gz`, tarData, {
          httpMetadata: { contentType: "application/gzip" },
        });
        /* ignore-console-log */
        console.log(`[DeltEcho] Account backup stored: ${tarData.byteLength} bytes`);
        return new Response(JSON.stringify({
          stored: true,
          size: tarData.byteLength,
          timestamp: new Date().toISOString(),
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        /* ignore-console-log */
        console.error("[DeltEcho] Account backup failed:", error);
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname === "/backend-api/accounts/restore" && request.method === "GET") {
      try {
        const obj = await env.DTE_R2.get("accounts/accounts-backup.tar.gz");
        if (!obj) {
          return new Response(JSON.stringify({ exists: false }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        /* ignore-console-log */
        console.log(`[DeltEcho] Account restore: serving ${obj.size} bytes`);
        return new Response(obj.body, {
          status: 200,
          headers: {
            "Content-Type": "application/gzip",
            "X-Backup-Date": obj.customMetadata?.backed_up_at || "unknown",
            "Content-Length": String(obj.size),
          },
        });
      } catch (error) {
        /* ignore-console-log */
        console.error("[DeltEcho] Account restore failed:", error);
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname === "/backend-api/accounts/status" && request.method === "GET") {
      try {
        const obj = await env.DTE_R2.head("accounts/accounts-backup.tar.gz");
        return new Response(JSON.stringify({
          exists: !!obj,
          size: obj?.size || 0,
          backed_up_at: obj?.customMetadata?.backed_up_at || null,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ exists: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Validate that WEB_PASSWORD is configured
    if (!env.WEB_PASSWORD) {
      return new Response(
        "Server configuration error: WEB_PASSWORD secret is not set. Please configure it using 'wrangler secret put WEB_PASSWORD'.",
        { status: 500 },
      );
    }

    // Get session ID from cookie for the internal server session management
    // But use a shared container ID for the Cloudflare container
    const sessionId = getSessionId(request);

    try {
      // Use a shared container for all users in preview mode
      // This prevents hitting max_instances limit with many visitors
      const container = getContainer(
        env.DELTECHO_CONTAINER,
        SHARED_CONTAINER_ID,
      );

      /* ignore-console-log */
      console.log("[DeltEcho] Using shared container, session:", sessionId);

      // Start the container with WEB_PASSWORD passed via startOptions
      // This is the correct way to pass secrets to containers per-instance
      await container.startAndWaitForPorts({
        startOptions: {
          envVars: {
            NODE_ENV: "production",
            USE_HTTP_IN_TEST: "true",
            WEB_PORT: "8080",
            WEB_PASSWORD: env.WEB_PASSWORD,
            OPENAI_API_KEY: env.OPENAI_API_KEY || "",
            OPENAI_BASE_URL: env.OPENAI_BASE_URL || "",
            DGENKEY: env.DGENKEY || "",
            NEON_CONNECTION_URI: env.NEON_CONNECTION_URI || "",
            DELTECHO_EXTERNAL_URL: url.origin,
            DELTA_CHAT_RPC_SERVER: "/usr/local/bin/deltachat-rpc-server",
            DC_ACCOUNTS_PATH: "/data/accounts",
            DATA_DIR: "/data",
            DIST_DIR: "/app/dist",
            LOCALES_DIR: "/app/locales",
          },
          enableInternet: true,
        },
        ports: 8080,
        cancellationOptions: {
          instanceGetTimeoutMS: 60000, // 60 seconds to get instance
          portReadyTimeoutMS: 60000, // 60 seconds to wait for port
        },
      });

      /* ignore-console-log */
      console.log("[DeltEcho] Container ready, forwarding request");

      // Check if this is a WebSocket upgrade request
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader?.toLowerCase() === "websocket") {
        // Forward WebSocket requests directly to the container
        return container.fetch(request);
      }

      // Forward HTTP requests to the container
      const response = await container.fetch(request);

      // Add session cookie if not present (for internal server session management)
      if (!request.headers.get("Cookie")?.includes("deltecho-session")) {
        const headers = new Headers(response.headers);
        headers.append(
          "Set-Cookie",
          `deltecho-session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
        );
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

      return response;
    } catch (error) {
      /* ignore-console-log */
      console.error("[DeltEcho] Error handling request:", error);

      // Provide more detailed error information
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      return new Response(
        JSON.stringify({
          error: "Failed to start container",
          message: errorMessage,
          stack: errorStack,
          sessionId,
          containerId: SHARED_CONTAINER_ID,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

/**
 * Extract or generate a session ID for internal server session management
 * Note: This is separate from the container ID - all users share the same container
 */
function getSessionId(request: Request): string {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.match(/deltecho-session=([^;]+)/);

  if (match) {
    return match[1];
  }

  // Generate a new session ID
  return crypto.randomUUID();
}
