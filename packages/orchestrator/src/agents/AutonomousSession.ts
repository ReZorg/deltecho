/**
 * AutonomousSession - Explicit session state management for autonomous chat
 *
 * This class manages the lifecycle and context of autonomous chat sessions
 * between Deep Tree Echo AI and DeltaChat users.
 */

import { getLogger } from "deep-tree-echo-core";

const log = getLogger("deep-tree-echo-orchestrator/AutonomousSession");

export interface SessionContext {
  /** DeltaChat account ID */
  accountId: number;
  /** DeltaChat chat ID */
  chatId: number;
  /** Contact/user ID */
  contactId: number;
  /** Is this a group chat? */
  isGroup: boolean;
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Number of messages exchanged in this session */
  messageCount: number;
  /** Session-specific context for cognitive processing */
  cognitiveContext?: Record<string, any>;
  /** Current cognitive tier being used */
  cognitiveTier?: "BASIC" | "SYS6" | "MEMBRANE" | "ADAPTIVE";
  /** Average complexity score of messages in this session */
  averageComplexity?: number;
}

export interface PersistedSessionData {
  context: SessionContext;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: number;
  }>;
}

export interface SessionPersistence {
  save(sessionId: string, data: PersistedSessionData): Promise<void>;
  load(sessionId: string): Promise<PersistedSessionData | null>;
  delete(sessionId: string): Promise<void>;
  list(): Promise<string[]>;
}

/**
 * AutonomousSession manages the state and lifecycle of a chat session
 */
export class AutonomousSession {
  private readonly sessionId: string;
  private context: SessionContext;
  private conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: number;
  }> = [];
  private persistence?: SessionPersistence;
  private isDirty: boolean = false;

  constructor(
    context: SessionContext,
    persistence?: SessionPersistence,
  ) {
    this.sessionId = AutonomousSession.generateSessionId(
      context.accountId,
      context.chatId,
    );
    this.context = context;
    this.persistence = persistence;
    
    log.debug(`Created session ${this.sessionId}`, {
      accountId: context.accountId,
      chatId: context.chatId,
      isGroup: context.isGroup,
    });
  }

  /**
   * Generate a unique session ID from account and chat IDs
   */
  static generateSessionId(accountId: number, chatId: number): string {
    return `session-${accountId}-${chatId}`;
  }

  /**
   * Create or restore a session
   */
  static async createOrRestore(
    accountId: number,
    chatId: number,
    contactId: number,
    isGroup: boolean,
    persistence?: SessionPersistence,
  ): Promise<AutonomousSession> {
    const sessionId = AutonomousSession.generateSessionId(accountId, chatId);

    // Try to restore from persistence
    if (persistence) {
      try {
        const persisted = await persistence.load(sessionId);
        if (persisted) {
          log.info(`Restored session ${sessionId} from persistence`);
          const session = new AutonomousSession(
            persisted.context,
            persistence,
          );
          session.conversationHistory = persisted.conversationHistory;
          return session;
        }
      } catch (error) {
        log.warn(`Failed to restore session ${sessionId}:`, error);
      }
    }

    // Create new session
    const context: SessionContext = {
      accountId,
      chatId,
      contactId,
      isGroup,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      messageCount: 0,
    };

    return new AutonomousSession(context, persistence);
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get session context
   */
  getContext(): Readonly<SessionContext> {
    return this.context;
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): ReadonlyArray<{
    role: "user" | "assistant";
    content: string;
    timestamp: number;
  }> {
    return this.conversationHistory;
  }

  /**
   * Add a user message to the conversation
   */
  addUserMessage(content: string): void {
    this.conversationHistory.push({
      role: "user",
      content,
      timestamp: Date.now(),
    });
    this.context.messageCount++;
    this.context.lastActivityAt = Date.now();
    this.isDirty = true;
    
    log.debug(`User message added to ${this.sessionId}`, {
      messageCount: this.context.messageCount,
    });
  }

  /**
   * Add an assistant response to the conversation
   */
  addAssistantMessage(content: string): void {
    this.conversationHistory.push({
      role: "assistant",
      content,
      timestamp: Date.now(),
    });
    this.context.lastActivityAt = Date.now();
    this.isDirty = true;
    
    log.debug(`Assistant message added to ${this.sessionId}`);
  }

  /**
   * Update cognitive context
   */
  updateCognitiveContext(updates: Record<string, any>): void {
    this.context.cognitiveContext = {
      ...this.context.cognitiveContext,
      ...updates,
    };
    this.isDirty = true;
  }

  /**
   * Set cognitive tier
   */
  setCognitiveTier(tier: "BASIC" | "SYS6" | "MEMBRANE" | "ADAPTIVE"): void {
    this.context.cognitiveTier = tier;
    this.isDirty = true;
  }

  /**
   * Update average complexity
   */
  updateAverageComplexity(complexity: number): void {
    if (this.context.averageComplexity === undefined) {
      this.context.averageComplexity = complexity;
    } else {
      // Running average using previous message count
      const prevCount = this.context.messageCount - 1;
      this.context.averageComplexity =
        (this.context.averageComplexity * prevCount + complexity) /
        this.context.messageCount;
    }
    this.isDirty = true;
  }

  /**
   * Persist session to storage if dirty
   */
  async persist(): Promise<void> {
    if (!this.persistence || !this.isDirty) {
      return;
    }

    try {
      const data: PersistedSessionData = {
        context: this.context,
        conversationHistory: this.conversationHistory,
      };
      
      await this.persistence.save(this.sessionId, data);
      this.isDirty = false;
      
      log.debug(`Session ${this.sessionId} persisted`);
    } catch (error) {
      log.error(`Failed to persist session ${this.sessionId}:`, error);
    }
  }

  /**
   * Delete session from persistence
   */
  async delete(): Promise<void> {
    if (!this.persistence) {
      return;
    }

    try {
      await this.persistence.delete(this.sessionId);
      log.info(`Session ${this.sessionId} deleted from persistence`);
    } catch (error) {
      log.error(`Failed to delete session ${this.sessionId}:`, error);
    }
  }

  /**
   * Check if session is idle (no activity in specified milliseconds)
   */
  isIdle(idleThresholdMs: number): boolean {
    return Date.now() - this.context.lastActivityAt > idleThresholdMs;
  }

  /**
   * Get session age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.context.createdAt;
  }

  /**
   * Trim conversation history to keep only last N messages
   */
  trimHistory(maxMessages: number): void {
    if (this.conversationHistory.length > maxMessages) {
      const removed = this.conversationHistory.length - maxMessages;
      this.conversationHistory = this.conversationHistory.slice(-maxMessages);
      this.isDirty = true;
      
      log.debug(`Trimmed ${removed} messages from ${this.sessionId}`);
    }
  }
}
