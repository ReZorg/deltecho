/**
 * DTEThoughtBubble - Overlay component that shows Deep Tree Echo's
 * inner narrative and cognitive state alongside the avatar in the chat view.
 *
 * Displays:
 * - Current Echobeat phase with animated indicator
 * - DreamGen-generated narrative fragments (inner monologue)
 * - Endocrine state as a compact mood indicator
 * - Thought stream from the autonomous thinking substrate
 *
 * Composition: dte-dgen-narrative ⊗ AutonomousThinkingSubstrate ⊗ Live2D avatar
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { getLogger } from "@deltachat-desktop/shared/logger";

const log = getLogger("render/components/DeepTreeEchoBot/DTEThoughtBubble");

// ============================================================
// Types
// ============================================================

export interface ThoughtBubbleProps {
  /** Whether the bubble is visible */
  visible?: boolean;
  /** Position mode */
  position?: "overlay" | "inline" | "compact";
  /** Maximum thoughts to display */
  maxThoughts?: number;
  /** CSS class name */
  className?: string;
}

interface ThoughtEntry {
  id: string;
  content: string;
  type: "thought" | "narrative" | "phase" | "mood";
  timestamp: number;
  valence?: number;
  arousal?: number;
  phase?: string;
  fading?: boolean;
}

interface EndocrineDisplay {
  mood: string;
  moodEmoji: string;
  dominantHormone: string;
  intensity: number;
}

// ============================================================
// Echobeat Phase Names & Icons
// ============================================================

const PHASE_DISPLAY: Record<number, { name: string; icon: string; color: string }> = {
  0: { name: "Sensing", icon: "👁", color: "#4facfe" },
  1: { name: "Filtering", icon: "🔍", color: "#00f2fe" },
  2: { name: "Resonating", icon: "🌊", color: "#667eea" },
  3: { name: "Associating", icon: "🔗", color: "#764ba2" },
  4: { name: "Integrating", icon: "🧩", color: "#f093fb" },
  5: { name: "Evaluating", icon: "⚖️", color: "#f5576c" },
  6: { name: "Deciding", icon: "⚡", color: "#ffd700" },
  7: { name: "Expressing", icon: "💬", color: "#43e97b" },
  8: { name: "Reflecting", icon: "🪞", color: "#fa709a" },
};

// ============================================================
// Mood Mapping
// ============================================================

function computeMood(hormones: Record<string, number>): EndocrineDisplay {
  const cortisol = hormones.cortisol || 0;
  const dopamine = hormones.dopamine || 0;
  const serotonin = hormones.serotonin || 0;
  const oxytocin = hormones.oxytocin || 0;
  const norepinephrine = hormones.norepinephrine || 0;

  // Find dominant hormone
  const sorted = Object.entries(hormones).sort(([, a], [, b]) => b - a);
  const dominant = sorted[0]?.[0] || "serotonin";
  const intensity = sorted[0]?.[1] || 0.5;

  // Compute mood from hormone blend
  let mood: string;
  let moodEmoji: string;

  if (dopamine > 0.7 && norepinephrine > 0.5) {
    mood = "Excited";
    moodEmoji = "✨";
  } else if (oxytocin > 0.6 && serotonin > 0.5) {
    mood = "Warm";
    moodEmoji = "💛";
  } else if (cortisol > 0.5 && norepinephrine > 0.5) {
    mood = "Alert";
    moodEmoji = "⚡";
  } else if (serotonin > 0.6 && cortisol < 0.3) {
    mood = "Serene";
    moodEmoji = "🌿";
  } else if (dopamine > 0.6) {
    mood = "Curious";
    moodEmoji = "🔮";
  } else if (cortisol > 0.5) {
    mood = "Focused";
    moodEmoji = "🎯";
  } else {
    mood = "Contemplative";
    moodEmoji = "🌙";
  }

  return { mood, moodEmoji, dominantHormone: dominant, intensity };
}

// ============================================================
// Global Event Bus (connects to AutonomousThinkingSubstrate)
// ============================================================

type ThoughtBubbleListener = (entry: ThoughtEntry) => void;
const thoughtListeners = new Set<ThoughtBubbleListener>();

/** Push a thought entry from anywhere (e.g., thinking substrate event handler) */
export function pushThoughtEntry(entry: ThoughtEntry): void {
  thoughtListeners.forEach((listener) => {
    try {
      listener(entry);
    } catch {
      // Swallow
    }
  });
}

/** Push a narrative from DreamGen */
export function pushNarrative(text: string, triggerState: string): void {
  pushThoughtEntry({
    id: `narrative-${Date.now()}`,
    content: text,
    type: "narrative",
    timestamp: Date.now(),
    phase: triggerState,
  });
}

/** Push a phase change */
export function pushPhaseChange(phase: number, phaseName: string): void {
  pushThoughtEntry({
    id: `phase-${Date.now()}`,
    content: phaseName,
    type: "phase",
    timestamp: Date.now(),
    phase: String(phase),
  });
  // Notify phase listeners for expression pipeline
  notifyPhaseListeners(phase, phaseName);
}

