#!/bin/bash
# Switch between TypeScript and Rust backend servers and start both frontend and backend

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TMUX_SESSION="codex-ui"

show_usage() {
    echo "Usage: $0 [ts|rust|status]"
    echo ""
    echo "Commands:"
    echo "  ts      - Switch to TypeScript/Express server and start both frontend and backend"
    echo "  rust    - Switch to Rust server and start both frontend and backend"
    echo "  status  - Show current server configuration"
    echo ""
    echo "Examples:"
    echo "  $0 ts     # Use TypeScript server and start everything"
    echo "  $0 rust   # Use Rust server and start everything"
}

get_current_port() {
    if [ -f "$ENV_FILE" ]; then
        grep "^BRIDGE_PORT=" "$ENV_FILE" | cut -d'=' -f2 || echo "3457"
    else
        echo "3457"
    fi
}

switch_to_ts() {
    echo "Switching to TypeScript server (port 3457)..."
    if [ -f "$ENV_FILE" ]; then
        if grep -q "^BRIDGE_PORT=" "$ENV_FILE"; then
            sed -i 's/^BRIDGE_PORT=.*/BRIDGE_PORT=3457/' "$ENV_FILE"
        else
            echo "BRIDGE_PORT=3457" >> "$ENV_FILE"
        fi
    else
        echo "BRIDGE_PORT=3457" > "$ENV_FILE"
    fi
    echo "✓ Now using TypeScript server on port 3457"
}

switch_to_rust() {
    echo "Switching to Rust server (port 3458)..."
    if [ -f "$ENV_FILE" ]; then
        if grep -q "^BRIDGE_PORT=" "$ENV_FILE"; then
            sed -i 's/^BRIDGE_PORT=.*/BRIDGE_PORT=3458/' "$ENV_FILE"
        else
            echo "BRIDGE_PORT=3458" >> "$ENV_FILE"
        fi
    else
        echo "BRIDGE_PORT=3458" > "$ENV_FILE"
    fi
    echo "✓ Now using Rust server on port 3458"
}

show_status() {
    CURRENT_PORT=$(get_current_port)
    echo "Current server configuration:"
    echo ""
    if [ "$CURRENT_PORT" = "3458" ]; then
        echo "  Backend: Rust server"
        echo "  Port: $CURRENT_PORT"
        echo "  Status: New implementation"
    else
        echo "  Backend: TypeScript/Express server"
        echo "  Port: ${CURRENT_PORT:-3457}"
        echo "  Status: Legacy (default)"
    fi
    echo ""
    echo "Switch servers:"
    echo "  $0 ts    - Use TypeScript server"
    echo "  $0 rust  - Use Rust server"
}

cleanup_tmux() {
    if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
    fi
}

start_typescript_stack() {
    echo ""
    echo "🚀 Starting TypeScript stack with tmux..."
    echo "   ┌─ Top: Proxy (3456) + Backend (3457)"
    echo "   └─ Bottom: Frontend Vite (5173)"
    echo ""

    cleanup_tmux

    # Kill any existing processes on ports
    echo "🔄 Cleaning up ports 3456 and 3457..."
    lsof -ti:3456 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:3457 2>/dev/null | xargs kill -9 2>/dev/null || true
    sleep 1

    # Create new tmux session (detached) with bash that stays open
    tmux new-session -d -s "$TMUX_SESSION" -c "$SCRIPT_DIR" bash

    # Configure to keep windows open on exit
    tmux set-option -t "$TMUX_SESSION" remain-on-exit on

    # Split window horizontally
    tmux split-window -v -t "$TMUX_SESSION" -c "$SCRIPT_DIR" bash

    # Pane 0 (top): Start proxy and backend server
    tmux send-keys -t "$TMUX_SESSION.0" "echo '🔧 Cleaning up...'" C-m
    tmux send-keys -t "$TMUX_SESSION.0" "sleep 1" C-m
    tmux send-keys -t "$TMUX_SESSION.0" "echo '📦 Starting Proxy (3456) and Backend (3457)...'" C-m
    tmux send-keys -t "$TMUX_SESSION.0" "bunx concurrently --names proxy,server --prefix-colors cyan,magenta --kill-others-on-fail 'bun run proxy' 'sleep 2 && PORT=3457 bun run server'" C-m

    # Pane 1 (bottom): Start frontend
    tmux send-keys -t "$TMUX_SESSION.1" "echo '🌐 Waiting for backend...' && sleep 5" C-m
    tmux send-keys -t "$TMUX_SESSION.1" "echo '🚀 Starting Frontend (5173)...'" C-m
    tmux send-keys -t "$TMUX_SESSION.1" "BRIDGE_PORT=3457 bunx vite --host 0.0.0.0 --port 5173" C-m

    # Set layout
    tmux select-layout -t "$TMUX_SESSION" even-vertical

    # Attach to session
    echo "✓ Starting tmux session '$TMUX_SESSION'"
    echo ""
    echo "  Top pane:    Proxy + Backend"
    echo "  Bottom pane: Frontend Vite"
    echo ""
    echo "tmux shortcuts:"
    echo "  Ctrl+B then ↑/↓  - Switch panes"
    echo "  Ctrl+B then D    - Detach (keeps running)"
    echo "  Ctrl+B then [    - Scroll mode (q to exit)"
    echo ""
    echo "To reattach: tmux attach -t $TMUX_SESSION"
    echo "To kill:     tmux kill-session -t $TMUX_SESSION"
    echo ""

    tmux attach-session -t "$TMUX_SESSION"
}

