# LatentForge

Distributed image generation with workflow automation and managed assets.

See [docs/PURPOSE.md](docs/PURPOSE.md) for the problem being solved, non-goals, and intended
audience.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 (LTS)
- [just](https://github.com/casey/just)

### Environment variables

| Variable                   | Default             | Purpose                                                                                          |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `PORT`                     | `3001`              | Backend listen port                                                                              |
| `LATENTFORGE_DATA_DIR`     | in-memory + `backend/data/assets` | Data root: SQLite DB at `<dir>/latentforge.db`, images under `<dir>/assets`        |
| `LATENTFORGE_WORKER_TOKEN` | unset (open)        | Shared bearer token required on worker endpoints; **required** when `NODE_ENV=production`        |
| `LATENTFORGE_STATIC_DIR`   | unset               | Built frontend dir; if it exists, the backend serves it with SPA fallback                        |
| `LATENTFORGE_MODELS_DIR`   | `worker/models`     | Worker checkpoint directory                                                                      |

None are required for local development.

## Quickstart

```sh
just install
just dev
```

This starts the frontend dev server (Vite) at the URL it prints (default `http://localhost:5173`).
Run `just dev-backend` in another terminal to start the API server (Fastify, default
`http://localhost:3001`); the frontend dev server proxies `/api` requests to it.

To actually execute jobs, run a worker (requires Python 3.14 and, once, `just worker-setup`):

```sh
just worker
```

The worker discovers `.safetensors` checkpoints in `worker/models/` by default (symlinks
work — link your existing checkpoints there rather than copying). Deployments and
nonstandard setups set `LATENTFORGE_MODELS_DIR` or pass `--models-dir`.

## Development

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `just check`     | Lint, typecheck, and test             |
| `just fix`       | Auto-fix lint issues                  |
| `just test`      | Run the test suite                    |
| `just dev-backend` | Start the backend dev server        |
| `just run`       | Build and serve the production bundle |
| `just fresh`     | Clean and reinstall from scratch      |

## Deployment

The backend and built frontend ship as one Docker image; jobs persist in SQLite and images on
disk, both on a named volume. The stack expects to sit on a LAN/VPN — don't expose it to the
open internet as-is.

```sh
echo "LATENTFORGE_WORKER_TOKEN=$(openssl rand -hex 32)" > .env
just up
```

The UI and API are at `http://<server>:3001`. Workers run wherever the GPU is (not in the
container) and authenticate with the same token:

```sh
LATENTFORGE_WORKER_TOKEN=<token> just worker --backend-url http://<server>:3001
```

Notes:

- The named volume `latentforge-data` holds the SQLite DB and generated images; it survives
  `just down`. If you bind-mount a host directory at `/data` instead, `chown 1000:1000`
  it (the container runs as the unprivileged `node` user).
- Jobs that were `running` when the server stopped are re-queued on startup.
- `just docker-build`, `just logs`, and `just down` cover the rest of the loop.

## Project structure

- `frontend/` — React (Vite + TypeScript) web app
- `backend/` — Fastify (Node + TypeScript) API server
- `worker/` — Python worker running local diffusion inference (PyTorch + diffusers)

## License

MIT — see [LICENSE](LICENSE).
