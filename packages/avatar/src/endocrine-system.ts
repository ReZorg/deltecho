/**
 * Virtual Endocrine System for Deep Tree Echo Avatar
 *
 * A 16-channel hormone bus with decay/accumulation dynamics that drives
 * avatar expressions through biologically-inspired signaling.
 *
 * Composition: live2d-char-model ⊗ virtual-endocrine-system
 *
 * Each hormone channel has:
 * - A baseline level (personality-dependent)
 * - A current level (decays toward baseline)
 * - Sensitivity multipliers (personality-dependent)
 * - Event-driven spikes (cognitive state triggers)
 *
 * Cognitive modes are derived from the dominant hormone pattern.
 */

/**
 * Hormone channel identifiers
 */
export type HormoneChannel =
  | "cortisol"
  | "dopamine_tonic"
  | "dopamine_phasic"
  | "serotonin"
  | "norepinephrine"
  | "oxytocin"
  | "t3_t4"
  | "anandamide"
  | "melatonin"
  | "crh"
  | "acth"
  | "il6"
  | "gaba"
  | "glutamate"
  | "endorphin"
  | "vasopressin";

/**
 * Cognitive modes derived from hormone patterns
 */
export type CognitiveMode =
  | "RESTING"
  | "FOCUSED"
  | "REWARD"
  | "SOCIAL"
  | "VIGILANT"
  | "STRESSED"
  | "THREAT"
  | "REFLECTIVE"
  | "EXPLORATORY";

/**
 * Endocrine event types that can be triggered by cognitive states
 */
export type EndocrineEvent =
  | "NOVELTY_ENCOUNTERED"
  | "REWARD_RECEIVED"
  | "THREAT_DETECTED"
  | "GOAL_ACHIEVED"
  | "ERROR_DETECTED"
  | "SOCIAL_BOND_SIGNAL"
  | "RELAXATION_SIGNAL"
  | "FOCUS_SIGNAL"
  | "SPEAKING_SIGNAL"
  | "IDLE_SIGNAL";

/**
 * Hormone state: current levels for all 16 channels
 */
export type HormoneState = Record<HormoneChannel, number>;

/**
 * Endocrine baselines (personality-dependent)
 */
export interface EndocrineBaselines {
  cortisol: number;
  dopamine_tonic: number;
  serotonin: number;
  norepinephrine: number;
  oxytocin: number;
  t3_t4: number;
  anandamide: number;
  melatonin: number;
}

/**
 * Sensitivity multipliers (personality-dependent)
 */
export interface EndocrineSensitivity {
  reward: number;
  threat: number;
  social: number;
  novelty: number;
}

/**
 * Configuration for the endocrine system
 */
export interface EndocrineConfig {
  baselines: EndocrineBaselines;
  sensitivity: EndocrineSensitivity;
  /** Decay rate per second (how fast hormones return to baseline) */
  decayRate: number;
  /** Maximum spike magnitude */
  maxSpike: number;
}

/**
 * Event effect definition: which hormones are affected and by how much
 */
interface EventEffect {
  increases: Partial<Record<HormoneChannel, number>>;
  decreases?: Partial<Record<HormoneChannel, number>>;
}

/**
 * Event → hormone effect mappings
 */
