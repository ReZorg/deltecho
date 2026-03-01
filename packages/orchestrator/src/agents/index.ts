/**
 * @fileoverview Agents Module
 *
 * Exports the Agent Coordinator and related types for
 * implementing the nested agency pattern, plus autonomous session management.
 */

export {
  AgentCoordinator,
  Agent,
  AgentCapability,
  AgentTemplate,
  Task,
  TaskResult,
  CoordinatorConfig,
} from "./AgentCoordinator.js";

export { default } from "./AgentCoordinator.js";

// Autonomous session management
export {
  AutonomousSession,
  SessionPersistence,
  SessionContext,
  PersistedSessionData,
} from "./AutonomousSession.js";
export { FileSessionPersistence } from "./FileSessionPersistence.js";
export { SessionManager, SessionManagerConfig } from "./SessionManager.js";
