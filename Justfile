# LatentForge — Distributed image generation with workflow automation and managed assets

# List available recipes
default:
    @just --list

# Install all dependencies
install:
    cd frontend && npm install
    cd backend && npm install

# Run all checks (lint, typecheck, test)
check: lint typecheck test

# Lint the codebase (read-only)
lint:
    cd frontend && npm run lint
    cd backend && npm run lint

# Auto-fix lint issues
fix:
    cd frontend && npm run fix
    cd backend && npm run fix

# Typecheck the codebase
typecheck:
    cd frontend && npm run typecheck
    cd backend && npm run typecheck

# Run the test suite
test:
    cd frontend && npm run test
    cd backend && npm run test

# Start the frontend dev server (proxies /api to the backend)
dev:
    cd frontend && npm run dev

# Start the backend dev server (port 3001)
dev-backend:
    cd backend && npm run dev

# Create the worker venv and install its dependencies
worker-setup:
    cd worker && /opt/homebrew/bin/python3.14 -m venv .venv && .venv/bin/pip install -r requirements.txt

# Start a worker (local inference; see worker/worker.py --help for flags)
worker *ARGS:
    cd worker && .venv/bin/python worker.py {{ARGS}}

# Build and serve the production frontend
run:
    cd frontend && npm run build && npm run preview

# Build the production Docker image
docker-build:
    docker build -t latentforge .

# Build and start the stack (requires LATENTFORGE_WORKER_TOKEN in .env)
docker-up:
    docker compose up -d --build

# Stop the stack (data volume is preserved)
docker-down:
    docker compose down

# Tail backend container logs
docker-logs:
    docker compose logs -f

# Remove build artifacts
clean:
    rm -rf frontend/dist frontend/node_modules/.tmp

# Clean and reinstall from scratch
fresh: clean install
