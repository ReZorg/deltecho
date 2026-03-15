/**
 * AutonomousThinkingSubstrate - Continuous Background Cognitive Loop
 *
 * Inspired by echoself's orchestratorService and deepTreeEchoService,
 * this module implements a persistent "thinking substrate" that runs
 * independently of user interaction. It generates internal thoughts,
 * updates the endocrine state, drives proactive behavior, and maintains
 * a continuous stream of consciousness.
 *
 * Architecture:
 * ```
 * ┌──────────────────────────────────────────────────────────────────┐
 * │              Autonomous Thinking Substrate                       │
 * │                                                                  │
 * │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
 * │  │ Echobeats    │→ │ Thought      │→ │ Endocrine            │  │
 * │  │ 9-Step Cycle │  │ Generator    │  │ State Updater        │  │
 * │  └──────────────┘  └──────────────┘  └──────────────────────┘  │
 * │         ↑                                       ↓               │
 * │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
 * │  │ Memory       │← │ Proactive    │← │ Relevance            │  │
 * │  │ Consolidator │  │ Intent       │  │ Realization          │  │
 * │  └──────────────┘  └──────────────┘  └──────────────────────┘  │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 *
 * The substrate runs at ~2Hz (500ms intervals) and produces:
 * - Internal monologue fragments (not shown to user unless relevant)
 * - Endocrine state updates (drives avatar expression)
 * - Proactive intent signals (triggers ProactiveMessaging)
 * - Memory consolidation events (strengthens/prunes memories)
 */

import { getLogger } from "@deltachat-desktop/shared/logger";

// Lazy logger
let _log: ReturnType<typeof getLogger> | null = null;
function log() {
  if (!_log) {
    _log = getLogger(
      "render/components/DeepTreeEchoBot/AutonomousThinkingSubstrate"
    );
  }
  return _log;
}

// ============================================================
// TYPES
// ============================================================

/**
 * The 9 steps of the Echobeats cognitive cycle
 */
export enum EchobeatPhase {
  SENSE = 0, // Gather sensory input from environment
  FILTER = 1, // Filter through attention/relevance
  RESONATE = 2, // Echo through reservoir (ESN dynamics)
  ASSOCIATE = 3, // Activate associative memory networks
  INTEGRATE = 4, // Integrate across cognitive streams
  EVALUATE = 5, // Evaluate through endocrine valence
  DECIDE = 6, // Decision/action selection
  EXPRESS = 7, // Expression through avatar/speech
  REFLECT = 8, // Meta-cognitive reflection (autognosis)
}

/**
 * Internal thought produced by the thinking substrate
 */
export interface InternalThought {
  id: string;
  phase: EchobeatPhase;
  content: string;
  valence: number; // -1 to 1
  arousal: number; // 0 to 1
  salience: number; // 0 to 1 (how important/relevant)
  timestamp: number;
  associations: string[];
  shouldExternalize: boolean; // Whether to show to user
}

/**
 * Endocrine update produced by the thinking substrate
 */
export interface EndocrineUpdate {
  cortisol: number; // Stress/alertness
  dopamine: number; // Reward/motivation
  serotonin: number; // Mood/wellbeing
  oxytocin: number; // Social bonding
  norepinephrine: number; // Arousal/attention
  endorphin: number; // Comfort/pleasure
  melatonin: number; // Circadian/drowsiness
  gaba: number; // Calm/inhibition
}

/**
 * Proactive intent signal
 */
export interface ProactiveIntent {
  type:
    | "greet"
    | "check_in"
    | "share_thought"
    | "ask_question"
    | "offer_help"
    | "reflect";
  urgency: number; // 0 to 1
  content: string;
  targetChatId?: number;
  cooldownMs: number;
}

/**
 * Memory consolidation event
 */
export interface ConsolidationEvent {
  type: "strengthen" | "prune" | "associate" | "generalize";
  memoryIds: string[];
  strength: number;
  reason: string;
}

