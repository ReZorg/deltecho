/**
 * FileSessionPersistence - File-based session persistence
 *
 * Stores session data as JSON files in a directory.
 * This is a simple implementation that works across all platforms.
 */

import { getLogger } from "deep-tree-echo-core";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import {
  SessionPersistence,
  PersistedSessionData,
} from "./AutonomousSession.js";

const log = getLogger("deep-tree-echo-orchestrator/FileSessionPersistence");

export class FileSessionPersistence implements SessionPersistence {
  private readonly sessionDir: string;

  constructor(sessionDir?: string) {
    // Default to .deep-tree-echo/sessions in user's home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir && !sessionDir) {
      throw new Error(
        "No home directory found. Please provide a sessionDir or set HOME/USERPROFILE environment variable.",
      );
    }
    this.sessionDir =
      sessionDir ||
      path.join(homeDir!, ".deep-tree-echo", "sessions");
  }

  /**
   * Initialize the session directory
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
      log.info(`Session persistence initialized: ${this.sessionDir}`);
    } catch (error) {
      log.error("Failed to initialize session directory:", error);
      throw error;
    }
  }

  /**
   * Get file path for a session
   * Uses SHA256 hash to prevent collisions from sanitization
   */
  private getSessionPath(sessionId: string): string {
    // Use hash to ensure unique filenames and prevent path traversal
    const hash = crypto.createHash("sha256").update(sessionId).digest("hex");
    return path.join(this.sessionDir, `${hash}.json`);
  }

  /**
   * Save session data
   */
  async save(sessionId: string, data: PersistedSessionData): Promise<void> {
    const filePath = this.getSessionPath(sessionId);

    try {
      const json = JSON.stringify(data, null, 2);
      await fs.writeFile(filePath, json, "utf8");
      log.debug(`Session saved: ${sessionId}`);
    } catch (error) {
      log.error(`Failed to save session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Load session data
   */
  async load(sessionId: string): Promise<PersistedSessionData | null> {
    const filePath = this.getSessionPath(sessionId);

    try {
      const json = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(json) as PersistedSessionData;
      log.debug(`Session loaded: ${sessionId}`);
      return data;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // File doesn't exist - not an error
        return null;
      }
      log.error(`Failed to load session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Delete session data
   */
  async delete(sessionId: string): Promise<void> {
    const filePath = this.getSessionPath(sessionId);

    try {
      await fs.unlink(filePath);
      log.debug(`Session deleted: ${sessionId}`);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // File doesn't exist - not an error
        return;
      }
      log.error(`Failed to delete session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * List all session IDs
   */
  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.sessionDir);
      const sessionIds = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""));
      return sessionIds;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // Directory doesn't exist yet
        return [];
      }
      log.error("Failed to list sessions:", error);
      throw error;
    }
  }

  /**
   * Clean up old sessions (older than maxAgeMs)
   */
  async cleanupOldSessions(maxAgeMs: number): Promise<number> {
    try {
      const sessionIds = await this.list();
      const now = Date.now();
      let cleaned = 0;

      for (const sessionId of sessionIds) {
        const data = await this.load(sessionId);
        if (data && now - data.context.lastActivityAt > maxAgeMs) {
          await this.delete(sessionId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        log.info(`Cleaned up ${cleaned} old sessions`);
      }

      return cleaned;
    } catch (error) {
      log.error("Failed to cleanup old sessions:", error);
      return 0;
    }
  }
}
