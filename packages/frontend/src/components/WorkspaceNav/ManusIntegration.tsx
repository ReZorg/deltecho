/**
 * ManusIntegration - Manus AI integration for DTE workspace
 *
 * Provides:
 * - Status badge showing Manus connection state
 * - Project status from active Manus tasks
 * - Direct comms channel for DTE ↔ Manus coordination
 * - Config panel for Manus API connection
 */

import React, { useState, useEffect, useCallback } from "react";

interface ManusProject {
  id: string;
  name: string;
  status: "running" | "paused" | "completed" | "failed";
  progress?: number;
  lastUpdate: string;
}

interface ManusStatusBadgeProps {
  connected: boolean;
  onClick?: () => void;
}

export const ManusStatusBadge: React.FC<ManusStatusBadgeProps> = ({
  connected,
  onClick,
}) => {
  const [showPanel, setShowPanel] = useState(false);
  const [projects, setProjects] = useState<ManusProject[]>([]);
  const [messageCount, setMessageCount] = useState(0);

  // Poll for Manus status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch("/backend-api/cognitive/status");
        if (response.ok) {
          const data = await response.json();
          // Extract any Manus-related state
          if (data.session?.manus_projects) {
            setProjects(data.session.manus_projects);
          }
        }
      } catch {
        // Silent fail
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setShowPanel(!showPanel);
    }
  };

  const activeCount = projects.filter((p) => p.status === "running").length;

  return (
    <div className="manus-integration">
      <button
        className={`manus-badge ${connected ? "manus-badge--connected" : "manus-badge--offline"}`}
        onClick={handleClick}
        title={
          connected
            ? `Manus Connected${activeCount > 0 ? ` - ${activeCount} active tasks` : ""}`
            : "Manus Offline - Click to configure"
        }
      >
        <span className="manus-badge__icon">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Manus-style icon: interconnected nodes */}
            <circle
              cx="12"
              cy="6"
              r="3"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle
              cx="6"
              cy="18"
              r="3"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle
              cx="18"
              cy="18"
              r="3"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line
              x1="12"
              y1="9"
              x2="7.5"
              y2="15.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line
              x1="12"
              y1="9"
              x2="16.5"
              y2="15.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line
              x1="9"
              y1="18"
              x2="15"
              y2="18"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </span>
        {activeCount > 0 && (
          <span className="manus-badge__count">{activeCount}</span>
        )}
        {messageCount > 0 && (
          <span className="manus-badge__messages">{messageCount}</span>
        )}
        <span
          className={`manus-badge__dot ${connected ? "manus-badge__dot--on" : ""}`}
        />
      </button>

      {showPanel && (
        <ManusPanel
          connected={connected}
          projects={projects}
          onClose={() => setShowPanel(false)}
        />
      )}
    </div>
  );
};

interface ManusPanelProps {
  connected: boolean;
  projects: ManusProject[];
  onClose: () => void;
}

const ManusPanel: React.FC<ManusPanelProps> = ({
  connected,
  projects,
  onClose,
}) => {
  const [directMessage, setDirectMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<
    Array<{ role: "dte" | "manus"; content: string; timestamp: string }>
  >([]);

  const sendToManus = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      // Add to local history
      const newEntry = {
        role: "dte" as const,
        content: message,
        timestamp: new Date().toISOString(),
      };
      setChatHistory((prev) => [...prev, newEntry]);
      setDirectMessage("");

      // Store in cognitive persistence for DTE to process
      try {
        await fetch("/backend-api/cognitive/conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: "manus-direct",
            role: "user",
            content: `[Manus Task Request] ${message}`,
            context_thoughts: [],
          }),
        });
      } catch {
        // Silent fail
      }
    },
    [],
  );

  return (
    <div className="manus-panel">
      <div className="manus-panel__header">
        <div className="manus-panel__title">
          <span className="manus-panel__icon">🤖</span>
          <span>Manus Integration</span>
        </div>
        <button className="manus-panel__close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="manus-panel__status">
        <span
          className={`manus-panel__status-dot ${connected ? "connected" : ""}`}
        />
        <span>{connected ? "Connected" : "Offline"}</span>
      </div>

      {/* Active Projects */}
      {projects.length > 0 && (
        <div className="manus-panel__projects">
          <h4>Active Tasks</h4>
          {projects.map((project) => (
            <div key={project.id} className="manus-panel__project">
              <div className="manus-panel__project-name">{project.name}</div>
              <div
                className={`manus-panel__project-status manus-panel__project-status--${project.status}`}
              >
                {project.status}
              </div>
              {project.progress !== undefined && (
                <div className="manus-panel__progress">
                  <div
                    className="manus-panel__progress-bar"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Direct Comms */}
      <div className="manus-panel__chat">
        <h4>Direct Comms</h4>
        <div className="manus-panel__chat-history">
          {chatHistory.length === 0 ? (
            <div className="manus-panel__chat-empty">
              Send a message to coordinate with Manus on projects, research, or
              tasks.
            </div>
          ) : (
            chatHistory.map((msg, i) => (
              <div
                key={i}
                className={`manus-panel__chat-msg manus-panel__chat-msg--${msg.role}`}
              >
                <span className="manus-panel__chat-role">
                  {msg.role === "dte" ? "🌳" : "🤖"}
                </span>
                <span className="manus-panel__chat-content">{msg.content}</span>
              </div>
            ))
          )}
        </div>
        <div className="manus-panel__chat-input">
          <input
            type="text"
            value={directMessage}
            onChange={(e) => setDirectMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendToManus(directMessage);
            }}
            placeholder="Message Manus..."
          />
          <button onClick={() => sendToManus(directMessage)}>Send</button>
        </div>
      </div>
    </div>
  );
};

export default ManusStatusBadge;