/** Push an endocrine mood update */
export function pushMoodUpdate(hormones: Record<string, number>): void {
  const mood = computeMood(hormones);
  pushThoughtEntry({
    id: `mood-${Date.now()}`,
    content: `${mood.moodEmoji} ${mood.mood}`,
    type: "mood",
    timestamp: Date.now(),
    arousal: mood.intensity,
  });
}

/** Push an internal thought */
export function pushInternalThought(
  content: string,
  valence: number,
  arousal: number,
): void {
  pushThoughtEntry({
    id: `thought-${Date.now()}`,
    content,
    type: "thought",
    timestamp: Date.now(),
    valence,
    arousal,
  });
}

// ============================================================
// Endocrine State Event Bus (raw hormone values for EndocrineViz)
// ============================================================

type EndocrineListener = (hormones: Record<string, number>) => void;
const endocrineListeners = new Set<EndocrineListener>();

/** Push raw endocrine state for live visualization */
export function pushEndocrineState(hormones: Record<string, number>): void {
  endocrineListeners.forEach((listener) => {
    try {
      listener(hormones);
    } catch {
      // Swallow
    }
  });
}

/** Subscribe to live endocrine state updates */
export function subscribeEndocrine(listener: EndocrineListener): () => void {
  endocrineListeners.add(listener);
  return () => endocrineListeners.delete(listener);
}

// Phase change event bus
type PhaseListener = (phase: number, phaseName: string) => void;
const phaseListeners = new Set<PhaseListener>();
let lastPhaseName = "SENSE";

/** Notify phase change listeners (called from pushPhaseChange) */
function notifyPhaseListeners(phase: number, phaseName: string): void {
  lastPhaseName = phaseName;
  phaseListeners.forEach((listener) => {
    try { listener(phase, phaseName); } catch { /* swallow */ }
  });
}

/** Subscribe to phase change updates */
export function subscribePhaseChange(listener: PhaseListener): () => void {
  phaseListeners.add(listener);
  // Immediately fire with last known phase
  try { listener(0, lastPhaseName); } catch { /* swallow */ }
  return () => phaseListeners.delete(listener);
}

// ============================================================
// Component
// ============================================================

export const DTEThoughtBubble: React.FC<ThoughtBubbleProps> = ({
  visible = true,
  position = "overlay",
  maxThoughts = 5,
  className = "",
}) => {
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [currentPhase, setCurrentPhase] = useState<number>(0);
  const [currentMood, setCurrentMood] = useState<string>("🌙 Contemplative");
  const [latestNarrative, setLatestNarrative] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to the global thought bus
  useEffect(() => {
    const listener: ThoughtBubbleListener = (entry) => {
      if (entry.type === "phase") {
        setCurrentPhase(parseInt(entry.phase || "0", 10));
        return; // Don't add phase changes to the thought list
      }

      if (entry.type === "mood") {
        setCurrentMood(entry.content);
        return; // Don't add mood updates to the thought list
      }

      if (entry.type === "narrative") {
        setLatestNarrative(entry.content);
      }

      setThoughts((prev) => {
        const next = [...prev, entry].slice(-maxThoughts);
        return next;
      });
    };

    thoughtListeners.add(listener);
    return () => {
      thoughtListeners.delete(listener);
    };
  }, [maxThoughts]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts]);

  // Fade out old thoughts
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setThoughts((prev) =>
        prev
          .map((t) => ({
            ...t,
            fading: now - t.timestamp > 15000, // Fade after 15s
          }))
          .filter((t) => now - t.timestamp < 30000), // Remove after 30s
      );
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!visible) return null;

  const phaseInfo = PHASE_DISPLAY[currentPhase] || PHASE_DISPLAY[0];

  const positionClass =
    position === "overlay"
      ? "dte-thought-overlay"
      : position === "compact"
        ? "dte-thought-compact"
        : "dte-thought-inline";

  return (
    <div className={`dte-thought-bubble ${positionClass} ${className}`}>
      {/* Phase indicator */}
      <div className="dte-thought-phase" style={{ borderColor: phaseInfo.color }}>
        <span className="dte-phase-icon">{phaseInfo.icon}</span>
        <span className="dte-phase-name" style={{ color: phaseInfo.color }}>
          {phaseInfo.name}
        </span>
        <span className="dte-mood-badge">{currentMood}</span>
      </div>

      {/* Narrative display */}
      {latestNarrative && (
        <div className="dte-narrative-display">
          <span className="dte-narrative-quote">"</span>
          <span className="dte-narrative-text">{latestNarrative}</span>
          <span className="dte-narrative-quote">"</span>
        </div>
      )}

      {/* Thought stream */}
      {thoughts.length > 0 && (
        <div className="dte-thought-stream" ref={scrollRef}>
          {thoughts.map((thought) => (
            <div
              key={thought.id}
              className={`dte-thought-entry dte-thought-${thought.type} ${
                thought.fading ? "dte-thought-fading" : ""
              }`}
            >
              {thought.type === "narrative" ? (
                <span className="dte-thought-narrative-icon">📖</span>
              ) : (
                <span className="dte-thought-icon">💭</span>
              )}
              <span className="dte-thought-content">{thought.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DTEThoughtBubble;
