/**
 * DTE Cognitive Driver for Deep Tree Echo Avatar
 *
 * Maps Deep Tree Echo cognitive states (from CognitiveBridge/Orchestrator)
 * to endocrine events, driving the avatar's expression system through
 * biologically-inspired hormone signaling.
 *
 * Composition: live2d-dtecho ⊗ cognitive-state → endocrine-system
 *
 * This is the "glue" between the cognitive system and the avatar:
 *
 *   CognitiveState → DTECognitiveDriver → EndocrineSystem → ExpressionBridge → Cubism Parameters
 *
 * It translates abstract cognitive metrics (valence, arousal, processing state,
 * Sys6 phase, Dove9 state) into concrete endocrine events with appropriate
 * intensities.
 */

import type { EndocrineSystem, EndocrineEvent } from "./endocrine-system";

/**
 * Cognitive state input (compatible with CognitiveBridge's UnifiedCognitiveState)
 */
export interface DTECognitiveInput {
  /** Emotional valence from cognitive system (-1 to 1) */
  emotionalValence: number;
  /** Emotional arousal from cognitive system (0 to 1) */
  emotionalArousal: number;
  /** Salience/attention score (0 to 1) */
  salienceScore: number;
  /** Whether the system is currently processing */
  isProcessing: boolean;
  /** Processing intensity (0 to 1) */
  processingIntensity?: number;
  /** Whether the avatar is speaking */
  isSpeaking: boolean;
  /** Audio level for lip sync (0 to 1) */
  audioLevel?: number;
  /** Current Sys6 phase (0-29) */
  sys6Phase?: number;
  /** Current DTE simulation state name */
  dteStateName?: string;
  /** Bot processing state */
  botProcessingState?: "idle" | "listening" | "thinking" | "responding" | "error";
}

/**
 * DTE simulation state → endocrine event mapping
 * Based on live2d-dtecho skill's DTE Cognitive State → Endocrine Events table
 */
const DTE_STATE_EVENTS: Record<
  string,
  { event: EndocrineEvent; intensity: number }
> = {
  "Recursive Expansion": { event: "NOVELTY_ENCOUNTERED", intensity: 0.8 },
  "Novel Insights": { event: "REWARD_RECEIVED", intensity: 0.9 },
  "Entropy Threshold": { event: "THREAT_DETECTED", intensity: 0.6 },
  "Synthesis Phase": { event: "GOAL_ACHIEVED", intensity: 0.85 },
  "Self-Sealing Loop": { event: "ERROR_DETECTED", intensity: 0.7 },
  "Knowledge Integration": { event: "SOCIAL_BOND_SIGNAL", intensity: 0.75 },
  "Self-Reference Point": { event: "FOCUS_SIGNAL", intensity: 0.7 },
  "Pattern Recognition": { event: "REWARD_RECEIVED", intensity: 0.8 },
  "Evolutionary Pruning": { event: "FOCUS_SIGNAL", intensity: 0.6 },
  "External Validation Triggered": { event: "SOCIAL_BOND_SIGNAL", intensity: 0.9 },
  "Deep Recursion": { event: "RELAXATION_SIGNAL", intensity: 0.7 },
};

/**
 * Bot processing state → endocrine event mapping
 */
const BOT_STATE_EVENTS: Record<
  string,
  { event: EndocrineEvent; intensity: number }
> = {
  idle: { event: "IDLE_SIGNAL", intensity: 0.5 },
  listening: { event: "NOVELTY_ENCOUNTERED", intensity: 0.4 },
  thinking: { event: "FOCUS_SIGNAL", intensity: 0.7 },
  responding: { event: "SPEAKING_SIGNAL", intensity: 0.6 },
  error: { event: "ERROR_DETECTED", intensity: 0.8 },
};

/**
 * Sys6 phase ranges → endocrine events
 * The 30-phase Sys6 cycle maps to different cognitive modes
 */
function sys6PhaseToEvent(
  phase: number,
): { event: EndocrineEvent; intensity: number } | null {
  if (phase >= 0 && phase < 5) {
    // Sensing phase
    return { event: "NOVELTY_ENCOUNTERED", intensity: 0.3 };
  } else if (phase >= 5 && phase < 15) {
    // Processing phase
    return { event: "FOCUS_SIGNAL", intensity: 0.4 };
  } else if (phase >= 15 && phase < 25) {
    // Integration phase
    return { event: "GOAL_ACHIEVED", intensity: 0.3 };
  } else if (phase >= 25 && phase < 30) {
    // Rest/reflection phase
    return { event: "RELAXATION_SIGNAL", intensity: 0.3 };
  }
  return null;
}

