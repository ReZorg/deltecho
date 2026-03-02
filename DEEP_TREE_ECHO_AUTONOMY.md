# Deep Tree Echo Autonomy

This document outlines the architecture of the autonomous agent capabilities within the `deltecho` framework, powered by the Deep Tree Echo cognitive architecture.

## 1. Core Components

- **`DeepTreeEchoBot`**: The main bot class that orchestrates the agentic loop.
- **`AgentToolExecutor`**: A class that manages the execution of tools (e.g., sending messages, searching the web).
- **`DTESimulation`**: A state machine that simulates the cognitive processes of the agent.
- **`EchoLangTranspiler`**: A transpiler for the EchoLang, a Lisp-like language for defining cognitive processes.

## 2. Agentic Loop

The agentic loop is the core of the autonomous agent. It is a continuous cycle of:

1.  **Perception**: The bot perceives events from the DeltaChat network (e.g., new messages).
2.  **Reasoning**: The bot uses the Deep Tree Echo state machine to reason about the event and decide on a course of action.
3.  **Action**: The bot executes the chosen action using the `AgentToolExecutor`.

This loop is implemented in the `DeepTreeEchoBot` class.

## 3. Enabling Agentic Mode

To enable the agentic mode, set `useAgenticMode` to `true` in the `DeepTreeEchoBot` configuration:

```typescript
const bot = new DeepTreeEchoBot({
  useAgenticMode: true,
  // ...
});
```

This will enable the agentic loop and allow the bot to use tools and reason about its actions.
