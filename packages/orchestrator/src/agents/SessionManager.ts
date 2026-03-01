/**
 * SessionManager - Manages multiple autonomous chat sessions
 *
 * Provides session lifecycle management, automatic persistence,
 * and cleanup of idle sessions.
 */

import { getLogger } from "deep-tree-echo-core";
import {
  AutonomousSession,
  SessionPersistence,
  SessionContext,
} from "./AutonomousSession.js";

const log = getLogger("deep-tree-echo-orchestrator/SessionManager");

export interface SessionManagerConfig {
  /** Session persistence implementation */
  persistence?: SessionPersistence;
  /** Maximum number of concurrent sessions */
  maxSessions?: number;
  /** Idle timeout in milliseconds (default: 1 hour) */
  idleTimeoutMs?: number;
  /** Maximum conversation history per session (default: 100 messages) */
  maxHistoryPerSession?: number;
  /** Auto-persist interval in milliseconds (default: 30 seconds) */
  autoPersistIntervalMs?: number;
  /** Session cleanup interval in milliseconds (default: 5 minutes) */
  cleanupIntervalMs?: number;
}

export class SessionManager {
  private sessions: Map<string, AutonomousSession> = new Map();
  private config: Required<SessionManagerConfig>;
  private persistTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: SessionManagerConfig = {}) {
    this.config = {
      persistence: config.persistence ?? undefined!,
      maxSessions: config.maxSessions ?? 100,
      idleTimeoutMs: config.idleTimeoutMs ?? 60 * 60 * 1000, // 1 hour
      maxHistoryPerSession: config.maxHistoryPerSession ?? 100,
      autoPersistIntervalMs: config.autoPersistIntervalMs ?? 30 * 1000, // 30 seconds
      cleanupIntervalMs: config.cleanupIntervalMs ?? 5 * 60 * 1000, // 5 minutes
    };

    log.info("SessionManager initialized", {
      maxSessions: this.config.maxSessions,
      idleTimeoutMs: this.config.idleTimeoutMs,
      hasPersistence: !!this.config.persistence,
    });
  }

  /**
   * Start automatic persistence and cleanup
   */
  start(): void {
    if (this.config.persistence) {
      this.persistTimer = setInterval(() => {
        this.persistAllSessions().catch((error) => {
          log.error("Auto-persist failed:", error);
        });
      }, this.config.autoPersistIntervalMs);

      log.info(
        `Auto-persist enabled (interval: ${this.config.autoPersistIntervalMs}ms)`,
      );
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleSessions().catch((error) => {
        log.error("Cleanup failed:", error);
      });
    }, this.config.cleanupIntervalMs);

    log.info(
      `Auto-cleanup enabled (interval: ${this.config.cleanupIntervalMs}ms)`,
    );
  }

  /**
   * Stop automatic persistence and cleanup
   */
  async stop(): Promise<void> {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Final persist before shutdown
    if (this.config.persistence) {
      await this.persistAllSessions();
    }

    log.info("SessionManager stopped");
  }

  /**
   * Get or create a session
   */
  async getOrCreateSession(
    accountId: number,
    chatId: number,
    contactId: number,
    isGroup: boolean,
  ): Promise<AutonomousSession> {
    const sessionId = AutonomousSession.generateSessionId(accountId, chatId);

    // Check if session already exists
    let session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }

    // Check session limit
    if (this.sessions.size >= this.config.maxSessions) {
      await this.evictOldestSession();
    }

    // Create or restore session
    session = await AutonomousSession.createOrRestore(
      accountId,
      chatId,
      contactId,
      isGroup,
      this.config.persistence,
    );

    this.sessions.set(sessionId, session);

    log.info(`Session created/restored: ${sessionId}`, {
      totalSessions: this.sessions.size,
    });

    return session;
  }

  /**
   * Get an existing session
   */
  getSession(accountId: number, chatId: number): AutonomousSession | undefined {
    const sessionId = AutonomousSession.generateSessionId(accountId, chatId);
    return this.sessions.get(sessionId);
  }

  /**
   * Remove a session
   */
  async removeSession(accountId: number, chatId: number): Promise<void> {
    const sessionId = AutonomousSession.generateSessionId(accountId, chatId);
    const session = this.sessions.get(sessionId);

    if (session) {
      await session.persist();
      this.sessions.delete(sessionId);
      log.info(`Session removed: ${sessionId}`);
    }
  }

  /**
   * Delete a session (remove from memory and persistence)
   */
  async deleteSession(accountId: number, chatId: number): Promise<void> {
    const sessionId = AutonomousSession.generateSessionId(accountId, chatId);
    const session = this.sessions.get(sessionId);

    if (session) {
      await session.delete();
      this.sessions.delete(sessionId);
      log.info(`Session deleted: ${sessionId}`);
    }
  }

  /**
   * Persist all active sessions
   */
  private async persistAllSessions(): Promise<void> {
    const promises = Array.from(this.sessions.values()).map((session) =>
      session.persist().catch((error) => {
        log.error(
          `Failed to persist session ${session.getSessionId()}:`,
          error,
        );
      }),
    );

    await Promise.all(promises);
    log.debug(`Persisted ${promises.length} sessions`);
  }

  /**
   * Clean up idle sessions
   */
  private async cleanupIdleSessions(): Promise<void> {
    const idleSessionIds: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.isIdle(this.config.idleTimeoutMs)) {
        idleSessionIds.push(sessionId);
      }

      // Trim history to max size
      session.trimHistory(this.config.maxHistoryPerSession);
    }

    for (const sessionId of idleSessionIds) {
      const session = this.sessions.get(sessionId);
      if (session) {
        await session.persist();
        this.sessions.delete(sessionId);
      }
    }

    if (idleSessionIds.length > 0) {
      log.info(`Cleaned up ${idleSessionIds.length} idle sessions`);
    }
  }

  /**
   * Evict the oldest session (by last activity)
   */
  private async evictOldestSession(): Promise<void> {
    let oldestSession: AutonomousSession | undefined;
    let oldestActivity = Date.now();

    for (const session of this.sessions.values()) {
      const lastActivity = session.getContext().lastActivityAt;
      if (lastActivity < oldestActivity) {
        oldestActivity = lastActivity;
        oldestSession = session;
      }
    }

    if (oldestSession) {
      const sessionId = oldestSession.getSessionId();
      await oldestSession.persist();
      this.sessions.delete(sessionId);
      log.warn(`Evicted oldest session due to limit: ${sessionId}`);
    }
  }

  /**
   * Get all active session contexts
   */
  getActiveSessions(): SessionContext[] {
    return Array.from(this.sessions.values()).map((session) =>
      session.getContext(),
    );
  }

  /**
   * Get session statistics
   */
  getStats(): {
    activeSessions: number;
    totalMessages: number;
    averageSessionAge: number;
  } {
    let totalMessages = 0;
    let totalAge = 0;

    for (const session of this.sessions.values()) {
      const context = session.getContext();
      totalMessages += context.messageCount;
      totalAge += session.getAge();
    }

    return {
      activeSessions: this.sessions.size,
      totalMessages,
      averageSessionAge:
        this.sessions.size > 0 ? totalAge / this.sessions.size : 0,
    };
  }
}
