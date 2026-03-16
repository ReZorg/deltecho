/**
 * CognitivePersistenceClient
 *
 * Frontend client for the CognitivePersistenceService backend API.
 * Provides non-blocking, fire-and-forget storage for thoughts, narratives,
 * endocrine snapshots, and conversations. Handles session lifecycle.
 *
 * All writes are batched and debounced to minimize network overhead.
 * Failures are silently logged — persistence should never block the
 * cognitive loop.
 */

const BASE_URL = "/backend-api/cognitive";

interface PendingWrite {
  endpoint: string;
  data: Record<string, unknown>;
}

export class CognitivePersistenceClient {
  private sessionId: string | null = null;
  private writeQueue: PendingWrite[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushIntervalMs = 3000;
  private isOnline = false;
  private endocrineSnapshotInterval: ReturnType<typeof setInterval> | null =
    null;

  /** Initialize and start a session */
  async startSession(
    metadata: Record<string, unknown> = {},
  ): Promise<string | null> {
    try {
      const response = await fetch(`${BASE_URL}/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      });

      if (response.ok) {
        const data = await response.json();
        this.sessionId = data.session_id;
        this.isOnline = true;
        console.log(
          `[CognitivePersistence] Session started: ${this.sessionId}`,
        );
        return this.sessionId;
      }
    } catch (error) {
      console.warn("[CognitivePersistence] Failed to start session:", error);
    }

    // Fallback: local-only session
    this.sessionId = `local-${Date.now()}`;
    this.isOnline = false;
    return this.sessionId;
  }

  /** End the current session */
  async endSession(
    finalState: Record<string, unknown> = {},
  ): Promise<void> {
    // Flush remaining writes first
    await this.flush();

    if (this.endocrineSnapshotInterval) {
      clearInterval(this.endocrineSnapshotInterval);
      this.endocrineSnapshotInterval = null;
    }

    if (this.isOnline && this.sessionId) {
      try {
        await fetch(`${BASE_URL}/session/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ final_state: finalState }),
        });
      } catch (error) {
        console.warn("[CognitivePersistence] Failed to end session:", error);
      }
    }

    console.log(`[CognitivePersistence] Session ended: ${this.sessionId}`);
    this.sessionId = null;
  }

  /** Store a thought (non-blocking) */
  storeThought(thought: {
    phase: number;
    content: string;
    valence: number;
    arousal: number;
    salience: number;
    associations: string[];
    externalized: boolean;
  }): void {
    this.enqueue("/thought", {
      ...thought,
      session_id: this.sessionId,
    });
  }

  /** Store a DreamGen narrative (non-blocking) */
  storeNarrative(narrative: {
    trigger_state: string;
    content: string;
    generation_time_ms: number;
    style: string;
  }): void {
    this.enqueue("/narrative", {
      ...narrative,
      session_id: this.sessionId,
    });
  }

  /** Store an endocrine snapshot (non-blocking) */
  storeEndocrineSnapshot(snapshot: {
    cognitive_mode: string;
    cortisol: number;
    dopamine: number;
    serotonin: number;
    oxytocin: number;
    norepinephrine: number;
    endorphin: number;
    melatonin: number;
    gaba: number;
  }): void {
    this.enqueue("/endocrine", {
      ...snapshot,
      session_id: this.sessionId,
    });
  }

  /** Store a conversation message (non-blocking) */
  storeConversation(conversation: {
    chat_id: string;
    role: string;
    content: string;
    context_thoughts?: string[];
    response_time_ms?: number;
  }): void {
    this.enqueue("/conversation", {
      ...conversation,
      session_id: this.sessionId,
    });
  }

  /**
   * Start periodic endocrine snapshots.
   * Call this with a function that returns the current endocrine state.
   */
  startEndocrineMonitoring(
    getState: () => {
      cognitive_mode: string;
      cortisol: number;
      dopamine: number;
      serotonin: number;
      oxytocin: number;
      norepinephrine: number;
      endorphin: number;
      melatonin: number;
      gaba: number;
    } | null,
    intervalMs: number = 30000,
  ): void {
    if (this.endocrineSnapshotInterval) {
      clearInterval(this.endocrineSnapshotInterval);
    }

    this.endocrineSnapshotInterval = setInterval(() => {
      const state = getState();
      if (state) {
        this.storeEndocrineSnapshot(state);
      }
    }, intervalMs);
  }

  // ---- Recall Methods ----

  /** Recall recent high-salience thoughts */
  async recallThoughts(
    limit: number = 20,
  ): Promise<
    Array<{
      content: string;
      valence: number;
      arousal: number;
      salience: number;
      phase: number;
      timestamp: string;
    }>
  > {
    try {
      const response = await fetch(
        `${BASE_URL}/recall/thoughts?limit=${limit}`,
      );
      if (response.ok) {
        const data = await response.json();
        return data.thoughts || [];
      }
    } catch (error) {
      console.warn("[CognitivePersistence] Failed to recall thoughts:", error);
    }
    return [];
  }

  /** Recall the last session's final state */
  async recallLastSession(): Promise<{
    id: string;
    final_state: Record<string, unknown>;
    end_time: string;
    metadata: Record<string, unknown>;
  } | null> {
    try {
      const response = await fetch(`${BASE_URL}/recall/last-session`);
      if (response.ok) {
        const data = await response.json();
        return data.session || null;
      }
    } catch (error) {
      console.warn(
        "[CognitivePersistence] Failed to recall last session:",
        error,
      );
    }
    return null;
  }

  /** Recall recent conversations */
  async recallConversations(
    limit: number = 10,
  ): Promise<
    Array<{
      role: string;
      content: string;
      chat_id: string;
      timestamp: string;
    }>
  > {
    try {
      const response = await fetch(
        `${BASE_URL}/recall/conversations?limit=${limit}`,
      );
      if (response.ok) {
        const data = await response.json();
        return data.conversations || [];
      }
    } catch (error) {
      console.warn(
        "[CognitivePersistence] Failed to recall conversations:",
        error,
      );
    }
    return [];
  }

  // ---- Getters ----

  getSessionId(): string | null {
    return this.sessionId;
  }

  getIsOnline(): boolean {
    return this.isOnline;
  }

  // ---- Internal ----

  private enqueue(endpoint: string, data: Record<string, unknown>): void {
    this.writeQueue.push({ endpoint, data });

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushIntervalMs);
    }

    // Auto-flush if queue gets large
    if (this.writeQueue.length >= 50) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.writeQueue.length === 0) return;

    const batch = [...this.writeQueue];
    this.writeQueue = [];

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Send each write (could be batched in future)
    for (const { endpoint, data } of batch) {
      try {
        await fetch(`${BASE_URL}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch (error) {
        // Re-queue failed writes (with limit)
        if (this.writeQueue.length < 200) {
          this.writeQueue.push({ endpoint, data });
        }
      }
    }
  }
}

/** Singleton instance */
let _instance: CognitivePersistenceClient | null = null;

export function getCognitivePersistenceClient(): CognitivePersistenceClient {
  if (!_instance) {
    _instance = new CognitivePersistenceClient();
  }
  return _instance;
}