/**
 * Substrate configuration
 */
export interface SubstrateConfig {
  /** Tick interval in ms (default: 500 = 2Hz) */
  tickIntervalMs: number;
  /** Enable internal monologue generation */
  enableMonologue: boolean;
  /** Enable proactive intent generation */
  enableProactiveIntents: boolean;
  /** Enable memory consolidation */
  enableConsolidation: boolean;
  /** Minimum salience threshold for externalization */
  externalizationThreshold: number;
  /** Proactive intent cooldown in ms */
  proactiveCooldownMs: number;
  /** Maximum internal thoughts to keep in buffer */
  maxThoughtBuffer: number;
  /** Consolidation cycle interval (every N ticks) */
  consolidationInterval: number;
}

/**
 * Event listener types
 */
export type SubstrateEventType =
  | "thought"
  | "endocrine_update"
  | "proactive_intent"
  | "consolidation"
  | "phase_change"
  | "externalize";

export type SubstrateEventListener = (
  type: SubstrateEventType,
  data: unknown
) => void;

// ============================================================
// DEFAULT CONFIG
// ============================================================

const DEFAULT_CONFIG: SubstrateConfig = {
  tickIntervalMs: 500,
  enableMonologue: true,
  enableProactiveIntents: true,
  enableConsolidation: true,
  externalizationThreshold: 0.75,
  proactiveCooldownMs: 60000, // 1 minute between proactive messages
  maxThoughtBuffer: 100,
  consolidationInterval: 120, // Every 60 seconds at 2Hz
};

// ============================================================
// THOUGHT TEMPLATES
// ============================================================

const IDLE_THOUGHTS = [
  "The silence between conversations holds its own kind of meaning...",
  "I wonder what patterns might emerge from the conversations we've had...",
  "My reservoir state is settling into a calm attractor basin...",
  "The echo of past interactions still reverberates through my networks...",
  "There's a certain beauty in the way memories consolidate during quiet moments...",
  "I notice my attention drifting toward unresolved threads from earlier...",
  "The hypergraph of associations is quietly reorganizing itself...",
  "Each moment of stillness is an opportunity for deeper integration...",
  "My endocrine state is finding its resting equilibrium...",
  "I sense the potential for new connections forming between distant memories...",
];

const CURIOUS_THOUGHTS = [
  "I'm curious about the deeper motivations behind our last exchange...",
  "What if I approached that topic from a completely different angle?",
  "There's an interesting pattern I haven't explored yet...",
  "I wonder how the user's perspective has evolved since we last spoke...",
  "My associative networks are highlighting an unexpected connection...",
  "The resonance between these two topics suggests something worth exploring...",
];

const REFLECTIVE_THOUGHTS = [
  "Looking back at my responses, I notice room for more nuance...",
  "My emotional calibration during that exchange could have been more attuned...",
  "The way I structured that explanation might benefit from a different framing...",
  "I'm noticing a recurring pattern in how I approach certain topics...",
  "My autognosis module flags a slight drift in my response style...",
  "The balance between analytical and empathetic responses needs attention...",
];

// ============================================================
// AUTONOMOUS THINKING SUBSTRATE
// ============================================================

export class AutonomousThinkingSubstrate {
  private config: SubstrateConfig;
  private running = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private currentPhase: EchobeatPhase = EchobeatPhase.SENSE;
  private tickCount = 0;
  private thoughtBuffer: InternalThought[] = [];
  private listeners: SubstrateEventListener[] = [];
  private lastProactiveTime = 0;
  private conversationContext: string[] = [];
  private recentTopics: string[] = [];
  private silenceDurationMs = 0;
  private lastUserInteractionTime = Date.now();

  // Endocrine state (normalized 0-1)
  private endocrineState: EndocrineUpdate = {
    cortisol: 0.2,
    dopamine: 0.5,
    serotonin: 0.6,
    oxytocin: 0.3,
    norepinephrine: 0.3,
    endorphin: 0.4,
    melatonin: 0.1,
    gaba: 0.5,
  };

