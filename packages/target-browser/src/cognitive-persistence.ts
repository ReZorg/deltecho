/**
 * CognitivePersistenceService
 *
 * Server-side persistence layer for Deep Tree Echo's cognitive state.
 * Bridges the frontend bot to Neon PostgreSQL (structured records)
 * and Cloudflare R2 (long-term archives) via backend API endpoints.
 *
 * Architecture:
 *   Frontend (DeepTreeEchoBot) → Backend API → CognitivePersistenceService
 *     ├─ Neon PostgreSQL (warm memory: thoughts, conversations, endocrine)
 *     └─ R2 (cold memory: archives, logs, echo memory queue)
 *
 * Composition: deltecho ⊗ neon ⊗ cloudflare-r2
 */

import express from "express";
import { getLogger } from "@deltachat-desktop/shared/logger";

const log = getLogger("cognitive-persistence");

// ============================================================
// Types
// ============================================================

interface ThoughtRecord {
  session_id: string;
  phase: number;
  content: string;
  valence: number;
  arousal: number;
  salience: number;
  associations: string[];
  externalized: boolean;
}

interface NarrativeRecord {
  session_id: string;
  trigger_state: string;
  content: string;
  generation_time_ms: number;
  style: string;
}

interface EndocrineRecord {
  session_id: string;
  cognitive_mode: string;
  cortisol: number;
  dopamine: number;
  serotonin: number;
  oxytocin: number;
  norepinephrine: number;
  endorphin: number;
  melatonin: number;
  gaba: number;
}

interface ConversationRecord {
  session_id: string;
  chat_id: string;
  role: string;
  content: string;
  context_thoughts?: string[];
  response_time_ms?: number;
}

interface SessionRecord {
  initial_state: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

// ============================================================
// Neon Client (lightweight, no ORM)
// ============================================================

class NeonClient {
  private connectionUri: string;
  private batchQueue: Array<{ sql: string; params: unknown[] }> = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private batchIntervalMs = 5000; // Flush every 5 seconds

  constructor(connectionUri: string) {
    this.connectionUri = connectionUri;
    log.info("NeonClient initialized");
  }

  /** Execute a single SQL query via HTTP (Neon serverless driver compatible) */
  async query(sql: string, params: unknown[] = []): Promise<unknown[]> {
    try {
      // Use the Neon serverless HTTP API
      const url = this.connectionUri.replace(
        /^postgresql:\/\//,
        "https://",
      ).replace(/\/neondb.*/, "/sql");

      // Extract auth from connection URI
      const uriMatch = this.connectionUri.match(
        /postgresql:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]+)/,
      );
      if (!uriMatch) {
        throw new Error("Invalid Neon connection URI");
      }

      const [, user, password, host, database] = uriMatch;
      const apiUrl = `https://${host}/sql`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Neon-Connection-String": this.connectionUri,
        },
        body: JSON.stringify({
          query: sql,
          params: params,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Neon query error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return data.rows || [];
    } catch (error) {
      log.error("Neon query failed:", error);
      throw error;
    }
  }

  /** Add a query to the batch queue (for high-frequency writes) */
  addToBatch(sql: string, params: unknown[]): void {
    this.batchQueue.push({ sql, params });

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), this.batchIntervalMs);
    }
  }

  /** Flush the batch queue */
  async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];
    this.batchTimer = null;

    log.debug(`Flushing ${batch.length} batched queries`);

    for (const { sql, params } of batch) {
      try {
        await this.query(sql, params);
      } catch (error) {
        log.error("Batch query failed:", error);
        // Re-queue failed items (with limit to prevent infinite loops)
        if (this.batchQueue.length < 500) {
          this.batchQueue.push({ sql, params });
        }
      }
    }
  }

  /** Force flush and cleanup */
  async shutdown(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    await this.flushBatch();
  }
}

// ============================================================
// R2 Archive Client
// ============================================================

class R2ArchiveClient {
  private buffer: string[] = [];
  private bufferType = "thoughts";
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushIntervalMs = 30000; // Flush to R2 every 30 seconds

