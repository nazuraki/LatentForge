# LatentForge — Distributed image generation with workflow automation and managed assets

# List available recipes
default:
    @just --list

# Install all dependencies
install:
    cd frontend && npm install

# Run all checks (lint, typecheck, test)
check: lint typecheck test

# Lint the codebase (read-only)
lint:
    cd frontend && npm run lint

# Auto-fix lint issues
fix:
    cd frontend && npm run fix

# Typecheck the codebase
typecheck:
    cd frontend && npm run typecheck

# Run the test suite
test:
    cd frontend && npm run test

# Start the frontend dev server
dev:
    cd frontend && npm run dev

# Build and serve the production frontend
run:
    cd frontend && npm run build && npm run preview

# Remove build artifacts
clean:
    rm -rf frontend/dist frontend/node_modules/.tmp

# Clean and reinstall from scratch
fresh: clean install