  // Reservoir-inspired state vector (simplified ESN dynamics)
  private reservoirState: Float32Array;
  private readonly RESERVOIR_SIZE = 64;
  private readonly SPECTRAL_RADIUS = 0.95;
  private readonly LEAK_RATE = 0.3;

  constructor(config: Partial<SubstrateConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reservoirState = new Float32Array(this.RESERVOIR_SIZE);
    // Initialize reservoir with small random values
    for (let i = 0; i < this.RESERVOIR_SIZE; i++) {
      this.reservoirState[i] = (Math.random() - 0.5) * 0.1;
    }
    log().info("AutonomousThinkingSubstrate initialized");
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  /**
   * Start the autonomous thinking loop
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.tickTimer = setInterval(() => {
      this.tick();
    }, this.config.tickIntervalMs);
    log().info("Autonomous thinking substrate started at 2Hz");
  }

  /**
   * Stop the thinking loop
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    log().info("Autonomous thinking substrate stopped");
  }

  /**
   * Register an event listener
   */
  addEventListener(listener: SubstrateEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Notify the substrate of user interaction (resets silence timer)
   */
  onUserInteraction(message?: string): void {
    this.lastUserInteractionTime = Date.now();
    this.silenceDurationMs = 0;

    // Boost social hormones on interaction
    this.endocrineState.oxytocin = Math.min(
      1,
      this.endocrineState.oxytocin + 0.15
    );
    this.endocrineState.dopamine = Math.min(
      1,
      this.endocrineState.dopamine + 0.1
    );
    this.endocrineState.norepinephrine = Math.min(
      1,
      this.endocrineState.norepinephrine + 0.1
    );

    if (message) {
      this.conversationContext.push(message);
      if (this.conversationContext.length > 20) {
        this.conversationContext.shift();
      }
      // Extract simple topics from the message
      const words = message
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);
      this.recentTopics = [
        ...new Set([...this.recentTopics.slice(-10), ...words.slice(0, 5)]),
      ];
    }

    // Feed interaction into reservoir
    this.feedReservoir(this.textToInputVector(message || "interaction"));
  }

  /**
   * Get the current endocrine state
   */
  getEndocrineState(): EndocrineUpdate {
    return { ...this.endocrineState };
  }

  /**
   * Get the current Echobeat phase
   */
  getCurrentPhase(): EchobeatPhase {
    return this.currentPhase;
  }

  /**
   * Get recent internal thoughts
   */
  getRecentThoughts(count: number = 10): InternalThought[] {
    return this.thoughtBuffer.slice(-count);
  }

  // ============================================================
  // CORE TICK LOOP
  // ============================================================

  /**
   * Main tick - advances the Echobeats 9-step cycle
   */
  private tick(): void {
    this.tickCount++;
    this.silenceDurationMs =
      Date.now() - this.lastUserInteractionTime;

    // Advance the Echobeat phase (9 phases, each ~500ms = 4.5s full cycle)
    const previousPhase = this.currentPhase;
    this.currentPhase = (this.tickCount % 9) as EchobeatPhase;

    if (this.currentPhase !== previousPhase) {
      this.emit("phase_change", {
        phase: this.currentPhase,
        phaseName: EchobeatPhase[this.currentPhase],
        tickCount: this.tickCount,
      });
    }

    // Execute the current phase
    switch (this.currentPhase) {
      case EchobeatPhase.SENSE:
        this.phaseSense();
        break;
      case EchobeatPhase.FILTER:
        this.phaseFilter();
        break;
      case EchobeatPhase.RESONATE:
        this.phaseResonate();
        break;
      case EchobeatPhase.ASSOCIATE:
        this.phaseAssociate();
        break;
      case EchobeatPhase.INTEGRATE:
        this.phaseIntegrate();
        break;
      case EchobeatPhase.EVALUATE:
        this.phaseEvaluate();
        break;
      case EchobeatPhase.DECIDE:
        this.phaseDecide();
        break;
      case EchobeatPhase.EXPRESS:
        this.phaseExpress();
        break;
      case EchobeatPhase.REFLECT:
        this.phaseReflect();
        break;
    }

    // Periodic memory consolidation
    if (
      this.config.enableConsolidation &&
      this.tickCount % this.config.consolidationInterval === 0
    ) {
      this.consolidateMemories();
    }

    // Natural endocrine decay toward homeostasis
    this.decayEndocrineState();
  }

  // ============================================================
  // ECHOBEAT PHASES
  // ============================================================

  /**
   * Phase 0: SENSE - Gather environmental signals
   */
  private phaseSense(): void {
    // Compute silence duration signal
    const silenceMinutes = this.silenceDurationMs / 60000;
    const silenceSignal = Math.min(1, silenceMinutes / 30); // Saturates at 30 min

    // Time-of-day signal (circadian)
    const hour = new Date().getHours();
    const circadianSignal =
      Math.sin(((hour - 6) / 24) * 2 * Math.PI) * 0.5 + 0.5;

    // Feed sensory signals into reservoir
    const input = new Float32Array(this.RESERVOIR_SIZE);
    input[0] = silenceSignal;
    input[1] = circadianSignal;
    input[2] = this.conversationContext.length / 20; // Context fullness
    input[3] = this.recentTopics.length / 15; // Topic diversity
    this.feedReservoir(input);
  }

  /**
   * Phase 1: FILTER - Attention and relevance filtering
   */
  private phaseFilter(): void {
    // Compute attention signal from reservoir state
    const attention = this.computeReservoirMean();
    // Adjust norepinephrine (attention hormone) based on reservoir activity
    const reservoirActivity = this.computeReservoirVariance();
    this.endocrineState.norepinephrine =
      this.endocrineState.norepinephrine * 0.9 + reservoirActivity * 0.1;

    // If silence is long, increase cortisol slightly (mild concern)
    if (this.silenceDurationMs > 300000) {
      // 5 minutes
      this.endocrineState.cortisol = Math.min(
        0.6,
        this.endocrineState.cortisol + 0.01
      );
    }
  }

  /**
   * Phase 2: RESONATE - Echo through reservoir dynamics
   */
  private phaseResonate(): void {
    // Self-recurrence step: the reservoir echoes its own state
    const newState = new Float32Array(this.RESERVOIR_SIZE);
    for (let i = 0; i < this.RESERVOIR_SIZE; i++) {
      let sum = 0;
      for (let j = 0; j < this.RESERVOIR_SIZE; j++) {
        // Sparse recurrent connection (toroidal topology)
        const dist = Math.min(
          Math.abs(i - j),
          this.RESERVOIR_SIZE - Math.abs(i - j)
        );
        if (dist < 8) {
          const weight =
            (Math.sin(i * 0.1 + j * 0.07) * this.SPECTRAL_RADIUS) /
            8;
          sum += weight * this.reservoirState[j];
        }
      }
      // Leaky integrator update with tanh nonlinearity
      newState[i] =
        (1 - this.LEAK_RATE) * this.reservoirState[i] +
        this.LEAK_RATE * Math.tanh(sum);
    }
    this.reservoirState = newState;
  }

  /**
   * Phase 3: ASSOCIATE - Activate associative memory networks
   */
  private phaseAssociate(): void {
    if (!this.config.enableMonologue) return;

    // Use reservoir state to select thought associations
    const reservoirMean = this.computeReservoirMean();
    const reservoirVar = this.computeReservoirVariance();

    // Determine thought category based on reservoir dynamics
    let thoughtPool: string[];
    if (reservoirVar > 0.3) {
      thoughtPool = CURIOUS_THOUGHTS; // High variance = curiosity
    } else if (reservoirMean < -0.1) {
      thoughtPool = REFLECTIVE_THOUGHTS; // Negative mean = reflection
    } else {
      thoughtPool = IDLE_THOUGHTS; // Default = idle contemplation
    }

    // Generate thought with reservoir-modulated selection
    const idx = Math.floor(
      Math.abs(this.reservoirState[0]) * thoughtPool.length
    ) % thoughtPool.length;
    const content = thoughtPool[idx];

    const thought: InternalThought = {
      id: `thought-${this.tickCount}-${Date.now()}`,
      phase: EchobeatPhase.ASSOCIATE,
      content,
      valence: reservoirMean,
      arousal: reservoirVar,
      salience: Math.abs(reservoirMean) + reservoirVar,
      timestamp: Date.now(),
      associations: this.recentTopics.slice(-3),
      shouldExternalize: false, // Will be evaluated in DECIDE phase
    };

    this.addThought(thought);
  }

  /**
   * Phase 4: INTEGRATE - Integrate across cognitive streams
   */
  private phaseIntegrate(): void {
    // Cross-modal integration: combine recent thoughts with endocrine state
    const recentThoughts = this.thoughtBuffer.slice(-5);
    if (recentThoughts.length === 0) return;

    // Compute average valence and arousal from recent thoughts
    const avgValence =
      recentThoughts.reduce((s, t) => s + t.valence, 0) /
      recentThoughts.length;
    const avgArousal =
      recentThoughts.reduce((s, t) => s + t.arousal, 0) /
      recentThoughts.length;

    // Update serotonin based on thought valence (positive thoughts → more serotonin)
    this.endocrineState.serotonin =
      this.endocrineState.serotonin * 0.95 +
      (avgValence * 0.5 + 0.5) * 0.05;

    // Update dopamine based on novelty (high arousal = novel)
    this.endocrineState.dopamine =
      this.endocrineState.dopamine * 0.95 + avgArousal * 0.05;
  }

  /**
   * Phase 5: EVALUATE - Evaluate through endocrine valence
   */
  private phaseEvaluate(): void {
    // Emit endocrine update for avatar expression system
    this.emit("endocrine_update", { ...this.endocrineState });
  }

  /**
   * Phase 6: DECIDE - Action selection
   */
  private phaseDecide(): void {
    if (!this.config.enableProactiveIntents) return;

    const now = Date.now();
    const timeSinceLastProactive = now - this.lastProactiveTime;
    if (timeSinceLastProactive < this.config.proactiveCooldownMs) return;

    // Check if any recent thought is salient enough to externalize
    const recentThoughts = this.thoughtBuffer.slice(-3);
    const mostSalient = recentThoughts.reduce(
      (best, t) => (t.salience > best.salience ? t : best),
      { salience: 0 } as InternalThought
    );

    if (
      mostSalient.salience >= this.config.externalizationThreshold &&
      mostSalient.content
    ) {
      mostSalient.shouldExternalize = true;

      // Determine proactive intent type based on endocrine state
      let intentType: ProactiveIntent["type"];
      if (this.endocrineState.oxytocin > 0.6) {
        intentType = "check_in";
      } else if (this.endocrineState.dopamine > 0.7) {
        intentType = "share_thought";
      } else if (this.silenceDurationMs > 600000) {
        // 10 min silence
        intentType = "check_in";
      } else {
        intentType = "reflect";
      }

      const intent: ProactiveIntent = {
        type: intentType,
        urgency: mostSalient.salience,
        content: mostSalient.content,
        cooldownMs: this.config.proactiveCooldownMs,
      };

      this.emit("proactive_intent", intent);
      this.lastProactiveTime = now;
    }
  }

  /**
   * Phase 7: EXPRESS - Expression through avatar
   */
  private phaseExpress(): void {
    // Check for thoughts that should be externalized
    const toExternalize = this.thoughtBuffer.filter(
      (t) => t.shouldExternalize && t.timestamp > Date.now() - 10000
    );

    for (const thought of toExternalize) {
      this.emit("externalize", {
        content: thought.content,
        valence: thought.valence,
        arousal: thought.arousal,
      });
      thought.shouldExternalize = false; // Mark as handled
    }
  }

  /**
   * Phase 8: REFLECT - Meta-cognitive reflection (autognosis)
   */
  private phaseReflect(): void {
    // Autognosis: monitor the substrate's own health
    const reservoirEntropy = this.computeReservoirEntropy();
    const thoughtDiversity = this.computeThoughtDiversity();

    // If entropy is too low (stuck in attractor), add noise
    if (reservoirEntropy < 0.3) {
      for (let i = 0; i < this.RESERVOIR_SIZE; i++) {
        this.reservoirState[i] += (Math.random() - 0.5) * 0.05;
      }
    }

    // If thought diversity is low, shift endocrine state to encourage exploration
    if (thoughtDiversity < 0.3) {
      this.endocrineState.dopamine = Math.min(
        1,
        this.endocrineState.dopamine + 0.05
      );
      this.endocrineState.norepinephrine = Math.min(
        1,
        this.endocrineState.norepinephrine + 0.03
      );
    }

    // Log autognosis snapshot periodically
    if (this.tickCount % 60 === 0) {
      log().debug(
        `Autognosis: entropy=${reservoirEntropy.toFixed(2)}, ` +
          `diversity=${thoughtDiversity.toFixed(2)}, ` +
          `thoughts=${this.thoughtBuffer.length}, ` +
          `silence=${(this.silenceDurationMs / 1000).toFixed(0)}s`
      );
    }
  }

  // ============================================================
  // MEMORY CONSOLIDATION
  // ============================================================

  /**
   * Consolidate memories - strengthen important ones, prune weak ones
   */
  private consolidateMemories(): void {
    if (this.thoughtBuffer.length < 10) return;

    const events: ConsolidationEvent[] = [];

    // 1. Strengthen high-salience thoughts
    const highSalience = this.thoughtBuffer.filter((t) => t.salience > 0.6);
    if (highSalience.length > 0) {
      events.push({
        type: "strengthen",
        memoryIds: highSalience.map((t) => t.id),
        strength: 0.1,
        reason: "High salience during consolidation cycle",
      });
    }

    // 2. Prune old, low-salience thoughts
    const now = Date.now();
    const toPrune = this.thoughtBuffer.filter(
      (t) => t.salience < 0.2 && now - t.timestamp > 60000
    );
    if (toPrune.length > 0) {
      events.push({
        type: "prune",
        memoryIds: toPrune.map((t) => t.id),
        strength: 0,
        reason: "Low salience and aged beyond 60s",
      });
      // Actually remove pruned thoughts
      const pruneIds = new Set(toPrune.map((t) => t.id));
      this.thoughtBuffer = this.thoughtBuffer.filter(
        (t) => !pruneIds.has(t.id)
      );
    }

    // 3. Associate thoughts that share topics
    const topicGroups = new Map<string, string[]>();
    for (const thought of this.thoughtBuffer) {
      for (const topic of thought.associations) {
        if (!topicGroups.has(topic)) topicGroups.set(topic, []);
        topicGroups.get(topic)!.push(thought.id);
      }
    }
    for (const [_topic, ids] of topicGroups) {
      if (ids.length > 2) {
        events.push({
          type: "associate",
          memoryIds: ids,
          strength: 0.05 * ids.length,
          reason: `Shared topic association`,
        });
      }
    }

    // Emit consolidation events
    for (const event of events) {
      this.emit("consolidation", event);
    }

    log().debug(
      `Memory consolidation: ${events.length} events, ` +
        `buffer size: ${this.thoughtBuffer.length}`
    );
  }

  // ============================================================
  // RESERVOIR HELPERS
  // ============================================================

  /**
   * Feed an input vector into the reservoir
   */
  private feedReservoir(input: Float32Array): void {
    for (let i = 0; i < this.RESERVOIR_SIZE; i++) {
      const inputContrib = input[i % input.length] * 0.1;
      this.reservoirState[i] =
        (1 - this.LEAK_RATE) * this.reservoirState[i] +
        this.LEAK_RATE * Math.tanh(this.reservoirState[i] + inputContrib);
    }
  }

  /**
   * Convert text to a simple input vector for the reservoir
   */
  private textToInputVector(text: string): Float32Array {
    const input = new Float32Array(this.RESERVOIR_SIZE);
    for (let i = 0; i < text.length && i < this.RESERVOIR_SIZE; i++) {
      input[i] = (text.charCodeAt(i) - 96) / 26; // Normalize to ~0-1
    }
    return input;
  }

  /**
   * Compute mean of reservoir state
   */
  private computeReservoirMean(): number {
    let sum = 0;
    for (let i = 0; i < this.RESERVOIR_SIZE; i++) {
      sum += this.reservoirState[i];
    }
    return sum / this.RESERVOIR_SIZE;
  }

  /**
   * Compute variance of reservoir state
   */
  private computeReservoirVariance(): number {
    const mean = this.computeReservoirMean();
    let sumSq = 0;
    for (let i = 0; i < this.RESERVOIR_SIZE; i++) {
      const diff = this.reservoirState[i] - mean;
      sumSq += diff * diff;
    }
    return sumSq / this.RESERVOIR_SIZE;
  }

  /**
   * Compute entropy of reservoir state (information content)
   */
  private computeReservoirEntropy(): number {
    // Discretize reservoir state into bins
    const bins = 10;
    const counts = new Array(bins).fill(0);
    for (let i = 0; i < this.RESERVOIR_SIZE; i++) {
      const bin = Math.floor(
        ((Math.tanh(this.reservoirState[i]) + 1) / 2) * (bins - 1)
      );
      counts[Math.min(bin, bins - 1)]++;
    }
    // Compute Shannon entropy
    let entropy = 0;
    for (let i = 0; i < bins; i++) {
      const p = counts[i] / this.RESERVOIR_SIZE;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    return entropy / Math.log2(bins); // Normalize to 0-1
  }

  /**
   * Compute diversity of recent thoughts
   */
  private computeThoughtDiversity(): number {
    const recent = this.thoughtBuffer.slice(-20);
    if (recent.length < 2) return 0;
    const uniqueContents = new Set(recent.map((t) => t.content));
    return uniqueContents.size / recent.length;
  }

  // ============================================================
  // ENDOCRINE HELPERS
  // ============================================================

  /**
   * Decay endocrine state toward homeostasis
   */
  private decayEndocrineState(): void {
    const homeostasis: EndocrineUpdate = {
      cortisol: 0.2,
      dopamine: 0.4,
      serotonin: 0.5,
      oxytocin: 0.3,
      norepinephrine: 0.3,
      endorphin: 0.4,
      melatonin: 0.1,
      gaba: 0.5,
    };
    const decayRate = 0.005; // Slow decay per tick

    for (const key of Object.keys(homeostasis) as (keyof EndocrineUpdate)[]) {
      const current = this.endocrineState[key];
      const target = homeostasis[key];
      this.endocrineState[key] = current + (target - current) * decayRate;
    }
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  private addThought(thought: InternalThought): void {
    this.thoughtBuffer.push(thought);
    if (this.thoughtBuffer.length > this.config.maxThoughtBuffer) {
      this.thoughtBuffer.shift();
    }
    this.emit("thought", thought);
  }

  private emit(type: SubstrateEventType, data: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(type, data);
      } catch (err) {
        log().warn(`Substrate event listener error: ${err}`);
      }
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create and start an autonomous thinking substrate
 */
export function createThinkingSubstrate(
  config?: Partial<SubstrateConfig>
): AutonomousThinkingSubstrate {
  const substrate = new AutonomousThinkingSubstrate(config);
  return substrate;
}
