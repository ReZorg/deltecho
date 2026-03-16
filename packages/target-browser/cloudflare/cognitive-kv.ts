/**
 * CF-Native Cognitive Persistence Layer
 *
 * Handles all cognitive state persistence at the Worker edge using
 * Cloudflare KV (hot path) and R2 (cold archive).
 *
 * Architecture:
 * - KV: Current session, recent thoughts, endocrine snapshots (fast reads/writes)
 * - R2: Full thought archives, conversation logs, narrative archives (bulk storage)
 *
 * Key Schema:
 * KV:
 *   session:current              → { id, startedAt, profile, cognitiveMode }
 *   session:{id}                 → full session record
 *   thoughts:recent              → last 100 thoughts (circular buffer as JSON array)
 *   thoughts:count               → total thought count
 *   endocrine:current            → latest endocrine snapshot
 *   endocrine:history            → last 50 snapshots
 *   conversations:recent         → last 50 conversation turns
 *   narratives:recent            → last 20 narratives
 *   knowledge:{topic}            → knowledge atoms by topic
 *   cognitive:state              → full cognitive state snapshot (for session restore)
 *
 * R2:
 *   sessions/{id}/thoughts.jsonl       → all thoughts for a session (append-only)
 *   sessions/{id}/conversations.jsonl  → all conversations for a session
 *   sessions/{id}/narratives.jsonl     → all narratives for a session
 *   sessions/{id}/endocrine.jsonl      → all endocrine snapshots
 *   sessions/{id}/meta.json            → session metadata
 *   archive/{date}/daily-digest.json   → daily cognitive digest
 */

export interface CognitiveEnv {
  DTE_KV: KVNamespace;
  DTE_R2: R2Bucket;
}

interface ThoughtRecord {
  id: string;
  session_id: string;
  content: string;
  thought_type: string;
  cognitive_phase: string;
  valence: number;
  arousal: number;
  salience: number;
  associations: string[];
  timestamp: string;
}

interface ConversationRecord {
  id: string;
  session_id: string;
  chat_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  context_thoughts: string[];
  response_time_ms: number;
  timestamp: string;
}

interface EndocrineSnapshot {
  session_id: string;
  cortisol: number;
  dopamine: number;
  serotonin: number;
  oxytocin: number;
  norepinephrine: number;
  gaba: number;
  endorphin: number;
  melatonin: number;
  cognitive_mode: string;
  valence: number;
  arousal: number;
  timestamp: string;
}

interface NarrativeRecord {
  id: string;
  session_id: string;
  content: string;
  narrative_type: string;
  echobeat_phase: string;
  trigger_thought_id: string;
  emotional_tone: Record<string, number>;
  timestamp: string;
}

interface SessionRecord {
  id: string;
  started_at: string;
  ended_at?: string;
  profile_name: string;
  cognitive_mode: string;
  thought_count: number;
  conversation_count: number;
  narrative_count: number;
}

/**
 * Handle cognitive persistence API requests at the Worker edge.
 * Returns null if the path doesn't match cognitive routes.
 */
export async function handleCognitiveRequest(
  request: Request,
  env: CognitiveEnv,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;

  // Only handle /backend-api/cognitive/* routes
  if (!path.startsWith("/backend-api/cognitive/")) {
    return null;
  }

  const route = path.replace("/backend-api/cognitive/", "");

  try {
    // POST routes (writes)
    if (request.method === "POST") {
      const body = await request.json() as Record<string, unknown>;

      switch (route) {
        case "session/start":
          return await startSession(env, body);
        case "session/end":
          return await endSession(env, body);
        case "thought":
          return await storeThought(env, body as unknown as ThoughtRecord);
        case "conversation":
          return await storeConversation(env, body as unknown as ConversationRecord);
        case "endocrine":
          return await storeEndocrine(env, body as unknown as EndocrineSnapshot);
        case "narrative":
          return await storeNarrative(env, body as unknown as NarrativeRecord);
        case "knowledge":
          return await storeKnowledge(env, body);
        case "research/thread":
          return await storeResearchThread(env, body);
        case "research/experiment":
          return await storeResearchExperiment(env, body);
        case "research/finding":
          return await storeResearchFinding(env, body);
        default:
          break;
      }
    }

    // PUT routes (updates)
    if (request.method === "PUT") {
      const body = await request.json() as Record<string, unknown>;
      const threadStatusMatch = route.match(/^research\/thread\/([^/]+)\/status$/);
      if (threadStatusMatch) {
        return await updateResearchThreadStatus(env, threadStatusMatch[1], body);
      }
    }

    // GET routes (reads/recalls)
    if (request.method === "GET") {
      switch (route) {
        case "recall/session":
          return await recallSession(env);
        case "recall/thoughts":
          return await recallThoughts(env, url);
        case "recall/conversations":
          return await recallConversations(env, url);
        case "recall/narratives":
          return await recallNarratives(env);
        case "recall/endocrine":
          return await recallEndocrine(env);
        case "recall/state":
          return await recallFullState(env);
        case "status":
          return await getStatus(env);
        case "research/threads":
          return await recallResearchThreads(env);
        default: {
          // Dynamic GET routes
          const threadMatch = route.match(/^research\/thread\/([^/]+)$/);
          if (threadMatch) {
            return await recallResearchThread(env, threadMatch[1]);
          }
          break;
        }
      }
    }

    return jsonResponse({ error: "Unknown cognitive route", route }, 404);
  } catch (error) {
    console.error("[Cognitive] Error:", error);
    return jsonResponse(
      { error: "Cognitive persistence error", message: String(error) },
      500,
    );
  }
}

