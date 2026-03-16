/**
 * WorkspaceNav - Left-hand workspace navigation panel
 *
 * Three sections:
 * 1. Chatting (Messages) - Regular DeltaChat conversations
 * 2. Working (Projects) - Active project sessions with Manus integration
 * 3. Learning (Research) - Autoresearch-style autonomous research threads
 *
 * Plus a Manus integration icon for direct comms and project status.
 */

import React, { useState, useEffect, useCallback } from "react";
import ChatList from "../chat/ChatList";
import { ManusStatusBadge } from "./ManusIntegration";
import {
  ResearchThreadList,
  ResearchThreadDetail,
  NewResearchThreadDialog,
  ResearchPersistenceClient,
} from "./Research/ResearchEngine";
import type { ResearchThread } from "./Research/ResearchEngine";

export type WorkspaceSection = "chatting" | "working" | "learning";

interface WorkspaceSectionConfig {
  id: WorkspaceSection;
  label: string;
  icon: string;
  description: string;
}

const SECTIONS: WorkspaceSectionConfig[] = [
  {
    id: "chatting",
    label: "Chatting",
    icon: "💬",
    description: "Messages",
  },
  {
    id: "working",
    label: "Working",
    icon: "🔧",
    description: "Projects",
  },
  {
    id: "learning",
    label: "Learning",
    icon: "🔬",
    description: "Research",
  },
];

interface ProjectItem {
  id: string;
  name: string;
  status: "active" | "paused" | "completed";
  lastActivity: string;
  manusTaskId?: string;
  description?: string;
}

export interface WorkspaceNavProps {
  selectedChatId: number | null;
  showArchivedChats: boolean;
  queryStr?: string;
  queryChatId: number | null;
  onExitSearch?: () => void;
  onChatClick: (chatId: number) => void;
  onProjectClick?: (projectId: string) => void;
  onResearchClick?: (threadId: string) => void;
}

const researchClient = new ResearchPersistenceClient();