start_rust_stack() {
    echo ""
    echo "🚀 Starting Rust stack with tmux..."
    echo "   ┌─ Top: Rust Backend (3458)"
    echo "   └─ Bottom: Frontend Vite (5173)"
    echo ""

    cleanup_tmux

    # Kill any existing Rust backend on port 3458
    echo "🔄 Cleaning up port 3458..."
    lsof -ti:3458 2>/dev/null | xargs kill -9 2>/dev/null || true
    sleep 1

    # Create new tmux session (detached) with bash that stays open
    tmux new-session -d -s "$TMUX_SESSION" -c "$PROJECT_ROOT/codex/codex-rs" bash

    # Configure to keep windows open on exit
    tmux set-option -t "$TMUX_SESSION" remain-on-exit on

    # Split window horizontally
    tmux split-window -v -t "$TMUX_SESSION" -c "$SCRIPT_DIR" bash

    # Pane 0 (top): Start Rust backend
    tmux send-keys -t "$TMUX_SESSION.0" "echo '🔧 Starting Rust Backend (3458)...'" C-m
    tmux send-keys -t "$TMUX_SESSION.0" "PORT=3458 cargo run -p codex-server" C-m

    # Pane 1 (bottom): Start frontend (wait for backend first)
    tmux send-keys -t "$TMUX_SESSION.1" "echo '⏳ Waiting for Rust backend to be ready...'" C-m
    tmux send-keys -t "$TMUX_SESSION.1" "for i in {1..30}; do if curl -s http://localhost:3458/codex-api/settings >/dev/null 2>&1; then echo '✓ Backend ready, starting frontend...'; break; fi; sleep 1; done" C-m
    tmux send-keys -t "$TMUX_SESSION.1" "echo '🚀 Starting Frontend (5173)...'" C-m
    tmux send-keys -t "$TMUX_SESSION.1" "BRIDGE_PORT=3458 bunx vite --host 0.0.0.0 --port 5173" C-m

    # Set layout
    tmux select-layout -t "$TMUX_SESSION" even-vertical

    # Attach to session
    echo "✓ Starting tmux session '$TMUX_SESSION'"
    echo ""
    echo "  Top pane:    Rust Backend"
    echo "  Bottom pane: Frontend Vite"
    echo ""
    echo "tmux shortcuts:"
    echo "  Ctrl+B then ↑/↓  - Switch panes"
    echo "  Ctrl+B then D    - Detach (keeps running)"
    echo "  Ctrl+B then [    - Scroll mode (q to exit)"
    echo ""
    echo "To reattach: tmux attach -t $TMUX_SESSION"
    echo "To kill:     tmux kill-session -t $TMUX_SESSION"
    echo ""

    tmux attach-session -t "$TMUX_SESSION"
}

case "${1:-status}" in
    ts|typescript|js|node)
        switch_to_ts
        start_typescript_stack
        ;;
    rust|rs|cargo)
        switch_to_rust
        start_rust_stack
        ;;
    status|info|show)
        show_status
        ;;
    -h|--help|help)
        show_usage
        ;;
    *)
        echo "Error: Unknown command '$1'"
        echo ""
        show_usage
        exit 1
        ;;
esac
