# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the PCGamingWiki Game Tweaker client.

## Project Overview

This is the **PCGamingWiki Game Tweaker** desktop client - an Electron application that provides a GUI for automating game configuration tweaks. It communicates with a Mastra-based AI agent server via WebSocket to process tweak requests, with local tool execution and user approval workflows.

## Tech Stack

- **Electron** - Desktop application framework
- **SvelteKit** - Frontend framework with Svelte 5
- **TypeScript** - Type safety across all processes
- **Tailwind CSS** - Utility-first CSS framework
- **Vite** - Build tool and dev server

## Development Commands

```bash
npm run dev          # Run development servers (TypeScript checking, Electron, SvelteKit)
npm run build        # Build both frontend and Electron app
npm run build:win    # Build for Windows (NSIS + portable)
npm run lint         # Lint entire codebase
npm run typecheck    # Type check all code (main process, preload, AND renderer)
npm run check        # Run all checks (lint + format:check + typecheck)
```

**Note:** To check for TypeScript errors, use `npm run typecheck`. This runs three separate checks:
- `typecheck:node` - Main process and preload scripts (tsconfig.node.json)
- `typecheck:web` - Web/shared types (tsconfig.web.json)
- `typecheck:renderer` - Renderer/SvelteKit (svelte-check)

## Architecture

### Process Separation

```
┌─────────────────────────────────────────────────────────────┐
│                   Renderer (SvelteKit)                       │
│  Components → Hooks → Stores → window.api (Preload)         │
└─────────────────────────────────┬───────────────────────────┘
                                  │ IPC (ipcRenderer.invoke/send)
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Preload (contextBridge)                   │
│  Secure API Bridge - exposes main process functions          │
└─────────────────────────────────┬───────────────────────────┘
                                  │ ipcMain.handle/on
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Main Process (Node.js)                      │
│  IPC Handlers → Services → Agent/Tools/Utils                │
└─────────────────────────────────┬───────────────────────────┘
                                  │ WebSocket/HTTP
                                  ▼
                         Remote Server/Agent
```

### Directory Structure

```
src/
├── main/              # Electron main process
│   ├── services/      # Business logic layer
│   ├── tools/         # Tool implementations (file I/O, game launchers, graphics mods)
│   ├── interfaces/    # Type definitions
│   ├── schemas/       # Zod validation schemas
│   └── index.ts       # Main entry point
├── preload/           # IPC bridge (secure API exposure)
│   └── index.ts       # contextBridge API definitions
└── renderer/          # SvelteKit frontend
    └── src/
        ├── lib/
        │   ├── components/  # Svelte UI components
        │   ├── hooks/       # Custom Svelte hooks
        │   ├── stores/      # Reactive state management
        │   └── utils/       # Helper functions
        └── routes/          # SvelteKit page routes
```

## Main Process Services (`src/main/services/`)

### Core Services

| Service | Purpose |
|---------|---------|
| **AgentService** | WebSocket communication with remote server. Handles agent status, tweak processing, and message routing. |
| **ToolExecutorService** | Executes tools locally. Delegates to tool registry, handles approval flow. |
| **ToolStatusService** | Tracks tool approval/execution status. Manages approval polling and auto-approval of read-only tools. |
| **GameLibraryService** | Aggregates games from launcher services (Steam, Epic, GOG). Singleton with poster update notifications. |
| **SettingsService** | Persistent settings management with listeners for reactive updates. |
| **AppliedTweaksService** | Persists applied tweaks for the revert system. Manages JSON data in app data directory. |
| **RevertService** | Executes revert operations on completed tweaks. Orchestrates rollback and cleanup. |
| **RecipeService** | Handles recipe lookup and replay execution. Compares semver versions and resolves tool arguments. |
| **PCGamingWikiService** | Fetches game data from PCGamingWiki via server proxy. Expands local paths in config files. |
| **TweakMetadataService** | Batch fetches tweak metadata (processability status and recipes) from server API. |
| **SystemSpecsService** | Collects system information (CPU, GPU, memory, OS, display). |
| **UpdaterService** | Auto-update functionality using electron-updater. |
| **AgentAvailabilityService** | Polls server health endpoint (30s intervals). Tracks agent availability. |

### IPC Handlers (`src/main/services/ipc-handlers/`)

| Handler | Key Channels |
|---------|-------------|
| **agent-ipc.handler.ts** | `agent:process-tweak`, `agent:approve-tool`, `agent:decline-tool`, `agent:abort-task` |
| **game-ipc.handler.ts** | `library:get-games`, `library:launch-game`, `library:link-pcgw-page` |
| **tweak-ipc.handler.ts** | `pcgw:get-tweaks`, `applied-tweaks:*`, `revert:execute`, `tweak-metadata:fetch` |
| **settings-ipc.handler.ts** | `get-settings`, `update-settings`, `settings:pick-reshade-installer` |
| **system-ipc.handler.ts** | `system-specs:get-specs`, `file:read-text`, `file:write-text` |

## Routes (`src/renderer/src/routes/`)

| Route | Purpose |
|-------|---------|
| **/** | Game library landing page. Displays all detected games with search/filter. |
| **/game/[id]** | Game detail page. Shows available tweaks, configs, applied tweaks. Hero header with backdrop. |
| **/applied-tweaks** | History of applied tweaks across all games with revert buttons. |
| **/my-specs** | System specifications display (CPU, GPU, RAM, OS, display). |
| **/settings** | App settings: auto-update, ReShade installer, downloads folder, text editor preference. |

## Key Components (`src/renderer/src/lib/components/`)

### Domain Components