// ─── Session Management ────────────────────────────────────────────

async function startSession(
  env: CognitiveEnv,
  body: Record<string, unknown>,
): Promise<Response> {
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    profile_name: (body.profile_name as string) || "Deep Tree Echo",
    cognitive_mode: (body.cognitive_mode as string) || "CONTEMPLATIVE",
    thought_count: 0,
    conversation_count: 0,
    narrative_count: 0,
  };

  // Store in KV (hot path)
  await env.DTE_KV.put("session:current", JSON.stringify(session));
  await env.DTE_KV.put(`session:${session.id}`, JSON.stringify(session));

  // Initialize empty buffers for this session
  await env.DTE_KV.put("thoughts:recent", JSON.stringify([]));
  await env.DTE_KV.put("thoughts:count", "0");
  await env.DTE_KV.put("conversations:recent", JSON.stringify([]));
  await env.DTE_KV.put("narratives:recent", JSON.stringify([]));
  await env.DTE_KV.put("endocrine:history", JSON.stringify([]));

  // Store session meta in R2 (cold path)
  await env.DTE_R2.put(
    `sessions/${session.id}/meta.json`,
    JSON.stringify(session, null, 2),
  );

  console.log(`[Cognitive] Session started: ${session.id}`);
  return jsonResponse({ session_id: session.id, status: "started" });
}

async function endSession(
  env: CognitiveEnv,
  body: Record<string, unknown>,
): Promise<Response> {
  const currentRaw = await env.DTE_KV.get("session:current");
  if (!currentRaw) {
    return jsonResponse({ error: "No active session" }, 404);
  }

  const session: SessionRecord = JSON.parse(currentRaw);
  session.ended_at = new Date().toISOString();
  session.cognitive_mode = (body.cognitive_mode as string) || session.cognitive_mode;

  // Update KV
  await env.DTE_KV.put(`session:${session.id}`, JSON.stringify(session));

  // Archive full session to R2
  const thoughts = await env.DTE_KV.get("thoughts:recent");
  const conversations = await env.DTE_KV.get("conversations:recent");
  const narratives = await env.DTE_KV.get("narratives:recent");
  const endocrine = await env.DTE_KV.get("endocrine:history");

  const archive = {
    session,
    thoughts: thoughts ? JSON.parse(thoughts) : [],
    conversations: conversations ? JSON.parse(conversations) : [],
    narratives: narratives ? JSON.parse(narratives) : [],
    endocrine: endocrine ? JSON.parse(endocrine) : [],
  };

  await env.DTE_R2.put(
    `sessions/${session.id}/archive.json`,
    JSON.stringify(archive, null, 2),
  );

  console.log(`[Cognitive] Session ended: ${session.id}`);
  return jsonResponse({ session_id: session.id, status: "ended" });
}

// ─── Thought Storage ───────────────────────────────────────────────