  constructor() {
    log.info("R2ArchiveClient initialized (buffered mode)");
  }

  /** Append a JSON line to the buffer */
  appendLine(type: string, data: Record<string, unknown>): void {
    const line = JSON.stringify({
      ...data,
      _type: type,
      _archived_at: new Date().toISOString(),
    });
    this.buffer.push(line);

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushIntervalMs);
    }
  }

  /** Flush buffer to R2 via the backend API (or local file as fallback) */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const lines = [...this.buffer];
    this.buffer = [];
    this.flushTimer = null;

    const now = new Date();
    const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
    const timestamp = now.toISOString().replace(/[:.]/g, "-");

    // Store locally as JSONL files (R2 upload will be done via a separate sync process)
    const fs = await import("fs/promises");
    const path = await import("path");

    const archiveDir = path.join(
      process.env.DATA_DIR || "/data",
      "echo-memory",
      datePath,
    );
    await fs.mkdir(archiveDir, { recursive: true });

    const filePath = path.join(archiveDir, `${timestamp}.jsonl`);
    await fs.writeFile(filePath, lines.join("\n") + "\n");

    log.debug(`Archived ${lines.length} records to ${filePath}`);
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

// ============================================================
// CognitivePersistenceService
// ============================================================

class CognitivePersistenceService {
  private neon: NeonClient | null = null;
  private r2: R2ArchiveClient;
  private currentSessionId: string | null = null;
  private isInitialized = false;

  constructor() {
    this.r2 = new R2ArchiveClient();
  }

  /** Initialize with Neon connection URI */
  initialize(neonUri?: string): void {
    if (neonUri) {
      this.neon = new NeonClient(neonUri);
      log.info("CognitivePersistence initialized with Neon");
    } else {
      log.warn("CognitivePersistence running without Neon (archive-only mode)");
    }
    this.isInitialized = true;
  }

  /** Start a new cognitive session */
  async startSession(metadata: Record<string, unknown> = {}): Promise<string> {
    if (this.neon) {
      try {
        const rows = await this.neon.query(
          "INSERT INTO dte_sessions (initial_state, metadata) VALUES ($1, $2) RETURNING id",
          [JSON.stringify(metadata), JSON.stringify(metadata)],
        );
        const row = rows[0] as { id: string };
        this.currentSessionId = row.id;
        log.info(`Cognitive session started: ${this.currentSessionId}`);
      } catch (error) {
        log.error("Failed to start session in Neon:", error);
        this.currentSessionId = `local-${Date.now()}`;
      }
    } else {
      this.currentSessionId = `local-${Date.now()}`;
    }

    this.r2.appendLine("session_start", {
      session_id: this.currentSessionId,
      metadata,
    });

    return this.currentSessionId;
  }

  /** End the current session */
  async endSession(finalState: Record<string, unknown> = {}): Promise<void> {
    if (!this.currentSessionId) return;

    if (this.neon) {
      try {
        await this.neon.query(
          "UPDATE dte_sessions SET end_time = NOW(), final_state = $1 WHERE id = $2",
          [JSON.stringify(finalState), this.currentSessionId],
        );
      } catch (error) {
        log.error("Failed to end session in Neon:", error);
      }
    }

    this.r2.appendLine("session_end", {
      session_id: this.currentSessionId,
      final_state: finalState,
    });

    // Flush all pending writes
    if (this.neon) await this.neon.flushBatch();
    await this.r2.flush();

    log.info(`Cognitive session ended: ${this.currentSessionId}`);
    this.currentSessionId = null;
  }

