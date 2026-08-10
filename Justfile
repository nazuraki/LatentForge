# LatentForge — Distributed image generation with workflow automation and managed assets

# List available recipes
default:
    @just --list

# Install all dependencies
install:
    cd frontend && npm install
    cd backend && npm install

# Run all checks (lint, typecheck, test)
check: lint typecheck test test-worker

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

# Start the backend dev server (port 19526)
dev-backend:
    cd backend && npm run dev

# Create the worker venv and install its dependencies
worker-setup:
    cd worker && /opt/homebrew/bin/python3.14 -m venv .venv && .venv/bin/pip install -e .

# Start a worker (local inference; see latentforge-worker --help for flags)
worker *ARGS:
    cd worker && LATENTFORGE_MODELS_DIR="${LATENTFORGE_MODELS_DIR:-models}" .venv/bin/latentforge-worker {{ARGS}}

# Run the worker's test suite (requires worker-setup)
test-worker:
    cd worker && .venv/bin/python -m unittest test_latentforge_worker

# Build and serve the production frontend
run:
    cd frontend && npm run build && npm run preview

# Build the production Docker image
docker-build:
    docker build -t latentforge .

# Build and start the stack (requires LATENTFORGE_WORKER_TOKEN in .env)
up:
    docker compose up -d --build

# Start the stack plus the containerized GPU worker (CUDA host; token in .env)
up-worker:
    docker compose --profile worker up -d --build

# Stop the stack, including the worker if running (data volumes are preserved)
down:
    docker compose --profile worker down

# Tail container logs (backend, plus worker when running)
logs:
    docker compose --profile worker logs -f

# Remove build artifacts
clean:
    rm -rf frontend/dist frontend/node_modules/.tmp

# Clean and reinstall from scratch
fresh: clean install