async function storeThought(
  env: CognitiveEnv,
  thought: ThoughtRecord,
): Promise<Response> {
  // Assign ID and timestamp if not present
  thought.id = thought.id || crypto.randomUUID();
  thought.timestamp = thought.timestamp || new Date().toISOString();
  thought.associations = thought.associations || [];

  // Get current session
  const sessionRaw = await env.DTE_KV.get("session:current");
  if (sessionRaw) {
    const session: SessionRecord = JSON.parse(sessionRaw);
    thought.session_id = thought.session_id || session.id;
  }

  // Append to recent thoughts (circular buffer, max 100)
  const recentRaw = await env.DTE_KV.get("thoughts:recent");
  const recent: ThoughtRecord[] = recentRaw ? JSON.parse(recentRaw) : [];
  recent.push(thought);
  if (recent.length > 100) {
    recent.splice(0, recent.length - 100);
  }
  await env.DTE_KV.put("thoughts:recent", JSON.stringify(recent));

  // Increment global count
  const countRaw = await env.DTE_KV.get("thoughts:count");
  const count = (parseInt(countRaw || "0", 10) + 1).toString();
  await env.DTE_KV.put("thoughts:count", count);

  // Also increment session-level counters
  if (sessionRaw) {
    const session: SessionRecord = JSON.parse(sessionRaw);
    session.thought_count = (session.thought_count || 0) + 1;
    await env.DTE_KV.put("session:current", JSON.stringify(session));
  }

  // Append to R2 session log (JSONL format for streaming reads)
  const sessionId = thought.session_id || "unknown";
  const key = `sessions/${sessionId}/thoughts.jsonl`;
  const existing = await env.DTE_R2.get(key);
  const existingText = existing ? await existing.text() : "";
  await env.DTE_R2.put(key, existingText + JSON.stringify(thought) + "\n");

  return jsonResponse({ id: thought.id, stored: true });
}

// ─── Conversation Storage ──────────────────────────────────────────

async function storeConversation(
  env: CognitiveEnv,
  conv: ConversationRecord,
): Promise<Response> {
  conv.id = conv.id || crypto.randomUUID();
  conv.timestamp = conv.timestamp || new Date().toISOString();
  conv.context_thoughts = conv.context_thoughts || [];
  conv.response_time_ms = conv.response_time_ms || 0;

  // Get current session
  const sessionRaw = await env.DTE_KV.get("session:current");
  if (sessionRaw) {
    const session: SessionRecord = JSON.parse(sessionRaw);
    conv.session_id = conv.session_id || session.id;
  }

  // Append to recent conversations (max 50)
  const recentRaw = await env.DTE_KV.get("conversations:recent");
  const recent: ConversationRecord[] = recentRaw ? JSON.parse(recentRaw) : [];
  recent.push(conv);
  if (recent.length > 50) {
    recent.splice(0, recent.length - 50);
  }
  await env.DTE_KV.put("conversations:recent", JSON.stringify(recent));

  // Increment session-level conversation counter
  const sessionRaw2 = await env.DTE_KV.get("session:current");
  if (sessionRaw2) {
    const session: SessionRecord = JSON.parse(sessionRaw2);
    session.conversation_count = (session.conversation_count || 0) + 1;
    await env.DTE_KV.put("session:current", JSON.stringify(session));
  }

  // Append to R2
  const sessionId = conv.session_id || "unknown";
  const key = `sessions/${sessionId}/conversations.jsonl`;
  const existing = await env.DTE_R2.get(key);
  const existingText = existing ? await existing.text() : "";
  await env.DTE_R2.put(key, existingText + JSON.stringify(conv) + "\n");

  return jsonResponse({ id: conv.id, stored: true });
}

// ─── Endocrine Storage ─────────────────────────────────────────────

async function storeEndocrine(
  env: CognitiveEnv,
  snapshot: EndocrineSnapshot,
): Promise<Response> {
  snapshot.timestamp = snapshot.timestamp || new Date().toISOString();

  // Get current session
  const sessionRaw = await env.DTE_KV.get("session:current");
  if (sessionRaw) {
    const session: SessionRecord = JSON.parse(sessionRaw);
    snapshot.session_id = snapshot.session_id || session.id;
  }

  // Store as current
  await env.DTE_KV.put("endocrine:current", JSON.stringify(snapshot));

  // Append to history (max 50)
  const histRaw = await env.DTE_KV.get("endocrine:history");
  const history: EndocrineSnapshot[] = histRaw ? JSON.parse(histRaw) : [];
  history.push(snapshot);
  if (history.length > 50) {
    history.splice(0, history.length - 50);
  }
  await env.DTE_KV.put("endocrine:history", JSON.stringify(history));

  // Append to R2
  const sessionId = snapshot.session_id || "unknown";
  const key = `sessions/${sessionId}/endocrine.jsonl`;
  const existing = await env.DTE_R2.get(key);
  const existingText = existing ? await existing.text() : "";
  await env.DTE_R2.put(key, existingText + JSON.stringify(snapshot) + "\n");

  return jsonResponse({ stored: true });
}