export default function WorkspaceNav({
  selectedChatId,
  showArchivedChats,
  queryStr,
  queryChatId,
  onExitSearch,
  onChatClick,
  onProjectClick,
  onResearchClick,
}: WorkspaceNavProps) {
  const [activeSection, setActiveSection] =
    useState<WorkspaceSection>("chatting");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [researchThreads, setResearchThreads] = useState<ResearchThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showNewThread, setShowNewThread] = useState(false);
  const [manusConnected, setManusConnected] = useState(false);
  const [knowledgeStats, setKnowledgeStats] = useState({
    thoughts: 0,
    narratives: 0,
    conversations: 0,
  });

  // Load data on mount
  useEffect(() => {
    loadProjects();
    loadResearchThreads();
    checkManusConnection();
    loadKnowledgeStats();
  }, []);

  // Refresh research threads when Learning tab is active
  useEffect(() => {
    if (activeSection === "learning") {
      loadResearchThreads();
      const interval = setInterval(loadResearchThreads, 15000);
      return () => clearInterval(interval);
    }
  }, [activeSection]);

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch("/backend-api/cognitive/recall/state");
      if (response.ok) {
        const data = await response.json();
        const convs = data.conversations || [];
        const projectConvs = convs.filter(
          (c: { role: string; content: string }) =>
            c.role === "user" &&
            (c.content.includes("project") ||
              c.content.includes("build") ||
              c.content.includes("fix") ||
              c.content.includes("deploy")),
        );
        setProjects(
          projectConvs.slice(-5).map(
            (
              c: { content: string; timestamp: string; chat_id: string },
              i: number,
            ) => ({
              id: `proj-${i}`,
              name:
                c.content.substring(0, 40) +
                (c.content.length > 40 ? "..." : ""),
              status: "active" as const,
              lastActivity: c.timestamp || new Date().toISOString(),
              description: c.content,
            }),
          ),
        );
      }
    } catch {
      setProjects([
        {
          id: "deltecho-evolution",
          name: "DeltEcho Evolution",
          status: "active",
          lastActivity: new Date().toISOString(),
          description: "Multi-modal autonomous agent workspace",
        },
        {
          id: "live2d-avatar",
          name: "Live2D Avatar Integration",
          status: "active",
          lastActivity: new Date().toISOString(),
          description: "Neuro-Sama level avatar engagement",
        },
      ]);
    }
  }, []);

  const loadResearchThreads = useCallback(async () => {
    try {
      const threads = await researchClient.getThreads();
      if (threads.length > 0) {
        setResearchThreads(threads);
        return;
      }
    } catch {
      // Fallback
    }

    // Fallback: derive from thoughts
    try {
      const response = await fetch(
        "/backend-api/cognitive/recall/thoughts?limit=50",
      );
      if (response.ok) {
        const data = await response.json();
        const thoughts = data.thoughts || [];
        const topics = new Map<string, number>();
        thoughts.forEach(
          (t: { thought_type: string; content: string }) => {
            const key = t.thought_type || "general";
            topics.set(key, (topics.get(key) || 0) + 1);
          },
        );
        setResearchThreads(
          Array.from(topics.entries())
            .slice(0, 5)
            .map(([topic, count]) => ({
              id: `research-${topic}`,
              topic:
                topic.charAt(0).toUpperCase() +
                topic.slice(1).replace(/_/g, " "),
              program: "",
              status: "exploring" as const,
              hypothesis: "",
              experiments: [],
              findings: [],
              sources: count,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              metric: "relevance",
              best_score: 0,
            })),
        );
      }
    } catch {
      setResearchThreads([
        {
          id: "cognitive-architecture",
          topic: "Cognitive Architecture",
          program: "",
          status: "exploring",
          hypothesis:
            "Deep Tree Echo can achieve emergent cognition through reservoir computing + attention",
          experiments: [],
          findings: [],
          sources: 12,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metric: "coherence",
          best_score: 0,
        },
        {
          id: "reservoir-computing",
          topic: "Reservoir Computing",
          program: "",
          status: "synthesizing",
          hypothesis:
            "Echo State Networks with chaotic dynamics produce richer representations",
          experiments: [],
          findings: [],
          sources: 8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metric: "accuracy",
          best_score: 0.82,
        },
      ]);
    }
  }, []);

  const loadKnowledgeStats = useCallback(async () => {
    try {
      const response = await fetch("/backend-api/cognitive/status");
      if (response.ok) {
        const data = await response.json();
        setKnowledgeStats({
          thoughts: data.thoughtCount || 0,
          narratives: 0,
          conversations: 0,
        });
      }
    } catch {
      // Silent
    }
  }, []);

  const checkManusConnection = useCallback(async () => {
    try {
      const response = await fetch("/backend-api/cognitive/status");
      setManusConnected(response.ok);
    } catch {
      setManusConnected(false);
    }
  }, []);

  const handleCreateThread = useCallback(
    async (topic: string, hypothesis: string, program: string) => {
      try {
        const thread = await researchClient.createThread(
          topic,
          hypothesis,
          program,
        );
        setResearchThreads((prev) => [thread, ...prev]);
        setActiveThreadId(thread.id);
        setShowNewThread(false);
      } catch {
        // Fallback: create locally
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
        setResearchThreads((prev) => [thread, ...prev]);
        setActiveThreadId(thread.id);
        setShowNewThread(false);
      }
    },
    [],
  );

  const handleRunExperiment = useCallback(async (threadId: string) => {
    // Store experiment request in cognitive persistence
    try {
      await fetch("/backend-api/cognitive/thought", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `[Research Experiment] Running experiment for thread ${threadId}`,
          thought_type: "research_experiment",
          cognitive_phase: "EXPLORING",
          valence: 0.7,
          arousal: 0.6,
          salience: 0.8,
          associations: [threadId],
        }),
      });
    } catch {
      // Silent
    }
  }, []);

  const handleSynthesize = useCallback(async (threadId: string) => {
    try {
      await researchClient.updateThreadStatus(threadId, "synthesizing");
      setResearchThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, status: "synthesizing" as const } : t,
        ),
      );
    } catch {
      // Silent
    }
  }, []);

  const handlePause = useCallback(async (threadId: string) => {
    try {
      await researchClient.updateThreadStatus(threadId, "paused");
      setResearchThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, status: "paused" as const } : t,
        ),
      );
    } catch {
      // Silent
    }
  }, []);

  const handleArchive = useCallback(async (threadId: string) => {
    try {
      await researchClient.updateThreadStatus(threadId, "archived");
      setResearchThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, status: "archived" as const } : t,
        ),
      );
    } catch {
      // Silent
    }
  }, []);

  const handleCreateTutorial = useCallback(async (threadId: string) => {
    // Store tutorial creation request
    try {
      await fetch("/backend-api/cognitive/thought", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `[Tutorial Creation] Generating tutorial from research thread ${threadId}`,
          thought_type: "tutorial_creation",
          cognitive_phase: "SYNTHESIZING",
          valence: 0.8,
          arousal: 0.5,
          salience: 0.9,
          associations: [threadId],
        }),
      });
    } catch {
      // Silent
    }
  }, []);

  const activeThread = researchThreads.find((t) => t.id === activeThreadId);

  return (
    <div className="workspace-nav">
      {/* Header with Manus integration */}
      <div className="workspace-nav__header">
        <div className="workspace-nav__title">
          <span className="workspace-nav__logo">🌳</span>
          <span className="workspace-nav__name">Deep Tree Echo</span>
        </div>
        <ManusStatusBadge connected={manusConnected} />
      </div>

      {/* Section tabs */}
      <div className="workspace-nav__tabs">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            className={`workspace-nav__tab ${
              activeSection === section.id ? "workspace-nav__tab--active" : ""
            }`}
            onClick={() => setActiveSection(section.id)}
            title={section.description}
          >
            <span className="workspace-nav__tab-icon">{section.icon}</span>
            <span className="workspace-nav__tab-label">{section.label}</span>
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="workspace-nav__content">
        {/* ─── Chatting Tab ──────────────────────────────────────── */}
        {activeSection === "chatting" && (
          <ChatList
            queryStr={queryStr || ""}
            showArchivedChats={showArchivedChats}
            onChatClick={onChatClick}
            selectedChatId={selectedChatId}
            queryChatId={queryChatId}
            onExitSearch={onExitSearch}
          />
        )}

        {/* ─── Working Tab ───────────────────────────────────────── */}
        {activeSection === "working" && (
          <div className="workspace-nav__projects">
            <div className="workspace-nav__section-header">
              <span>Active Projects</span>
              <button
                className="workspace-nav__add-btn"
                title="New Project"
                onClick={() => {
                  /* TODO: Create project dialog */
                }}
              >
                +
              </button>
            </div>
            {projects.length === 0 ? (
              <div className="workspace-nav__empty">
                <span className="workspace-nav__empty-icon">🔧</span>
                <p>No active projects yet.</p>
                <p className="workspace-nav__empty-hint">
                  Start a conversation about a project to see it here.
                </p>
              </div>
            ) : (
              <div className="workspace-nav__project-list">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    className={`workspace-nav__project-item workspace-nav__project-item--${project.status}`}
                    onClick={() => onProjectClick?.(project.id)}
                  >
                    <div className="workspace-nav__project-status">
                      {project.status === "active"
                        ? "🟢"
                        : project.status === "paused"
                          ? "🟡"
                          : "✅"}
                    </div>
                    <div className="workspace-nav__project-info">
                      <div className="workspace-nav__project-name">
                        {project.name}
                      </div>
                      {project.description && (
                        <div className="workspace-nav__project-desc">
                          {project.description.substring(0, 60)}
                        </div>
                      )}
                    </div>
                    {project.manusTaskId && (
                      <div
                        className="workspace-nav__manus-badge"
                        title="Linked to Manus task"
                      >
                        M
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Manus Direct Comms */}
            <div className="workspace-nav__manus-section">
              <div className="workspace-nav__section-header">
                <span>Manus</span>
                <span
                  className={`workspace-nav__manus-dot ${manusConnected ? "connected" : ""}`}
                />
              </div>
              <button
                className="workspace-nav__manus-chat-btn"
                onClick={() => {
                  /* TODO: Open Manus direct comms */
                }}
              >
                <span className="workspace-nav__manus-icon">🤖</span>
                <div className="workspace-nav__manus-chat-info">
                  <div className="workspace-nav__manus-chat-title">
                    Direct Comms
                  </div>
                  <div className="workspace-nav__manus-chat-subtitle">
                    {manusConnected
                      ? "Connected - Ready for tasks"
                      : "Offline - Configure API"}
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ─── Learning Tab (Autoresearch Integration) ───────────── */}
        {activeSection === "learning" && (
          <div className="workspace-nav__research">
            {activeThread ? (
              <div className="workspace-nav__research-detail">
                <button
                  className="workspace-nav__back-btn"
                  onClick={() => setActiveThreadId(null)}
                >
                  ← Back to threads
                </button>
                <ResearchThreadDetail
                  thread={activeThread}
                  onRunExperiment={handleRunExperiment}
                  onSynthesize={handleSynthesize}
                  onCreateTutorial={handleCreateTutorial}
                  onPause={handlePause}
                  onArchive={handleArchive}
                />
              </div>
            ) : (
              <>
                <ResearchThreadList
                  threads={researchThreads}
                  activeThreadId={activeThreadId}
                  onSelectThread={(id) => {
                    setActiveThreadId(id);
                    onResearchClick?.(id);
                  }}
                  onCreateThread={() => setShowNewThread(true)}
                />

                {/* Knowledge Base Status */}
                <div className="workspace-nav__knowledge-status">
                  <div className="workspace-nav__section-header">
                    <span>Knowledge Base</span>
                  </div>
                  <div className="workspace-nav__knowledge-stats">
                    <div className="workspace-nav__stat">
                      <span className="workspace-nav__stat-icon">🧠</span>
                      <span className="workspace-nav__stat-label">
                        Thoughts
                      </span>
                      <span className="workspace-nav__stat-value">
                        {knowledgeStats.thoughts || "--"}
                      </span>
                    </div>
                    <div className="workspace-nav__stat">
                      <span className="workspace-nav__stat-icon">📖</span>
                      <span className="workspace-nav__stat-label">
                        Narratives
                      </span>
                      <span className="workspace-nav__stat-value">
                        {knowledgeStats.narratives || "--"}
                      </span>
                    </div>
                    <div className="workspace-nav__stat">
                      <span className="workspace-nav__stat-icon">🔬</span>
                      <span className="workspace-nav__stat-label">
                        Threads
                      </span>
                      <span className="workspace-nav__stat-value">
                        {researchThreads.length || "--"}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* New Research Thread Dialog */}
      {showNewThread && (
        <NewResearchThreadDialog
          onSubmit={handleCreateThread}
          onCancel={() => setShowNewThread(false)}
        />
      )}
    </div>
  );
}