  /** Store a thought */
  storeThought(thought: ThoughtRecord): void {
    const sessionId = thought.session_id || this.currentSessionId;

    if (this.neon && sessionId && !sessionId.startsWith("local-")) {
      this.neon.addToBatch(
        `INSERT INTO dte_thoughts (session_id, phase, content, valence, arousal, salience, associations, externalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          sessionId,
          thought.phase,
          thought.content,
          thought.valence,
          thought.arousal,
          thought.salience,
          JSON.stringify(thought.associations || []),
          thought.externalized || false,
        ],
      );
    }

    this.r2.appendLine("thought", { ...thought, session_id: sessionId });
  }

  /** Store a DreamGen narrative */
  storeNarrative(narrative: NarrativeRecord): void {
    const sessionId = narrative.session_id || this.currentSessionId;

    if (this.neon && sessionId && !sessionId.startsWith("local-")) {
      this.neon.addToBatch(
        `INSERT INTO dte_narratives (session_id, trigger_state, content, generation_time_ms, style)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          sessionId,
          narrative.trigger_state,
          narrative.content,
          narrative.generation_time_ms,
          narrative.style,
        ],
      );
    }

    this.r2.appendLine("narrative", { ...narrative, session_id: sessionId });
  }

  /** Store an endocrine snapshot */
  storeEndocrineSnapshot(snapshot: EndocrineRecord): void {
    const sessionId = snapshot.session_id || this.currentSessionId;

    if (this.neon && sessionId && !sessionId.startsWith("local-")) {
      this.neon.addToBatch(
        `INSERT INTO dte_endocrine_snapshots (session_id, cognitive_mode, cortisol, dopamine, serotonin, oxytocin, norepinephrine, endorphin, melatonin, gaba)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sessionId,
          snapshot.cognitive_mode,
          snapshot.cortisol,
          snapshot.dopamine,
          snapshot.serotonin,
          snapshot.oxytocin,
          snapshot.norepinephrine,
          snapshot.endorphin,
          snapshot.melatonin,
          snapshot.gaba,
        ],
      );
    }

    this.r2.appendLine("endocrine", { ...snapshot, session_id: sessionId });
  }

  /** Store a conversation message */
  storeConversation(conversation: ConversationRecord): void {
    const sessionId = conversation.session_id || this.currentSessionId;

    if (this.neon && sessionId && !sessionId.startsWith("local-")) {
      this.neon.addToBatch(
        `INSERT INTO dte_conversations (session_id, chat_id, role, content, context_thoughts, response_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          sessionId,
          conversation.chat_id,
          conversation.role,
          conversation.content,
          JSON.stringify(conversation.context_thoughts || []),
          conversation.response_time_ms || 0,
        ],
      );
    }

    this.r2.appendLine("conversation", { ...conversation, session_id: sessionId });
  }

  /** Recall recent high-salience thoughts for session restoration */
  async recallRecentThoughts(limit: number = 20): Promise<unknown[]> {
    if (!this.neon) return [];

    try {
      return await this.neon.query(
        `SELECT content, valence, arousal, salience, phase, timestamp
         FROM dte_thoughts
         WHERE salience > 0.5
         ORDER BY timestamp DESC
         LIMIT $1`,
        [limit],
      );
    } catch (error) {
      log.error("Failed to recall thoughts:", error);
      return [];
    }
  }

  /** Recall the last session's final state */
  async recallLastSession(): Promise<Record<string, unknown> | null> {
    if (!this.neon) return null;

    try {
      const rows = await this.neon.query(
        `SELECT id, final_state, end_time, metadata
         FROM dte_sessions
         WHERE end_time IS NOT NULL
         ORDER BY end_time DESC
         LIMIT 1`,
        [],
      );
      return (rows[0] as Record<string, unknown>) || null;
    } catch (error) {
      log.error("Failed to recall last session:", error);
      return null;
    }
  }

  /** Recall recent conversations for context */
  async recallRecentConversations(limit: number = 10): Promise<unknown[]> {
    if (!this.neon) return [];

    try {
      return await this.neon.query(
        `SELECT role, content, chat_id, timestamp
         FROM dte_conversations
         ORDER BY timestamp DESC
         LIMIT $1`,
        [limit],
      );
    } catch (error) {
      log.error("Failed to recall conversations:", error);
      return [];
    }
  }

  /** Get the current session ID */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /** Shutdown gracefully */
  async shutdown(): Promise<void> {
    if (this.neon) await this.neon.shutdown();
    await this.r2.shutdown();
    log.info("CognitivePersistence shut down");
  }
}

// ============================================================
// Singleton
// ============================================================