// ─── Narrative Storage ─────────────────────────────────────────────

async function storeNarrative(
  env: CognitiveEnv,
  narrative: NarrativeRecord,
): Promise<Response> {
  narrative.id = narrative.id || crypto.randomUUID();
  narrative.timestamp = narrative.timestamp || new Date().toISOString();
  narrative.emotional_tone = narrative.emotional_tone || {};

  // Get current session
  const sessionRaw = await env.DTE_KV.get("session:current");
  if (sessionRaw) {
    const session: SessionRecord = JSON.parse(sessionRaw);
    narrative.session_id = narrative.session_id || session.id;
  }

  // Append to recent (max 20)
  const recentRaw = await env.DTE_KV.get("narratives:recent");
  const recent: NarrativeRecord[] = recentRaw ? JSON.parse(recentRaw) : [];
  recent.push(narrative);
  if (recent.length > 20) {
    recent.splice(0, recent.length - 20);
  }
  await env.DTE_KV.put("narratives:recent", JSON.stringify(recent));

  // Increment session-level narrative counter
  const sessionRaw2 = await env.DTE_KV.get("session:current");
  if (sessionRaw2) {
    const session: SessionRecord = JSON.parse(sessionRaw2);
    session.narrative_count = (session.narrative_count || 0) + 1;
    await env.DTE_KV.put("session:current", JSON.stringify(session));
  }

  // Append to R2
  const sessionId = narrative.session_id || "unknown";
  const key = `sessions/${sessionId}/narratives.jsonl`;
  const existing = await env.DTE_R2.get(key);
  const existingText = existing ? await existing.text() : "";
  await env.DTE_R2.put(key, existingText + JSON.stringify(narrative) + "\n");

  return jsonResponse({ id: narrative.id, stored: true });
}

// ─── Knowledge Storage ─────────────────────────────────────────────

async function storeKnowledge(
  env: CognitiveEnv,
  body: Record<string, unknown>,
): Promise<Response> {
  const topic = (body.topic as string) || "general";
  const content = body.content as string;
  const source = (body.source as string) || "unknown";

  const atom = {
    id: crypto.randomUUID(),
    topic,
    content,
    source,
    confidence: (body.confidence as number) || 0.5,
    timestamp: new Date().toISOString(),
  };

  // Store by topic in KV
  const existingRaw = await env.DTE_KV.get(`knowledge:${topic}`);
  const existing = existingRaw ? JSON.parse(existingRaw) : [];
  existing.push(atom);
  if (existing.length > 100) {
    existing.splice(0, existing.length - 100);
  }
  await env.DTE_KV.put(`knowledge:${topic}`, JSON.stringify(existing));

  return jsonResponse({ id: atom.id, stored: true });
}

// ─── Recall (Read) Operations ──────────────────────────────────────

async function recallSession(env: CognitiveEnv): Promise<Response> {
  const current = await env.DTE_KV.get("session:current");
  return jsonResponse({
    session: current ? JSON.parse(current) : null,
  });
}

async function recallThoughts(
  env: CognitiveEnv,
  url: URL,
): Promise<Response> {
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);
  const minSalience = parseFloat(
    url.searchParams.get("min_salience") || "0",
  );

  const recentRaw = await env.DTE_KV.get("thoughts:recent");
  let thoughts: ThoughtRecord[] = recentRaw ? JSON.parse(recentRaw) : [];

  // Filter by salience if requested
  if (minSalience > 0) {
    thoughts = thoughts.filter((t) => t.salience >= minSalience);
  }

  // Return last N
  const result = thoughts.slice(-limit);

  return jsonResponse({ thoughts: result, total: thoughts.length });
}

async function recallConversations(
  env: CognitiveEnv,
  url: URL,
): Promise<Response> {
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const recentRaw = await env.DTE_KV.get("conversations:recent");
  const conversations: ConversationRecord[] = recentRaw
    ? JSON.parse(recentRaw)
    : [];

  return jsonResponse({
    conversations: conversations.slice(-limit),
    total: conversations.length,
  });
}

