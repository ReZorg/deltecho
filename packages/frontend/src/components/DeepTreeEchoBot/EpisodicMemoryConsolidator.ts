/**
 * EpisodicMemoryConsolidator - Sleep-Like Memory Consolidation
 *
 * Implements a biologically-inspired memory consolidation system that
 * periodically strengthens important memories, prunes weak ones,
 * discovers cross-conversation patterns, and builds semantic
 * generalizations from episodic experiences.
 *
 * Inspired by:
 * - Hippocampal replay during sleep (memory consolidation)
 * - OpenCog AtomSpace attention allocation (ECAN)
 * - Deep Tree Echo's ESN reservoir dynamics
 *
 * The consolidator runs in three modes:
 * 1. **Active**: During conversations, memories are tagged with emotional
 *    significance and stored in the episodic buffer
 * 2. **Idle**: During silence, the consolidator replays recent memories
 *    and strengthens associative links
 * 3. **Deep**: After extended silence (>5min), the consolidator performs
 *    full consolidation: pruning, generalization, and schema extraction
 */

import { getLogger } from "@deltachat-desktop/shared/logger";

// Lazy logger
let _log: ReturnType<typeof getLogger> | null = null;
function log() {
  if (!_log) {
    _log = getLogger(
      "render/components/DeepTreeEchoBot/EpisodicMemoryConsolidator"
    );
  }
  return _log;
}

// ============================================================
// TYPES
// ============================================================

/**
 * Memory types following the cognitive architecture
 */
export type MemoryType =
  | "episodic" // Specific events and conversations
  | "semantic" // General knowledge and facts
  | "procedural" // How-to knowledge and patterns
  | "emotional" // Emotional associations and valence tags
  | "perspectival"; // Viewpoints and belief states

/**
 * A single memory trace in the consolidation system
 */
export interface MemoryTrace {
  id: string;
  type: MemoryType;
  content: string;
  /** Source conversation/chat ID */
  sourceId: string;
  /** Emotional valence (-1 to 1) */
  valence: number;
  /** Emotional arousal (0 to 1) */
  arousal: number;
  /** Importance score (0 to 1), decays over time */
  importance: number;
  /** Number of times this memory has been replayed/accessed */
  replayCount: number;
  /** Associative links to other memory IDs */
  associations: string[];
  /** Keywords extracted from content */
  keywords: string[];
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccessedAt: number;
  /** Whether this memory has been consolidated into semantic memory */
  consolidated: boolean;
}

/**
 * A semantic schema extracted from multiple episodic memories
 */
export interface SemanticSchema {
  id: string;
  /** The generalized pattern */
  pattern: string;
  /** Source episodic memory IDs */
  sourceMemories: string[];
  /** Confidence in this schema (0 to 1) */
  confidence: number;
  /** Keywords that activate this schema */
  activationKeywords: string[];
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Consolidation mode
 */
export type ConsolidationMode = "active" | "idle" | "deep";

/**
 * Consolidation statistics
 */
export interface ConsolidationStats {
  totalMemories: number;
  episodicCount: number;
  semanticCount: number;
  proceduralCount: number;
  emotionalCount: number;
  schemasExtracted: number;
  memoriesPruned: number;
  memoriesStrengthened: number;
  lastConsolidationTime: number;
  currentMode: ConsolidationMode;
}

/**
 * Consolidation event
 */
export interface ConsolidationEvent {
  type:
    | "memory_stored"
    | "memory_replayed"
    | "memory_pruned"
    | "memory_strengthened"
    | "schema_extracted"
    | "association_formed"
    | "mode_changed";
  memoryId?: string;
  details: string;
  timestamp: number;
}

export type ConsolidationEventListener = (event: ConsolidationEvent) => void;

// ============================================================
// CONFIGURATION
// ============================================================

export interface ConsolidatorConfig {
  /** Maximum number of memories to store */
  maxMemories: number;
  /** Importance decay rate per consolidation cycle (0-1) */
  importanceDecayRate: number;
  /** Minimum importance to survive pruning */
  pruningThreshold: number;
  /** Idle mode activation delay in ms */
  idleDelayMs: number;
  /** Deep mode activation delay in ms */
  deepDelayMs: number;
  /** Consolidation cycle interval in ms */
  cycleIntervalMs: number;
  /** Minimum memories needed for schema extraction */
  minMemoriesForSchema: number;
  /** Keyword overlap threshold for association (0-1) */
  associationThreshold: number;
}

const DEFAULT_CONFIG: ConsolidatorConfig = {
  maxMemories: 500,
  importanceDecayRate: 0.02,
  pruningThreshold: 0.1,
  idleDelayMs: 60000, // 1 minute
  deepDelayMs: 300000, // 5 minutes
  cycleIntervalMs: 30000, // 30 seconds
  minMemoriesForSchema: 3,
  associationThreshold: 0.3,
};

// ============================================================
// EPISODIC MEMORY CONSOLIDATOR
// ============================================================

export class EpisodicMemoryConsolidator {
  private config: ConsolidatorConfig;
  private memories: Map<string, MemoryTrace> = new Map();
  private schemas: Map<string, SemanticSchema> = new Map();
  private mode: ConsolidationMode = "active";
  private lastInteractionTime = Date.now();
  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: ConsolidationEventListener[] = [];
  private stats: ConsolidationStats;
  private running = false;

