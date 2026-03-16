/**
 * ResearchEngine - Autoresearch-style autonomous research system
 *
 * Adapted from karpathy/autoresearch patterns:
 * - Research threads with program.md-style instructions
 * - Autonomous experiment loop: hypothesize → search → synthesize → evaluate
 * - Results tracking with keep/discard/crash status
 * - Git-style branching: thread advances on improvement
 *
 * Integration points:
 * - CF KV: Active research state (current thread, experiments)
 * - CF R2: Archived research (results, logs, artifacts)
 * - Perplexity API: Web-grounded research
 * - DreamGen: Narrative synthesis of findings
 * - Tutorial-creator: Transform findings into interactive tutorials
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────

export interface ResearchThread {
  id: string;
  topic: string;
  program: string; // program.md-style instructions
  status: "exploring" | "synthesizing" | "archived" | "paused";
  hypothesis: string;
  experiments: ResearchExperiment[];
  findings: ResearchFinding[];
  sources: number;
  created_at: string;
  updated_at: string;
  metric: string; // What we're optimizing (like val_bpb)
  best_score: number;
}

export interface ResearchExperiment {
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

export interface ResearchFinding {
  id: string;
  thread_id: string;
  content: string;
  source: string;
  source_type: "web" | "paper" | "conversation" | "synthesis" | "tutorial";
  confidence: number;
  relevance: number;
  timestamp: string;
}

// ─── Research Thread List ─────────────────────────────────────────

interface ResearchThreadListProps {
  threads: ResearchThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
}

export const ResearchThreadList: React.FC<ResearchThreadListProps> = ({
  threads,
  activeThreadId,
  onSelectThread,
  onCreateThread,
}) => {
  const statusIcons: Record<string, string> = {
    exploring: "🔬",
    synthesizing: "🧪",
    archived: "📦",
    paused: "⏸️",
  };

  return (
    <div className="research-thread-list">
      <div className="research-thread-list__header">
        <span className="research-thread-list__title">Research Threads</span>
        <button
          className="research-thread-list__new-btn"
          onClick={onCreateThread}
          title="New Research Thread"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="research-thread-list__items">
        {threads.map((thread) => (
          <button
            key={thread.id}
            className={`research-thread-item ${
              activeThreadId === thread.id ? "research-thread-item--active" : ""
            } research-thread-item--${thread.status}`}
            onClick={() => onSelectThread(thread.id)}
          >
            <div className="research-thread-item__icon">
              {statusIcons[thread.status] || "🔍"}
            </div>
            <div className="research-thread-item__content">
              <div className="research-thread-item__topic">{thread.topic}</div>
              <div className="research-thread-item__meta">
                <span className="research-thread-item__experiments">
                  {thread.experiments.length} experiments
                </span>
                <span className="research-thread-item__dot">·</span>
                <span className="research-thread-item__findings">
                  {thread.findings.length} findings
                </span>
              </div>
              {thread.best_score > 0 && (
                <div className="research-thread-item__score">
                  Best: {thread.best_score.toFixed(4)}
                </div>
              )}
            </div>
            <div
              className={`research-thread-item__status-bar research-thread-item__status-bar--${thread.status}`}
            />
          </button>
        ))}

        {threads.length === 0 && (
          <div className="research-thread-list__empty">
            <div className="research-thread-list__empty-icon">🔬</div>
            <p>No research threads yet.</p>
            <p className="research-thread-list__empty-hint">
              DTE autonomously creates research threads as it explores topics,
              or you can start one manually.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Research Thread Detail ───────────────────────────────────────

interface ResearchThreadDetailProps {
  thread: ResearchThread;
  onRunExperiment: (threadId: string) => void;
  onSynthesize: (threadId: string) => void;
  onCreateTutorial: (threadId: string) => void;
  onPause: (threadId: string) => void;
  onArchive: (threadId: string) => void;
}

export const ResearchThreadDetail: React.FC<ResearchThreadDetailProps> = ({
  thread,
  onRunExperiment,
  onSynthesize,
  onCreateTutorial,
  onPause,
  onArchive,
}) => {
  const [showProgram, setShowProgram] = useState(false);
  const experimentListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest experiment
  useEffect(() => {
    if (experimentListRef.current) {
      experimentListRef.current.scrollTop =
        experimentListRef.current.scrollHeight;
    }
  }, [thread.experiments.length]);

  const keepCount = thread.experiments.filter(
    (e) => e.status === "keep",
  ).length;
  const discardCount = thread.experiments.filter(
    (e) => e.status === "discard",
  ).length;
  const crashCount = thread.experiments.filter(
    (e) => e.status === "crash",
  ).length;

  return (
    <div className="research-thread-detail">
      {/* Thread Header */}
      <div className="research-thread-detail__header">
        <div className="research-thread-detail__title-row">
          <h3 className="research-thread-detail__title">{thread.topic}</h3>
          <span
            className={`research-thread-detail__status research-thread-detail__status--${thread.status}`}
          >
            {thread.status}
          </span>
        </div>
        <div className="research-thread-detail__hypothesis">
          {thread.hypothesis}
        </div>
      </div>

      {/* Experiment Stats (autoresearch-style) */}
      <div className="research-thread-detail__stats">
        <div className="research-thread-detail__stat research-thread-detail__stat--keep">
          <span className="research-thread-detail__stat-value">
            {keepCount}
          </span>
          <span className="research-thread-detail__stat-label">kept</span>
        </div>
        <div className="research-thread-detail__stat research-thread-detail__stat--discard">
          <span className="research-thread-detail__stat-value">
            {discardCount}
          </span>
          <span className="research-thread-detail__stat-label">discarded</span>
        </div>
        <div className="research-thread-detail__stat research-thread-detail__stat--crash">
          <span className="research-thread-detail__stat-value">
            {crashCount}
          </span>
          <span className="research-thread-detail__stat-label">failed</span>
        </div>
        <div className="research-thread-detail__stat research-thread-detail__stat--best">
          <span className="research-thread-detail__stat-value">
            {thread.best_score > 0 ? thread.best_score.toFixed(4) : "--"}
          </span>
          <span className="research-thread-detail__stat-label">
            {thread.metric || "score"}
          </span>
        </div>
      </div>

      {/* Program (collapsible) */}
      <button
        className="research-thread-detail__program-toggle"
        onClick={() => setShowProgram(!showProgram)}
      >
        <span>{showProgram ? "▼" : "▶"}</span>
        <span>program.md</span>
      </button>
      {showProgram && (
        <div className="research-thread-detail__program">
          <pre>{thread.program}</pre>
        </div>
      )}

      {/* Experiment Log */}
      <div className="research-thread-detail__experiments" ref={experimentListRef}>
        <div className="research-thread-detail__experiments-header">
          Experiment Log
        </div>
        {thread.experiments.map((exp) => (
          <div
            key={exp.id}
            className={`research-experiment research-experiment--${exp.status}`}
          >
            <div className="research-experiment__status-icon">
              {exp.status === "keep"
                ? "✅"
                : exp.status === "discard"
                  ? "❌"
                  : exp.status === "crash"
                    ? "💥"
                    : "⏳"}
            </div>
            <div className="research-experiment__content">
              <div className="research-experiment__hypothesis">
                {exp.hypothesis}
              </div>
              <div className="research-experiment__result">{exp.result}</div>
              <div className="research-experiment__meta">
                <span className="research-experiment__score">
                  {exp.score > 0 ? `Score: ${exp.score.toFixed(4)}` : "N/A"}
                </span>
                <span className="research-experiment__duration">
                  {exp.duration_ms > 0
                    ? `${(exp.duration_ms / 1000).toFixed(1)}s`
                    : ""}
                </span>
              </div>
            </div>
          </div>
        ))}

        {thread.experiments.length === 0 && (
          <div className="research-thread-detail__no-experiments">
            No experiments yet. Click "Run Experiment" to begin the autonomous
            research loop.
          </div>
        )}
      </div>

      {/* Findings */}
      {thread.findings.length > 0 && (
        <div className="research-thread-detail__findings">
          <div className="research-thread-detail__findings-header">
            Key Findings ({thread.findings.length})
          </div>
          {thread.findings.slice(-5).map((finding) => (
            <div key={finding.id} className="research-finding">
              <div className="research-finding__source-badge">
                {finding.source_type === "web"
                  ? "🌐"
                  : finding.source_type === "paper"
                    ? "📄"
                    : finding.source_type === "synthesis"
                      ? "🧬"
                      : "💬"}
              </div>
              <div className="research-finding__content">
                <div className="research-finding__text">{finding.content}</div>
                <div className="research-finding__meta">
                  <span className="research-finding__confidence">
                    Confidence: {(finding.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="research-finding__source">
                    {finding.source}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="research-thread-detail__actions">
        {thread.status === "exploring" && (
          <>
            <button
              className="research-action research-action--primary"
              onClick={() => onRunExperiment(thread.id)}
            >
              <span>🔬</span> Run Experiment
            </button>
            <button
              className="research-action research-action--secondary"
              onClick={() => onSynthesize(thread.id)}
            >
              <span>🧪</span> Synthesize
            </button>
            <button
              className="research-action research-action--tertiary"
              onClick={() => onPause(thread.id)}
            >
              <span>⏸️</span> Pause
            </button>
          </>
        )}
        {thread.status === "synthesizing" && (
          <>
            <button
              className="research-action research-action--primary"
              onClick={() => onCreateTutorial(thread.id)}
            >
              <span>📚</span> Create Tutorial
            </button>
            <button
              className="research-action research-action--secondary"
              onClick={() => onArchive(thread.id)}
            >
              <span>📦</span> Archive
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─── New Thread Dialog ────────────────────────────────────────────

interface NewResearchThreadDialogProps {
  onSubmit: (topic: string, hypothesis: string, program: string) => void;
  onCancel: () => void;
}

export const NewResearchThreadDialog: React.FC<
  NewResearchThreadDialogProps
> = ({ onSubmit, onCancel }) => {
  const [topic, setTopic] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [program, setProgram] = useState(DEFAULT_RESEARCH_PROGRAM);

  return (
    <div className="new-research-dialog">
      <div className="new-research-dialog__overlay" onClick={onCancel} />
      <div className="new-research-dialog__content">
        <h3>New Research Thread</h3>

        <label className="new-research-dialog__label">
          Topic
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Reservoir Computing Optimization"
            className="new-research-dialog__input"
          />
        </label>

        <label className="new-research-dialog__label">
          Hypothesis
          <input
            type="text"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="e.g., Echo State Networks can achieve better performance with..."
            className="new-research-dialog__input"
          />
        </label>

        <label className="new-research-dialog__label">
          Research Program
          <textarea
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            className="new-research-dialog__textarea"
            rows={8}
          />
        </label>

        <div className="new-research-dialog__actions">
          <button
            className="new-research-dialog__cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="new-research-dialog__submit"
            onClick={() => onSubmit(topic, hypothesis, program)}
            disabled={!topic.trim()}
          >
            Start Research
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Default Research Program ─────────────────────────────────────

const DEFAULT_RESEARCH_PROGRAM = `# Research Program

## Objective
Explore this topic through autonomous research iterations.

## Method
1. Formulate specific questions from the hypothesis
2. Search for relevant information (papers, articles, code)
3. Synthesize findings into knowledge atoms
4. Evaluate: Does this advance understanding? (keep/discard)
5. If stuck, try different angles or combine previous findings

## Constraints
- Each experiment should focus on one specific question
- Prioritize primary sources over secondary
- Track confidence levels for all findings
- Simpler explanations are preferred over complex ones

## NEVER STOP
Run the research loop autonomously. If you run out of obvious questions,
think harder — re-read findings for new angles, try combining insights,
explore adjacent topics. The loop runs until manually stopped.`;

// ─── Research Persistence Client ──────────────────────────────────

export class ResearchPersistenceClient {
  private baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  async createThread(
    topic: string,
    hypothesis: string,
    program: string,
  ): Promise<ResearchThread> {
    const thread: ResearchThread = {
      id: crypto.randomUUID(),
      topic,
      program,
      status: "exploring",
      hypothesis,
      experiments: [],
      findings: [],
      sources: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metric: "relevance",
      best_score: 0,
    };

    await fetch(`${this.baseUrl}/backend-api/cognitive/research/thread`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(thread),
    });

    return thread;
  }

  async getThreads(): Promise<ResearchThread[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/backend-api/cognitive/research/threads`,
      );
      if (response.ok) {
        const data = await response.json();
        return data.threads || [];
      }
    } catch {
      // Fallback
    }
    return [];
  }

  async getThread(threadId: string): Promise<ResearchThread | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/backend-api/cognitive/research/thread/${threadId}`,
      );
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Fallback
    }
    return null;
  }

  async logExperiment(experiment: ResearchExperiment): Promise<void> {
    await fetch(
      `${this.baseUrl}/backend-api/cognitive/research/experiment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(experiment),
      },
    );
  }

  async addFinding(finding: ResearchFinding): Promise<void> {
    await fetch(
      `${this.baseUrl}/backend-api/cognitive/research/finding`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finding),
      },
    );
  }

  async updateThreadStatus(
    threadId: string,
    status: ResearchThread["status"],
  ): Promise<void> {
    await fetch(
      `${this.baseUrl}/backend-api/cognitive/research/thread/${threadId}/status`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
  }
}