/**
 * DTE Cognitive Driver
 *
 * Translates cognitive state updates into endocrine events,
 * driving the avatar's expression system.
 */
export class DTECognitiveDriver {
  private endocrine: EndocrineSystem;
  private previousState: DTECognitiveInput | null = null;
  private previousBotState: string = "idle";

  constructor(endocrine: EndocrineSystem) {
    this.endocrine = endocrine;
  }

  /**
   * Update from cognitive state
   * Call this every time the cognitive state changes (typically every 500ms-2s)
   */
  update(input: DTECognitiveInput): void {
    // 1. Map DTE simulation state to endocrine event
    if (input.dteStateName) {
      const mapping = DTE_STATE_EVENTS[input.dteStateName];
      if (mapping) {
        this.endocrine.signalEvent(mapping.event, mapping.intensity);
      }
    }

    // 2. Map bot processing state to endocrine event (only on change)
    if (
      input.botProcessingState &&
      input.botProcessingState !== this.previousBotState
    ) {
      const mapping = BOT_STATE_EVENTS[input.botProcessingState];
      if (mapping) {
        this.endocrine.signalEvent(mapping.event, mapping.intensity);
      }
      this.previousBotState = input.botProcessingState;
    }

    // 3. Map Sys6 phase to background endocrine event
    if (input.sys6Phase !== undefined) {
      const phaseEvent = sys6PhaseToEvent(input.sys6Phase);
      if (phaseEvent) {
        // Background events are lower intensity
        this.endocrine.signalEvent(phaseEvent.event, phaseEvent.intensity * 0.5);
      }
    }

    // 4. Map valence/arousal to endocrine events
    this.mapValenceArousal(input);

    // 5. Handle speaking state
    if (input.isSpeaking) {
      this.endocrine.signalEvent("SPEAKING_SIGNAL", input.audioLevel ?? 0.5);
    }

    // 6. Handle high processing intensity
    if (input.isProcessing && (input.processingIntensity ?? 0) > 0.7) {
      this.endocrine.signalEvent(
        "FOCUS_SIGNAL",
        input.processingIntensity ?? 0.7,
      );
    }

    this.previousState = input;
  }

  /**
   * Map valence/arousal to endocrine events
   * Uses the circumplex model of affect
   */
  private mapValenceArousal(input: DTECognitiveInput): void {
    const { emotionalValence, emotionalArousal } = input;
    const prev = this.previousState;

    // Only fire events on significant changes
    const valenceDelta = prev
      ? Math.abs(emotionalValence - prev.emotionalValence)
      : 1;
    const arousalDelta = prev
      ? Math.abs(emotionalArousal - prev.emotionalArousal)
      : 1;

    if (valenceDelta < 0.1 && arousalDelta < 0.1) return;

    // High positive valence + high arousal = excitement/reward
    if (emotionalValence > 0.4 && emotionalArousal > 0.5) {
      this.endocrine.signalEvent(
        "REWARD_RECEIVED",
        emotionalValence * emotionalArousal * 0.5,
      );
    }

    // High positive valence + low arousal = contentment/relaxation
    if (emotionalValence > 0.3 && emotionalArousal < 0.3) {
      this.endocrine.signalEvent(
        "RELAXATION_SIGNAL",
        emotionalValence * (1 - emotionalArousal) * 0.5,
      );
    }

    // Negative valence + high arousal = threat/stress
    if (emotionalValence < -0.3 && emotionalArousal > 0.5) {
      this.endocrine.signalEvent(
        "THREAT_DETECTED",
        Math.abs(emotionalValence) * emotionalArousal * 0.4,
      );
    }

    // Negative valence + low arousal = sadness (lower serotonin)
    if (emotionalValence < -0.3 && emotionalArousal < 0.3) {
      this.endocrine.signalEvent(
        "ERROR_DETECTED",
        Math.abs(emotionalValence) * 0.3,
      );
    }

    // High arousal alone = novelty/alertness
    if (emotionalArousal > 0.6) {
      this.endocrine.signalEvent(
        "NOVELTY_ENCOUNTERED",
        emotionalArousal * 0.3,
      );
    }

    // Social context (moderate positive valence)
    if (emotionalValence > 0.2 && emotionalArousal > 0.2 && emotionalArousal < 0.6) {
      this.endocrine.signalEvent(
        "SOCIAL_BOND_SIGNAL",
        emotionalValence * 0.3,
      );
    }
  }

  /**
   * Get the endocrine system (for direct access if needed)
   */
  getEndocrine(): EndocrineSystem {
    return this.endocrine;
  }
}