const EVENT_EFFECTS: Record<EndocrineEvent, EventEffect> = {
  NOVELTY_ENCOUNTERED: {
    increases: { norepinephrine: 0.3, dopamine_phasic: 0.25, glutamate: 0.15 },
  },
  REWARD_RECEIVED: {
    increases: {
      dopamine_tonic: 0.3,
      serotonin: 0.2,
      endorphin: 0.15,
      oxytocin: 0.1,
    },
  },
  THREAT_DETECTED: {
    increases: { crh: 0.3, acth: 0.25, cortisol: 0.35, norepinephrine: 0.3 },
    decreases: { serotonin: 0.1, anandamide: 0.15 },
  },
  GOAL_ACHIEVED: {
    increases: { dopamine_tonic: 0.35, oxytocin: 0.2, serotonin: 0.15 },
    decreases: { cortisol: 0.1 },
  },
  ERROR_DETECTED: {
    increases: { il6: 0.2, cortisol: 0.2, norepinephrine: 0.15 },
    decreases: { dopamine_tonic: 0.1 },
  },
  SOCIAL_BOND_SIGNAL: {
    increases: { oxytocin: 0.3, serotonin: 0.15, endorphin: 0.1 },
  },
  RELAXATION_SIGNAL: {
    increases: { anandamide: 0.25, gaba: 0.2, serotonin: 0.1 },
    decreases: { cortisol: 0.15, norepinephrine: 0.1 },
  },
  FOCUS_SIGNAL: {
    increases: { norepinephrine: 0.2, t3_t4: 0.25, glutamate: 0.15 },
  },
  SPEAKING_SIGNAL: {
    increases: { dopamine_tonic: 0.1, t3_t4: 0.15, oxytocin: 0.05 },
  },
  IDLE_SIGNAL: {
    increases: { anandamide: 0.1, melatonin: 0.05, gaba: 0.1 },
    decreases: { norepinephrine: 0.05, cortisol: 0.05 },
  },
};

/**
 * Cognitive mode detection rules (evaluated in priority order)
 */
const MODE_RULES: Array<{
  mode: CognitiveMode;
  condition: (state: HormoneState) => boolean;
}> = [
  {
    mode: "THREAT",
    condition: (s) => s.cortisol > 0.6 && s.norepinephrine > 0.5,
  },
  {
    mode: "STRESSED",
    condition: (s) => s.cortisol > 0.4 && s.serotonin < 0.25,
  },
  {
    mode: "REWARD",
    condition: (s) => s.dopamine_tonic > 0.5 && s.serotonin > 0.35,
  },
  {
    mode: "VIGILANT",
    condition: (s) => s.norepinephrine > 0.5 && s.dopamine_phasic > 0.25,
  },
  {
    mode: "EXPLORATORY",
    condition: (s) => s.norepinephrine > 0.35 && s.t3_t4 > 0.5,
  },
  {
    mode: "SOCIAL",
    condition: (s) => s.oxytocin > 0.35 && s.dopamine_tonic > 0.25,
  },
  {
    mode: "FOCUSED",
    condition: (s) => s.norepinephrine > 0.35 && s.t3_t4 > 0.55,
  },
  {
    mode: "REFLECTIVE",
    condition: (s) => s.t3_t4 > 0.45 && s.serotonin > 0.3,
  },
  {
    mode: "RESTING",
    condition: (s) => s.anandamide > 0.2 && s.cortisol < 0.15,
  },
];

/**
 * Default baselines for a balanced personality
 */
const DEFAULT_BASELINES: EndocrineBaselines = {
  cortisol: 0.12,
  dopamine_tonic: 0.35,
  serotonin: 0.45,
  norepinephrine: 0.12,
  oxytocin: 0.15,
  t3_t4: 0.50,
  anandamide: 0.12,
  melatonin: 0.10,
};

const DEFAULT_SENSITIVITY: EndocrineSensitivity = {
  reward: 1.0,
  threat: 1.0,
  social: 1.0,
  novelty: 1.0,
};

/**
 * Virtual Endocrine System
 *
 * Manages a 16-channel hormone bus with biologically-inspired dynamics.
 * Hormones decay toward personality-dependent baselines and spike in
 * response to cognitive events.
 */
export class EndocrineSystem {
  private state: HormoneState;
  private config: EndocrineConfig;
  private _currentMode: CognitiveMode = "RESTING";

  constructor(config?: Partial<EndocrineConfig>) {
    this.config = {
      baselines: config?.baselines ?? DEFAULT_BASELINES,
      sensitivity: config?.sensitivity ?? DEFAULT_SENSITIVITY,
      decayRate: config?.decayRate ?? 0.08,
      maxSpike: config?.maxSpike ?? 1.0,
    };

    // Initialize all channels to baseline or zero
    this.state = this.createInitialState();
  }