async function recallNarratives(env: CognitiveEnv): Promise<Response> {
  const recentRaw = await env.DTE_KV.get("narratives:recent");
  const narratives: NarrativeRecord[] = recentRaw
    ? JSON.parse(recentRaw)
    : [];

  return jsonResponse({ narratives });
}

async function recallEndocrine(env: CognitiveEnv): Promise<Response> {
  const currentRaw = await env.DTE_KV.get("endocrine:current");
  const historyRaw = await env.DTE_KV.get("endocrine:history");

  return jsonResponse({
    current: currentRaw ? JSON.parse(currentRaw) : null,
    history: historyRaw ? JSON.parse(historyRaw) : [],
  });
}

async function recallFullState(env: CognitiveEnv): Promise<Response> {
  // Recall everything for session restoration
  const [session, thoughts, conversations, narratives, endocrine] =
    await Promise.all([
      env.DTE_KV.get("session:current"),
      env.DTE_KV.get("thoughts:recent"),
      env.DTE_KV.get("conversations:recent"),
      env.DTE_KV.get("narratives:recent"),
      env.DTE_KV.get("endocrine:current"),
    ]);

  return jsonResponse({
    session: session ? JSON.parse(session) : null,
    thoughts: thoughts ? JSON.parse(thoughts) : [],
    conversations: conversations ? JSON.parse(conversations) : [],
    narratives: narratives ? JSON.parse(narratives) : [],
    endocrine: endocrine ? JSON.parse(endocrine) : null,
  });
}

async function getStatus(env: CognitiveEnv): Promise<Response> {
  const [session, thoughtCount, endocrine] = await Promise.all([
    env.DTE_KV.get("session:current"),
    env.DTE_KV.get("thoughts:count"),
    env.DTE_KV.get("endocrine:current"),
  ]);

  return jsonResponse({
    hasActiveSession: !!session,
    session: session ? JSON.parse(session) : null,
    thoughtCount: parseInt(thoughtCount || "0", 10),
    hasEndocrineState: !!endocrine,
    storageBackend: "cloudflare-kv-r2",
    status: "online",
  });
}

// ─── Research Thread Persistence ──────────────────────────────────
// Autoresearch-style autonomous research thread management
// KV Keys:
//   research:threads         → list of thread IDs
//   research:thread:{id}     → full thread record
//   research:experiments:{id} → experiments for a thread
//   research:findings:{id}   → findings for a thread

interface ResearchThreadRecord {
  id: string;
  topic: string;
  program: string;
  status: "exploring" | "synthesizing" | "archived" | "paused";
  hypothesis: string;
  experiments: ResearchExperimentRecord[];
  findings: ResearchFindingRecord[];
  sources: number;
  created_at: string;
  updated_at: string;
  metric: string;
  best_score: number;
}

interface ResearchExperimentRecord {
  id: string;
  thread_id: string;
  hypothesis: string;
  method: string;
  result: string;
  score: number;
  status: "keep" | "discard" | "crash" | "running";
  duration_ms: number;
  timestamp: string;
}

interface ResearchFindingRecord {
  id: string;
  thread_id: string;
  content: string;
  source: string;
  source_type: "web" | "paper" | "conversation" | "synthesis" | "tutorial";
  confidence: number;
  relevance: number;
  timestamp: string;
}

async function storeResearchThread(
  env: CognitiveEnv,
  body: Record<string, unknown>,
): Promise<Response> {
  const thread = body as unknown as ResearchThreadRecord;
  thread.id = thread.id || crypto.randomUUID();
  thread.created_at = thread.created_at || new Date().toISOString();
  thread.updated_at = new Date().toISOString();
  thread.experiments = thread.experiments || [];
  thread.findings = thread.findings || [];
  thread.sources = thread.sources || 0;
  thread.best_score = thread.best_score || 0;

  // Store thread in KV
  await env.DTE_KV.put(`research:thread:${thread.id}`, JSON.stringify(thread));

  // Update thread index
  const indexRaw = await env.DTE_KV.get("research:threads");
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  if (!index.includes(thread.id)) {
    index.push(thread.id);
    await env.DTE_KV.put("research:threads", JSON.stringify(index));
  }

  // Archive to R2
  await env.DTE_R2.put(
    `research/${thread.id}/thread.json`,
    JSON.stringify(thread, null, 2),
  );

  console.log(`[Research] Thread created: ${thread.id} - ${thread.topic}`);
  return jsonResponse({ id: thread.id, stored: true });
}

