# LatentForge

Distributed image generation with workflow automation and managed assets.

See [docs/PURPOSE.md](docs/PURPOSE.md) for the problem being solved, non-goals, and intended
audience.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 (LTS)
- [just](https://github.com/casey/just)

No environment variables are required yet.

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

## Project structure

- `frontend/` — React (Vite + TypeScript) web app
- `backend/` — Fastify (Node + TypeScript) API server
- `worker/` — Python worker running local diffusion inference (PyTorch + diffusers)

## License

MIT — see [LICENSE](LICENSE).
