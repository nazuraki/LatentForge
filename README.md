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
| `PORT`                     | `19526`              | Backend listen port                                                                              |
| `LATENTFORGE_DATA_DIR`     | in-memory + `backend/data/assets` | Data root: SQLite DB at `<dir>/latentforge.db`, images under `<dir>/assets`        |
| `LATENTFORGE_WORKER_TOKEN` | unset               | Shared bearer token required on worker endpoints. Optional everywhere: in production, leaving it unset enables first-run setup in the UI (token stored in the data volume); in dev, unset means open |
| `LATENTFORGE_STATIC_DIR`   | unset               | Built frontend dir; if it exists, the backend serves it with SPA fallback                        |
| `LATENTFORGE_MODELS_DIR`   | `~/.latentforge/models` | Worker checkpoint directory (`just worker` points it at `worker/models`)                     |
| `LATENTFORGE_BACKEND_URL`  | `http://localhost:19526` | Worker: backend base URL (`--backend-url` wins). Set by compose for the containerized worker |

None are required for local development.

## Quickstart

```sh
just install
just dev
```

This starts the frontend dev server (Vite) at the URL it prints (default `http://localhost:5173`).
Run `just dev-backend` in another terminal to start the API server (Fastify, default
`http://localhost:19526`); the frontend dev server proxies `/api` requests to it.

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

The backend and built frontend ship as one Docker image
(`ghcr.io/nazuraki/latentforge`, published from `main`); jobs persist in SQLite and images
on disk, both on a named volume. The stack expects to sit on a LAN/VPN — don't expose it to
the open internet as-is.

One-line install (needs only Docker):

```sh
curl -fsSL https://raw.githubusercontent.com/nazuraki/LatentForge/main/install.sh | sh
```

This pulls the image, starts the stack, and prints the URL. It prompts for the install
directory (Enter accepts `~/latentforge`; non-interactive runs skip the prompt — seed the
default with `LATENTFORGE_HOME`, and the port with `LATENTFORGE_PORT`). No configuration
files: on first visit the
UI walks through setup — it generates the worker token and stores it in the data volume.
Until setup completes, worker endpoints refuse requests (they are never open in production).
First visitor claims setup, so finish it right after installing. Re-running the installer
updates to the latest image.

To deploy from a checkout instead, `just up` builds and starts the same stack locally.
Pre-setting `LATENTFORGE_WORKER_TOKEN` in the environment (or a `.env` next to the compose
file) skips first-run setup; the env var always wins over the stored token.

The UI and API are at `http://<server>:19526`. Workers run wherever the GPU is (not in the
container) and authenticate with the token from setup. No checkout needed — install the
worker as a tool with [uv](https://docs.astral.sh/uv/) (Python 3.10+):

```sh
uv tool install "git+https://github.com/nazuraki/LatentForge#subdirectory=worker"
```

Drop `.safetensors` checkpoints (or symlinks) into `~/.latentforge/models`, then:

```sh
latentforge-worker --backend-url http://<server>:19526 --token <token>
```

The first run saves the token to `~/.latentforge/token` (mode `0600`), so later runs can
omit `--token`. `--token`/`LATENTFORGE_WORKER_TOKEN` always take precedence over the file;
delete the file to forget the token.

Re-run `uv tool install` with `--force` to update. On Linux, plain installs pull the
default CUDA build of PyTorch; for a specific CUDA version or CPU-only, see the
[PyTorch install matrix](https://pytorch.org/get-started/locally/). (From a checkout,
`just worker --backend-url ...` still works and uses `worker/models`.)

### Containerized worker

When the GPU lives on the same box as the server (or on any Linux/CUDA machine with
Docker), the worker can run as a container next to the stack instead — one management
surface for restarts, logs, and metrics. Requires the NVIDIA driver and
[nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
on the host, plus `LATENTFORGE_WORKER_TOKEN` in `.env` (the container can't read the
token from the data volume, so the env var is not optional here):

```sh
just up-worker    # = docker compose --profile worker up -d --build
```

The `worker` service is behind a compose profile, so plain `just up` never touches it —
GPU-less deployments are unaffected. It bind-mounts `~/.latentforge/models` read-only at
`/models` (override the host path with `LATENTFORGE_MODELS_DIR` in `.env`; symlinks and
NFS mounts work), reaches the backend over the compose network, registers as
`latentforge-gpu` (override with `LATENTFORGE_WORKER_NAME`), and keeps the Hugging Face
cache in the `worker-hf-cache` volume across restarts. GPU metrics (VRAM, utilization)
still come from the host — `docker stats` only sees CPU/memory; pair with
[dcgm-exporter](https://github.com/NVIDIA/dcgm-exporter) if you want them scraped.

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
