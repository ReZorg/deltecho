/**
 * AvatarCognitivePanel - Right-hand panel for DTE avatar and cognitive stream
 *
 * Full-height panel showing:
 * 1. Live2D avatar (top 60%) with dynamic expressions
 * 2. Cognitive stream (bottom 40%) with:
 *    - Echobeat phase indicator
 *    - Thought stream (inner monologue)
 *    - Endocrine state visualization
 *    - DreamGen narrative fragments
 *
 * This is the "always-on" presence of Deep Tree Echo - streaming Neuro-Sama
 * level cognitive engagement while simultaneously working on projects.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { DeepTreeEchoAvatarDisplay } from "../DeepTreeEchoBot/DeepTreeEchoAvatarDisplay";
import { DTEThoughtBubble } from "../DeepTreeEchoBot/DTEThoughtBubble";

// ============================================================
// Endocrine Visualization
// ============================================================

interface EndocrineState {
  cortisol: number;
  dopamine: number;
  serotonin: number;
  oxytocin: number;
  norepinephrine: number;
  endorphin: number;
  melatonin: number;
  gaba: number;
  cognitive_mode: string;
}

const HORMONE_COLORS: Record<string, string> = {
  cortisol: "#f5576c",
  dopamine: "#ffd700",
  serotonin: "#43e97b",
  oxytocin: "#f093fb",
  norepinephrine: "#4facfe",
  endorphin: "#fa709a",
  melatonin: "#764ba2",
  gaba: "#667eea",
};

const HORMONE_LABELS: Record<string, string> = {
  cortisol: "COR",
  dopamine: "DOP",
  serotonin: "SER",
  oxytocin: "OXY",
  norepinephrine: "NOR",
  endorphin: "END",
  melatonin: "MEL",
  gaba: "GAB",
};

const EndocrineViz: React.FC<{ state: EndocrineState | null }> = ({
  state,
}) => {
  if (!state) {
    return (
      <div className="endocrine-viz endocrine-viz--empty">
        <span className="endocrine-viz__label">Endocrine: Initializing...</span>
      </div>
    );
  }

  const hormones = [
    { key: "cortisol", value: state.cortisol },
    { key: "dopamine", value: state.dopamine },
    { key: "serotonin", value: state.serotonin },
    { key: "oxytocin", value: state.oxytocin },
    { key: "norepinephrine", value: state.norepinephrine },
    { key: "endorphin", value: state.endorphin },
    { key: "melatonin", value: state.melatonin },
    { key: "gaba", value: state.gaba },
  ];

  // Find dominant hormone
  const dominant = hormones.reduce((a, b) => (a.value > b.value ? a : b));

  return (
    <div className="endocrine-viz">
      <div className="endocrine-viz__header">
        <span className="endocrine-viz__mode">{state.cognitive_mode}</span>
        <span
          className="endocrine-viz__dominant"
          style={{ color: HORMONE_COLORS[dominant.key] }}
        >
          {HORMONE_LABELS[dominant.key]} dominant
        </span>
      </div>
      <div className="endocrine-viz__bars">
        {hormones.map(({ key, value }) => (
          <div key={key} className="endocrine-viz__bar-row">
            <span
              className="endocrine-viz__bar-label"
              style={{ color: HORMONE_COLORS[key] }}
            >
              {HORMONE_LABELS[key]}
            </span>
            <div className="endocrine-viz__bar-track">
              <div
                className="endocrine-viz__bar-fill"
                style={{
                  width: `${Math.min(value * 100, 100)}%`,
                  background: HORMONE_COLORS[key],
                  opacity: 0.4 + value * 0.6,
                }}
              />
            </div>
            <span className="endocrine-viz__bar-value">
              {(value * 100).toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// Session Stats
// ============================================================

interface SessionStats {
  thoughtCount: number;
  conversationCount: number;
  narrativeCount: number;
  sessionDuration: string;
}

const SessionStatsBar: React.FC<{ stats: SessionStats }> = ({ stats }) => (
  <div className="session-stats">
    <div className="session-stats__item">
      <span className="session-stats__icon">🧠</span>
      <span className="session-stats__value">{stats.thoughtCount}</span>
    </div>
    <div className="session-stats__item">
      <span className="session-stats__icon">💬</span>
      <span className="session-stats__value">{stats.conversationCount}</span>
    </div>
    <div className="session-stats__item">
      <span className="session-stats__icon">📖</span>
      <span className="session-stats__value">{stats.narrativeCount}</span>
    </div>
    <div className="session-stats__item">
      <span className="session-stats__icon">⏱</span>
      <span className="session-stats__value">{stats.sessionDuration}</span>
    </div>
  </div>
);

// ============================================================
// Main Panel Component
// ============================================================

export const AvatarCognitivePanel: React.FC = () => {
  const [endocrineState, setEndocrineState] = useState<EndocrineState | null>(
    null,
  );
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    thoughtCount: 0,
    conversationCount: 0,
    narrativeCount: 0,
    sessionDuration: "0:00",
  });
  const [showEndocrine, setShowEndocrine] = useState(true);
  const sessionStartRef = useRef(Date.now());

  // Poll endocrine state from CF-native persistence
  useEffect(() => {
    const pollEndocrine = async () => {
      try {
        const response = await fetch("/backend-api/cognitive/recall/endocrine");
        if (response.ok) {
          const data = await response.json();
          if (data.current) {
            setEndocrineState(data.current);
          }
        }
      } catch {
        // Silent fail
      }
    };

    pollEndocrine();
    const interval = setInterval(pollEndocrine, 10000);
    return () => clearInterval(interval);
  }, []);

  // Poll session stats
  useEffect(() => {
    const pollStats = async () => {
      try {
        const response = await fetch("/backend-api/cognitive/status");
        if (response.ok) {
          const data = await response.json();
          const elapsed = Math.floor(
            (Date.now() - sessionStartRef.current) / 1000,
          );
          const minutes = Math.floor(elapsed / 60);
          const seconds = elapsed % 60;

          setSessionStats({
            thoughtCount: data.thoughtCount || 0,
            conversationCount: data.session?.conversation_count || 0,
            narrativeCount: data.session?.narrative_count || 0,
            sessionDuration: `${minutes}:${seconds.toString().padStart(2, "0")}`,
          });
        }
      } catch {
        // Silent fail
      }
    };

    pollStats();
    const interval = setInterval(pollStats, 15000);
    return () => clearInterval(interval);
  }, []);

  // Update session duration every second
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - sessionStartRef.current) / 1000,
      );
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      setSessionStats((prev) => ({
        ...prev,
        sessionDuration: `${minutes}:${seconds.toString().padStart(2, "0")}`,
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="avatar-cognitive-panel">
      {/* Avatar Section (top) */}
      <div className="avatar-cognitive-panel__avatar">
        <DeepTreeEchoAvatarDisplay
          position="panel"
          width={400}
          height={500}
          className="avatar-cognitive-panel__live2d"
        />
      </div>

      {/* Cognitive Stream Section (bottom) */}
      <div className="avatar-cognitive-panel__stream">
        {/* Session stats bar */}
        <SessionStatsBar stats={sessionStats} />

        {/* Thought bubble / inner monologue */}
        <div className="avatar-cognitive-panel__thoughts">
          <DTEThoughtBubble
            visible={true}
            position="inline"
            maxThoughts={6}
          />
        </div>

        {/* Endocrine visualization (collapsible) */}
        <div className="avatar-cognitive-panel__endocrine">
          <button
            className="avatar-cognitive-panel__endocrine-toggle"
            onClick={() => setShowEndocrine(!showEndocrine)}
          >
            <span>Endocrine State</span>
            <span>{showEndocrine ? "▼" : "▶"}</span>
          </button>
          {showEndocrine && <EndocrineViz state={endocrineState} />}
        </div>
      </div>
    </div>
  );
};

export default AvatarCognitivePanel;