  constructor(config: Partial<ConsolidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      totalMemories: 0,
      episodicCount: 0,
      semanticCount: 0,
      proceduralCount: 0,
      emotionalCount: 0,
      schemasExtracted: 0,
      memoriesPruned: 0,
      memoriesStrengthened: 0,
      lastConsolidationTime: 0,
      currentMode: "active",
    };
    log().info("EpisodicMemoryConsolidator initialized");
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  start(): void {
    if (this.running) return;
    this.running = true;
    this.cycleTimer = setInterval(() => {
      this.consolidationCycle();
    }, this.config.cycleIntervalMs);
    log().info("Memory consolidator started");
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    log().info("Memory consolidator stopped");
  }

  addEventListener(listener: ConsolidationEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // ============================================================
  // MEMORY STORAGE
  // ============================================================

  /**
   * Store a new episodic memory from a conversation
   */
  storeEpisodicMemory(
    content: string,
    sourceId: string,
    valence: number = 0,
    arousal: number = 0.5
  ): string {
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const keywords = this.extractKeywords(content);

    const trace: MemoryTrace = {
      id,
      type: "episodic",
      content,
      sourceId,
      valence,
      arousal,
      importance: this.computeInitialImportance(valence, arousal, keywords),
      replayCount: 0,
      associations: [],
      keywords,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      consolidated: false,
    };

    this.memories.set(id, trace);
    this.stats.totalMemories++;
    this.stats.episodicCount++;

    // Find and form associations with existing memories
    this.formAssociations(trace);

    // Enforce memory limit
    if (this.memories.size > this.config.maxMemories) {
      this.pruneWeakestMemory();
    }

    this.emit({
      type: "memory_stored",
      memoryId: id,
      details: `Episodic memory stored: "${content.substring(0, 50)}..."`,
      timestamp: Date.now(),
    });

    // Reset interaction timer
    this.lastInteractionTime = Date.now();

    return id;
  }

  /**
   * Store a semantic memory (general knowledge)
   */
  storeSemanticMemory(content: string, sourceId: string): string {
    const id = `sem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const keywords = this.extractKeywords(content);

    const trace: MemoryTrace = {
      id,
      type: "semantic",
      content,
      sourceId,
      valence: 0,
      arousal: 0,
      importance: 0.6, // Semantic memories start with moderate importance
      replayCount: 0,
      associations: [],
      keywords,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      consolidated: true, // Already semantic
    };

    this.memories.set(id, trace);
    this.stats.totalMemories++;
    this.stats.semanticCount++;
    this.formAssociations(trace);

    return id;
  }

  /**
   * Retrieve memories relevant to a query
   */
  retrieveRelevant(query: string, limit: number = 5): MemoryTrace[] {
    const queryKeywords = this.extractKeywords(query);
    const scored: Array<{ trace: MemoryTrace; score: number }> = [];

    for (const trace of this.memories.values()) {
      const relevance = this.computeRelevance(trace, queryKeywords);
      if (relevance > 0.1) {
        scored.push({ trace, score: relevance });
        // Boost importance on access (retrieval strengthens memory)
        trace.importance = Math.min(1, trace.importance + 0.05);
        trace.lastAccessedAt = Date.now();
        trace.replayCount++;
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.trace);
  }

  /**
   * Get consolidation statistics
   */
  getStats(): ConsolidationStats {
    return { ...this.stats, currentMode: this.mode };
  }

  /**
   * Get all schemas
   */
  getSchemas(): SemanticSchema[] {
    return Array.from(this.schemas.values());
  }

  // ============================================================
  // CONSOLIDATION CYCLE
  // ============================================================

  /**
   * Main consolidation cycle - runs periodically
   */
  private consolidationCycle(): void {
    const timeSinceInteraction = Date.now() - this.lastInteractionTime;

    // Determine mode
    const previousMode = this.mode;
    if (timeSinceInteraction < this.config.idleDelayMs) {
      this.mode = "active";
    } else if (timeSinceInteraction < this.config.deepDelayMs) {
      this.mode = "idle";
    } else {
      this.mode = "deep";
    }

    if (this.mode !== previousMode) {
      this.emit({
        type: "mode_changed",
        details: `Consolidation mode: ${previousMode} → ${this.mode}`,
        timestamp: Date.now(),
      });
      log().info(`Consolidation mode changed: ${previousMode} → ${this.mode}`);
    }

    // Execute mode-specific consolidation
    switch (this.mode) {
      case "active":
        // Minimal processing during active conversation
        break;
      case "idle":
        this.idleConsolidation();
        break;
      case "deep":
        this.deepConsolidation();
        break;
    }

    this.stats.lastConsolidationTime = Date.now();
  }

  /**
   * Idle consolidation: replay recent memories and strengthen associations
   */
  private idleConsolidation(): void {
    // Replay recent memories (hippocampal replay)
    const recentMemories = Array.from(this.memories.values())
      .filter((m) => Date.now() - m.createdAt < 300000) // Last 5 minutes
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);

    for (const memory of recentMemories) {
      memory.replayCount++;
      memory.importance = Math.min(1, memory.importance + 0.02);
      memory.lastAccessedAt = Date.now();

      this.emit({
        type: "memory_replayed",
        memoryId: memory.id,
        details: `Idle replay: "${memory.content.substring(0, 30)}..."`,
        timestamp: Date.now(),
      });
    }

    // Strengthen associations between recently replayed memories
    for (let i = 0; i < recentMemories.length; i++) {
      for (let j = i + 1; j < recentMemories.length; j++) {
        const overlap = this.keywordOverlap(
          recentMemories[i].keywords,
          recentMemories[j].keywords
        );
        if (overlap > this.config.associationThreshold * 0.5) {
          this.addAssociation(recentMemories[i].id, recentMemories[j].id);
        }
      }
    }
  }

  /**
   * Deep consolidation: full memory processing
   */
  private deepConsolidation(): void {
    // 1. Decay importance of all memories
    this.decayImportance();

    // 2. Prune memories below threshold
    this.pruneWeakMemories();

    // 3. Extract semantic schemas from episodic clusters
    this.extractSchemas();

    // 4. Strengthen highly-connected memories
    this.strengthenHubs();

    log().debug(
      `Deep consolidation complete: ${this.memories.size} memories, ` +
        `${this.schemas.size} schemas`
    );
  }

  // ============================================================
  // CONSOLIDATION OPERATIONS
  // ============================================================

  /**
   * Decay importance of all memories toward zero
   */
  private decayImportance(): void {
    for (const memory of this.memories.values()) {
      // Emotional memories decay slower
      const decayMultiplier =
        memory.type === "emotional" ? 0.5 : 1.0;
      // Frequently accessed memories decay slower
      const accessBonus = Math.min(0.5, memory.replayCount * 0.05);
      const effectiveDecay =
        this.config.importanceDecayRate * decayMultiplier * (1 - accessBonus);

      memory.importance = Math.max(0, memory.importance - effectiveDecay);
    }
  }

  /**
   * Prune memories below the importance threshold
   */
  private pruneWeakMemories(): void {
    const toPrune: string[] = [];

    for (const [id, memory] of this.memories) {
      if (
        memory.importance < this.config.pruningThreshold &&
        memory.type !== "semantic" && // Never prune semantic memories
        Date.now() - memory.createdAt > 60000 // At least 1 minute old
      ) {
        toPrune.push(id);
      }
    }

    for (const id of toPrune) {
      this.memories.delete(id);
      this.stats.memoriesPruned++;

      // Remove associations pointing to pruned memory
      for (const memory of this.memories.values()) {
        memory.associations = memory.associations.filter((a) => a !== id);
      }

      this.emit({
        type: "memory_pruned",
        memoryId: id,
        details: `Memory pruned (importance below ${this.config.pruningThreshold})`,
        timestamp: Date.now(),
      });
    }

    if (toPrune.length > 0) {
      log().debug(`Pruned ${toPrune.length} weak memories`);
    }
  }

  /**
   * Extract semantic schemas from clusters of related episodic memories
   */
  private extractSchemas(): void {
    // Group episodic memories by shared keywords
    const keywordClusters = new Map<string, MemoryTrace[]>();

    for (const memory of this.memories.values()) {
      if (memory.type !== "episodic" || memory.consolidated) continue;

      for (const keyword of memory.keywords) {
        if (!keywordClusters.has(keyword)) {
          keywordClusters.set(keyword, []);
        }
        keywordClusters.get(keyword)!.push(memory);
      }
    }

    // Find clusters large enough for schema extraction
    for (const [keyword, cluster] of keywordClusters) {
      if (cluster.length < this.config.minMemoriesForSchema) continue;

      // Check if we already have a schema for this keyword
      const existingSchema = Array.from(this.schemas.values()).find((s) =>
        s.activationKeywords.includes(keyword)
      );
      if (existingSchema) {
        // Update existing schema with new source memories
        for (const mem of cluster) {
          if (!existingSchema.sourceMemories.includes(mem.id)) {
            existingSchema.sourceMemories.push(mem.id);
            existingSchema.confidence = Math.min(
              1,
              existingSchema.confidence + 0.05
            );
          }
        }
        continue;
      }

      // Extract a new schema
      const schemaId = `schema-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const commonKeywords = this.findCommonKeywords(cluster);

      const schema: SemanticSchema = {
        id: schemaId,
        pattern: `Pattern around "${keyword}": ${commonKeywords.join(", ")}`,
        sourceMemories: cluster.map((m) => m.id),
        confidence: Math.min(1, cluster.length * 0.15),
        activationKeywords: commonKeywords,
        createdAt: Date.now(),
      };

      this.schemas.set(schemaId, schema);
      this.stats.schemasExtracted++;

      // Mark source memories as consolidated
      for (const mem of cluster) {
        mem.consolidated = true;
      }

      this.emit({
        type: "schema_extracted",
        details: `Schema extracted: "${schema.pattern}"`,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Strengthen memories that are highly connected (hub nodes)
   */
  private strengthenHubs(): void {
    for (const memory of this.memories.values()) {
      if (memory.associations.length >= 3) {
        const boost = Math.min(0.1, memory.associations.length * 0.02);
        memory.importance = Math.min(1, memory.importance + boost);
        this.stats.memoriesStrengthened++;

        this.emit({
          type: "memory_strengthened",
          memoryId: memory.id,
          details: `Hub memory strengthened (${memory.associations.length} connections)`,
          timestamp: Date.now(),
        });
      }
    }
  }

  // ============================================================
  // ASSOCIATION HELPERS
  // ============================================================

  /**
   * Form associations between a new memory and existing memories
   */
  private formAssociations(newTrace: MemoryTrace): void {
    for (const existing of this.memories.values()) {
      if (existing.id === newTrace.id) continue;

      const overlap = this.keywordOverlap(
        newTrace.keywords,
        existing.keywords
      );
      if (overlap >= this.config.associationThreshold) {
        this.addAssociation(newTrace.id, existing.id);
      }
    }
  }

  /**
   * Add a bidirectional association between two memories
   */
  private addAssociation(id1: string, id2: string): void {
    const mem1 = this.memories.get(id1);
    const mem2 = this.memories.get(id2);
    if (!mem1 || !mem2) return;

    if (!mem1.associations.includes(id2)) {
      mem1.associations.push(id2);
    }
    if (!mem2.associations.includes(id1)) {
      mem2.associations.push(id1);
    }

    this.emit({
      type: "association_formed",
      details: `Association: ${id1} ↔ ${id2}`,
      timestamp: Date.now(),
    });
  }

  // ============================================================
  // TEXT PROCESSING HELPERS
  // ============================================================

  /**
   * Extract keywords from text content
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "could", "should", "may", "might", "can", "shall",
      "to", "of", "in", "for", "on", "with", "at", "by", "from",
      "as", "into", "through", "during", "before", "after", "above",
      "below", "between", "out", "off", "over", "under", "again",
      "further", "then", "once", "here", "there", "when", "where",
      "why", "how", "all", "each", "every", "both", "few", "more",
      "most", "other", "some", "such", "no", "nor", "not", "only",
      "own", "same", "so", "than", "too", "very", "just", "because",
      "but", "and", "or", "if", "while", "about", "it", "its",
      "this", "that", "these", "those", "i", "me", "my", "we",
      "you", "your", "he", "she", "they", "them", "what", "which",
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word))
      .slice(0, 10);
  }

  /**
   * Compute keyword overlap between two keyword sets (Jaccard similarity)
   */
  private keywordOverlap(keywords1: string[], keywords2: string[]): number {
    if (keywords1.length === 0 || keywords2.length === 0) return 0;
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    let intersection = 0;
    for (const kw of set1) {
      if (set2.has(kw)) intersection++;
    }
    const union = set1.size + set2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Find common keywords across a cluster of memories
   */
  private findCommonKeywords(cluster: MemoryTrace[]): string[] {
    const keywordCounts = new Map<string, number>();
    for (const mem of cluster) {
      for (const kw of mem.keywords) {
        keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
      }
    }
    // Return keywords that appear in at least half the cluster
    const threshold = cluster.length / 2;
    return Array.from(keywordCounts.entries())
      .filter(([_kw, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([kw]) => kw);
  }

  /**
   * Compute initial importance based on emotional significance
   */
  private computeInitialImportance(
    valence: number,
    arousal: number,
    keywords: string[]
  ): number {
    // Emotional intensity boosts importance
    const emotionalIntensity = Math.abs(valence) * 0.3 + arousal * 0.3;
    // Keyword richness boosts importance
    const keywordRichness = Math.min(1, keywords.length / 5) * 0.2;
    // Base importance
    const base = 0.3;
    return Math.min(1, base + emotionalIntensity + keywordRichness);
  }

  /**
   * Compute relevance of a memory to a query
   */
  private computeRelevance(
    trace: MemoryTrace,
    queryKeywords: string[]
  ): number {
    const keywordScore = this.keywordOverlap(trace.keywords, queryKeywords);
    const recencyScore = Math.max(
      0,
      1 - (Date.now() - trace.lastAccessedAt) / (24 * 60 * 60 * 1000)
    );
    const importanceScore = trace.importance;

    return keywordScore * 0.5 + recencyScore * 0.2 + importanceScore * 0.3;
  }

  /**
   * Prune the single weakest memory when at capacity
   */
  private pruneWeakestMemory(): void {
    let weakest: MemoryTrace | null = null;
    let weakestImportance = Infinity;

    for (const memory of this.memories.values()) {
      if (memory.type === "semantic") continue; // Never prune semantic
      if (memory.importance < weakestImportance) {
        weakestImportance = memory.importance;
        weakest = memory;
      }
    }

    if (weakest) {
      this.memories.delete(weakest.id);
      this.stats.memoriesPruned++;
    }
  }

  // ============================================================
  // EVENT HELPERS
  // ============================================================

  private emit(event: ConsolidationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        log().warn(`Consolidation event listener error: ${err}`);
      }
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create an episodic memory consolidator
 */
export function createMemoryConsolidator(
  config?: Partial<ConsolidatorConfig>
): EpisodicMemoryConsolidator {
  const consolidator = new EpisodicMemoryConsolidator(config);
  return consolidator;
}
