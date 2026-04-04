# Vue 3 to React 18 Migration - Ralph Loop Prompt

## Goal
Port codexUI from Vue 3 to React 18 with TypeScript, maintaining all functionality.

## Current State
- Vue 3 + Composition API + TypeScript
- ~18,000 LOC total
- 42 Vue components (23 core, 19 icons)
- Single useDesktopState.ts composable (~3800 LOC)
- HTTP + WebSocket/SSE for real-time notifications
- Tailwind CSS styling

## Migration Plan

### Phase 1: Setup & Planning
- Create React project structure with Vite + React + TypeScript + Tailwind
- Set up Zustand for state management
- Configure React Router v6
- Port API layer to React hooks

### Phase 2: State Migration
Convert useDesktopState.ts to Zustand store with slices:
- threadSlice: thread management, loading, selection
- messageSlice: message loading, live updates
- uiSlice: sidebar state, modals, settings
- syncSlice: polling, notifications, server requests

### Phase 3: Component Migration (in order)
1. Icon components (19 simple SVG components)
2. DesktopLayout.tsx (sidebar + content layout)
3. SidebarThreadTree.tsx (thread list with grouping)
4. SidebarThreadControls.tsx
5. ThreadComposer.tsx (input, model selection, reasoning)
6. ThreadConversation.tsx (message list, scroll management)
7. SkillsHub.tsx and related modals
8. AccountMenu.tsx

### Phase 4: Testing At Each Step
- TypeScript compilation check
- Browser testing: thread list loads, messages display
- WebSocket real-time updates verification
- Responsive layout testing
- Full integration test with codex-cli bridge

## Requirements
- Keep all existing functionality
- Preserve Tailwind styling classes
- Maintain WebSocket + SSE fallback
- Keep localStorage keys and persistence
- Ensure all 60+ state exports are accessible

## Completion Criteria
Output <promise>VUE_TO_REACT_PORT_COMPLETE</promise> when:
- All 23 Vue components are React components
- State management works with Zustand
- Real-time notifications work
- Full thread/message lifecycle works
- No TypeScript errors
- App runs and connects to codex app-server