let persistenceInstance: CognitivePersistenceService | null = null;

export function getCognitivePersistence(): CognitivePersistenceService {
  if (!persistenceInstance) {
    persistenceInstance = new CognitivePersistenceService();
  }
  return persistenceInstance;
}

// ============================================================
// Express Routes
// ============================================================

export const CognitivePersistenceRoute = express.Router();

// Initialize persistence on first request
CognitivePersistenceRoute.use((_req, _res, next) => {
  const persistence = getCognitivePersistence();
  if (!persistence.getSessionId()) {
    // Auto-initialize with env vars
    const neonUri = process.env.NEON_CONNECTION_URI;
    persistence.initialize(neonUri);
  }
  next();
});

// Session management
CognitivePersistenceRoute.post("/session/start", express.json(), async (req, res) => {
  try {
    const persistence = getCognitivePersistence();
    const sessionId = await persistence.startSession(req.body.metadata || {});
    res.json({ session_id: sessionId });
  } catch (error) {
    log.error("Session start error:", error);
    res.status(500).json({ error: "Failed to start session" });
  }
});

CognitivePersistenceRoute.post("/session/end", express.json(), async (req, res) => {
  try {
    const persistence = getCognitivePersistence();
    await persistence.endSession(req.body.final_state || {});
    res.json({ status: "ended" });
  } catch (error) {
    log.error("Session end error:", error);
    res.status(500).json({ error: "Failed to end session" });
  }
});

// Store records
CognitivePersistenceRoute.post("/thought", express.json(), async (req, res) => {
  try {
    const persistence = getCognitivePersistence();
    persistence.storeThought(req.body);
    res.status(201).json({ status: "stored" });
  } catch (error) {
    res.status(500).json({ error: "Failed to store thought" });
  }
});

CognitivePersistenceRoute.post("/narrative", express.json(), async (req, res) => {
  try {
    const persistence = getCognitivePersistence();
    persistence.storeNarrative(req.body);
    res.status(201).json({ status: "stored" });
  } catch (error) {
    res.status(500).json({ error: "Failed to store narrative" });
  }
});

CognitivePersistenceRoute.post("/endocrine", express.json(), async (req, res) => {
  try {
    const persistence = getCognitivePersistence();
    persistence.storeEndocrineSnapshot(req.body);
    res.status(201).json({ status: "stored" });
  } catch (error) {
    res.status(500).json({ error: "Failed to store endocrine snapshot" });
  }
});

CognitivePersistenceRoute.post("/conversation", express.json(), async (req, res) => {
  try {
    const persistence = getCognitivePersistence();
    persistence.storeConversation(req.body);
    res.status(201).json({ status: "stored" });
  } catch (error) {
    res.status(500).json({ error: "Failed to store conversation" });
  }
});

// Recall endpoints
CognitivePersistenceRoute.get("/recall/thoughts", async (req, res) => {
  try {
    const persistence = getCognitivePersistence();
    const limit = parseInt(req.query.limit as string) || 20;
    const thoughts = await persistence.recallRecentThoughts(limit);
    res.json({ thoughts });
  } catch (error) {
    res.status(500).json({ error: "Failed to recall thoughts" });
  }
});

CognitivePersistenceRoute.get("/recall/last-session", async (_req, res) => {
  try {
    const persistence = getCognitivePersistence();
    const session = await persistence.recallLastSession();
    res.json({ session });
  } catch (error) {
    res.status(500).json({ error: "Failed to recall last session" });
  }
});

CognitivePersistenceRoute.get("/recall/conversations", async (req, res) => {
  try {
    const persistence = getCognitivePersistence();
    const limit = parseInt(req.query.limit as string) || 10;
    const conversations = await persistence.recallRecentConversations(limit);
    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: "Failed to recall conversations" });
  }
});

// Status endpoint
CognitivePersistenceRoute.get("/status", (_req, res) => {
  const persistence = getCognitivePersistence();
  res.json({
    initialized: !!persistence.getSessionId(),
    session_id: persistence.getSessionId(),
    has_neon: !!process.env.NEON_CONNECTION_URI,
  });
});