| Component | Purpose |
|-----------|---------|
| **game-card/** | Game card with poster, launcher badge, and info for the games grid. |
| **game-hero-header/** | Full-width hero section with poster backdrop on game detail page. |
| **game-sidebar/** | Game details panel with info card and external resources (PCGW, Steam, etc.). |
| **tweak-card/** | Individual tweak display within game detail page. |
| **tweak-action-button/** | Apply/Revert buttons with status badges (recipe available, applied, etc.). |
| **apply-tweak-dialog/** | Real-time tweak execution dialog. Shows tool operations, approval interface, markdown messages. |
| **applied-tweak-card/** | Card showing applied tweak with game info and revert button. |
| **user-input-dialog/** | Modal for requesting user input during tweak execution. |
| **text-editor-dialog/** | Built-in text editor for file editing operations. |

## Stores (`src/renderer/src/lib/stores/`)

| Store | Purpose |
|-------|---------|
| **tweak-dialog.store.svelte.ts** | Manages apply-tweak-dialog state. Tracks running tweak, tool statuses, polling for approvals. |
| **agent-availability.store.svelte.ts** | Reactive wrapper around agent availability status. |
| **updater.store.svelte.ts** | Reactive wrapper around updater status. |
| **last-visited-game.store.svelte.ts** | Persists last visited game ID for navigation. |

### Root Stores (`src/renderer/src/store.ts`)

- `settings` - Application settings
- `agentStatus` - Agent execution state
- `streamChunks` - Agent response stream data
- `isAgentBusy` - Derived computed state
- `userInputRequest` - User input request from agent

## Custom Hooks (`src/renderer/src/lib/hooks/`)

| Hook | Purpose |
|------|---------|
| **useGameData** | Loads game details, tweaks, and applied tweaks with reactive updates. |
| **useAppliedTweaks** | Fetches and tracks applied tweaks for a specific game. |
| **useAgentStatus** | Subscribes to agent status updates with callback handlers. |
| **useToolPolling** | Polls tool status at intervals. Detects pending tool approvals. |
| **useStreamDialog** | Orchestrates apply-tweak-dialog state and interactions. |

## Svelte 5 Patterns

### Runes Usage

The codebase uses Svelte 5 runes for reactive state management:

```typescript
// $state - reactive state
let count = $state(0);

// $derived - computed values
let doubled = $derived(count * 2);

// $effect - side effects
$effect(() => {
  console.log('Count changed:', count);
});
```

### Store Pattern with .svelte.ts Files

Stores use the `.svelte.ts` extension to enable runes in module context:

```typescript
// tweak-dialog.store.svelte.ts
class TweakDialogStore {
  isOpen = $state(false);
  toolStatuses = $state<ToolStatus[]>([]);

  get hasPendingApprovals() {
    return $derived(this.toolStatuses.some(t => t.status === 'pending'));
  }
}
```

## IPC Bridge API (`src/preload/index.ts`)

The preload script exposes a typed API via `window.api`:

```typescript
window.api.agent.processTweak(request)     // Start tweak execution
window.api.agent.approveTool(callId)       // Approve pending tool
window.api.agent.declineTool(callId)       // Decline pending tool
window.api.library.getGames()              // Get detected games
window.api.library.launchGame(id)          // Launch game
window.api.pcgw.getTweaks(pageId)          // Fetch tweaks from PCGW
window.api.appliedTweaks.getAll()          // Get applied tweaks
window.api.revert.execute(id)              // Revert an applied tweak
window.api.settings.get()                  // Get app settings
window.api.settings.update(settings)       // Update settings
window.api.systemSpecs.getSpecs()          // Get system hardware info
```

## Tool Approval Workflow

1. User clicks "Apply" on a tweak via `tweak-action-button`
2. `apply-tweak-dialog` opens and calls `agent.processTweak()`
3. Server sends tool calls via WebSocket
4. `ToolStatusService` registers tools for approval
5. `useToolPolling` hook polls `agent:get-tool-statuses` every 1s
6. Dialog displays tool details for user approval/decline
7. Approved tools execute locally via `ToolExecutorService`
8. Results sent back to server, agent continues until completion
9. `AppliedTweaksService` stores record for potential revert

### Recipe Fast Path

For tweaks with pre-approved recipes:
1. `TweakMetadataService` fetches recipe data
2. If recipe exists and version matches, skip agent approval loop
3. `RecipeService` replays tool calls directly
4. Faster execution without per-tool approval

## Key Interfaces

```typescript
// Game library entry
interface Game {
  id: string;
  name: string;
  launcher: 'steam' | 'epic' | 'gog';
  installPath: string;
  posterPath?: string;
  pcgwPageId?: string;
}

// Agent execution state
interface AgentStatus {
  running: boolean;
  threadId?: string;
  response?: string;
  error?: string;
}

// Tool execution status
interface ToolStatus {
  callId: string;
  toolName: string;
  status: 'pending' | 'approved' | 'declined' | 'executing' | 'completed' | 'error';
  args: Record<string, unknown>;
}

// Applied tweak record
interface AppliedTweak {
  id: string;
  gameId: string;
  tweakId: string;
  appliedAt: string;
  summary: TweakSummary;
}
```

## Development Notes

### Adding New IPC Channels

1. Define handler in `src/main/services/ipc-handlers/`
2. Expose via preload in `src/preload/index.ts`
3. Add TypeScript types to shared interfaces

### Adding New Routes

1. Create route folder in `src/renderer/src/routes/`
2. Add navigation link in `app-sidebar.svelte`
3. Follow existing patterns for data loading via hooks

### Adding New Services

1. Create service file in `src/main/services/`
2. Use singleton pattern if appropriate
3. Register IPC handlers for renderer communication

### Working with Tweaks

- Tweaks come from PCGamingWiki via `PCGamingWikiService`
- Tool execution happens locally in main process
- Results are persisted via `AppliedTweaksService`
- Revert operations use backed-up original files