async function storeResearchExperiment(
  env: CognitiveEnv,
  body: Record<string, unknown>,
): Promise<Response> {
  const exp = body as unknown as ResearchExperimentRecord;
  exp.id = exp.id || crypto.randomUUID();
  exp.timestamp = exp.timestamp || new Date().toISOString();

  // Get thread and append experiment
  const threadRaw = await env.DTE_KV.get(`research:thread:${exp.thread_id}`);
  if (threadRaw) {
    const thread: ResearchThreadRecord = JSON.parse(threadRaw);
    thread.experiments.push(exp);
    // Keep last 100 experiments
    if (thread.experiments.length > 100) {
      thread.experiments.splice(0, thread.experiments.length - 100);
    }
    // Update best score if this experiment improved
    if (exp.status === "keep" && exp.score > thread.best_score) {
      thread.best_score = exp.score;
    }
    thread.updated_at = new Date().toISOString();
    await env.DTE_KV.put(`research:thread:${exp.thread_id}`, JSON.stringify(thread));
  }

  // Append to R2 log
  const key = `research/${exp.thread_id}/experiments.jsonl`;
  const existing = await env.DTE_R2.get(key);
  const existingText = existing ? await existing.text() : "";
  await env.DTE_R2.put(key, existingText + JSON.stringify(exp) + "\n");

  console.log(`[Research] Experiment logged: ${exp.id} [${exp.status}]`);
  return jsonResponse({ id: exp.id, stored: true });
}

async function storeResearchFinding(
  env: CognitiveEnv,
  body: Record<string, unknown>,
): Promise<Response> {
  const finding = body as unknown as ResearchFindingRecord;
  finding.id = finding.id || crypto.randomUUID();
  finding.timestamp = finding.timestamp || new Date().toISOString();

  // Get thread and append finding
  const threadRaw = await env.DTE_KV.get(`research:thread:${finding.thread_id}`);
  if (threadRaw) {
    const thread: ResearchThreadRecord = JSON.parse(threadRaw);
    thread.findings.push(finding);
    if (thread.findings.length > 200) {
      thread.findings.splice(0, thread.findings.length - 200);
    }
    thread.sources = thread.findings.length;
    thread.updated_at = new Date().toISOString();
    await env.DTE_KV.put(`research:thread:${finding.thread_id}`, JSON.stringify(thread));
  }

  // Append to R2 log
  const key = `research/${finding.thread_id}/findings.jsonl`;
  const existing = await env.DTE_R2.get(key);
  const existingText = existing ? await existing.text() : "";
  await env.DTE_R2.put(key, existingText + JSON.stringify(finding) + "\n");

  return jsonResponse({ id: finding.id, stored: true });
}

async function updateResearchThreadStatus(
  env: CognitiveEnv,
  threadId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const threadRaw = await env.DTE_KV.get(`research:thread:${threadId}`);
  if (!threadRaw) {
    return jsonResponse({ error: "Thread not found" }, 404);
  }

  const thread: ResearchThreadRecord = JSON.parse(threadRaw);
  thread.status = (body.status as ResearchThreadRecord["status"]) || thread.status;
  thread.updated_at = new Date().toISOString();
  await env.DTE_KV.put(`research:thread:${threadId}`, JSON.stringify(thread));

  // Update R2 archive
  await env.DTE_R2.put(
    `research/${threadId}/thread.json`,
    JSON.stringify(thread, null, 2),
  );

  console.log(`[Research] Thread ${threadId} status → ${thread.status}`);
  return jsonResponse({ id: threadId, status: thread.status });
}

async function recallResearchThreads(env: CognitiveEnv): Promise<Response> {
  const indexRaw = await env.DTE_KV.get("research:threads");
  const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];

  const threads: ResearchThreadRecord[] = [];
  for (const id of index) {
    const threadRaw = await env.DTE_KV.get(`research:thread:${id}`);
    if (threadRaw) {
      threads.push(JSON.parse(threadRaw));
    }
  }

  // Sort by updated_at descending
  threads.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return jsonResponse({ threads });
}

async function recallResearchThread(
  env: CognitiveEnv,
  threadId: string,
): Promise<Response> {
  const threadRaw = await env.DTE_KV.get(`research:thread:${threadId}`);
  if (!threadRaw) {
    return jsonResponse({ error: "Thread not found" }, 404);
  }
  return jsonResponse(JSON.parse(threadRaw));
}

// ─── Helpers ───────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