  /**
   * Create initial hormone state from baselines
   */
  private createInitialState(): HormoneState {
    const b = this.config.baselines;
    return {
      cortisol: b.cortisol,
      dopamine_tonic: b.dopamine_tonic,
      dopamine_phasic: 0,
      serotonin: b.serotonin,
      norepinephrine: b.norepinephrine,
      oxytocin: b.oxytocin,
      t3_t4: b.t3_t4,
      anandamide: b.anandamide,
      melatonin: b.melatonin,
      crh: 0,
      acth: 0,
      il6: 0,
      gaba: 0.1,
      glutamate: 0.1,
      endorphin: 0.05,
      vasopressin: 0.05,
    };
  }

  /**
   * Get the baseline for a given channel
   */
  private getBaseline(channel: HormoneChannel): number {
    const b = this.config.baselines as unknown as Record<string, number>;
    return b[channel] ?? 0;
  }

  /**
   * Get sensitivity multiplier for an event category
   */
  private getSensitivityForEvent(event: EndocrineEvent): number {
    const s = this.config.sensitivity;
    switch (event) {
      case "REWARD_RECEIVED":
      case "GOAL_ACHIEVED":
        return s.reward;
      case "THREAT_DETECTED":
      case "ERROR_DETECTED":
        return s.threat;
      case "SOCIAL_BOND_SIGNAL":
        return s.social;
      case "NOVELTY_ENCOUNTERED":
        return s.novelty;
      default:
        return 1.0;
    }
  }

  /**
   * Signal an endocrine event (cognitive state trigger)
   */
  signalEvent(event: EndocrineEvent, intensity: number = 1.0): void {
    const effect = EVENT_EFFECTS[event];
    if (!effect) return;

    const sensitivity = this.getSensitivityForEvent(event);
    const scale = intensity * sensitivity;

    // Apply increases
    for (const [channel, amount] of Object.entries(effect.increases)) {
      const ch = channel as HormoneChannel;
      this.state[ch] = Math.min(
        this.config.maxSpike,
        this.state[ch] + (amount ?? 0) * scale,
      );
    }

    // Apply decreases
    if (effect.decreases) {
      for (const [channel, amount] of Object.entries(effect.decreases)) {
        const ch = channel as HormoneChannel;
        this.state[ch] = Math.max(0, this.state[ch] - (amount ?? 0) * scale);
      }
    }
  }

  /**
   * Tick the endocrine system (call every frame or at fixed interval)
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    const decay = this.config.decayRate * dt;

    for (const channel of Object.keys(this.state) as HormoneChannel[]) {
      const baseline = this.getBaseline(channel);
      const current = this.state[channel];

      if (current > baseline) {
        // Decay toward baseline
        this.state[channel] = Math.max(baseline, current - decay);
      } else if (current < baseline) {
        // Rise toward baseline
        this.state[channel] = Math.min(baseline, current + decay * 0.5);
      }
    }

    // Update cognitive mode
    this._currentMode = this.detectMode();
  }

  /**
   * Detect the current cognitive mode from hormone state
   */
  private detectMode(): CognitiveMode {
    for (const rule of MODE_RULES) {
      if (rule.condition(this.state)) {
        return rule.mode;
      }
    }
    return "RESTING";
  }

  /**
   * Get the current cognitive mode
   */
  currentMode(): CognitiveMode {
    return this._currentMode;
  }

  /**
   * Get the full hormone state (read-only copy)
   */
  getState(): Readonly<HormoneState> {
    return { ...this.state };
  }

  /**
   * Get a single hormone level
   */
  getLevel(channel: HormoneChannel): number {
    return this.state[channel];
  }

  /**
   * Reset to baseline state
   */
  reset(): void {
    this.state = this.createInitialState();
    this._currentMode = "RESTING";
  }

  /**
   * Get a human-readable summary of the current state
   */
  describe(): string {
    const top3 = (Object.entries(this.state) as [HormoneChannel, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ch, val]) => `${ch}=${val.toFixed(2)}`)
      .join(", ");
    return `[Endocrine] mode=${this._currentMode} top3=[${top3}]`;
  }
}
