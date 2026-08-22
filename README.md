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
| `LATENTFORGE_USR_URL`      | unset               | Public base URL of [usr](https://github.com/nazuraki/nazu/tree/main/apps/usr) (e.g. `https://usr.<parent domain>`). Set it and browsers authenticate with usr's cross-app SSO cookie; unset = the browser side is open (see [Authentication](#authentication)) |
| `LATENTFORGE_USR_APP`      | `latentforge`       | Our app name in usr — the `<app>:` role prefix that grants access                                |
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
nonstandard setups set `LATENTFORGE_MODELS_DIR` or pass `--models-dir`. Checkpoints with an
unsupported architecture (anything that isn't SD 1.x/2.x or SDXL-family) are skipped at
startup and logged, not advertised to the backend.

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
directory (Enter accepts `~/latentforge`) and whether to include the
[containerized GPU worker](#containerized-worker); non-interactive runs skip the prompts —
seed the defaults with `LATENTFORGE_HOME`, `LATENTFORGE_PORT`, and `LATENTFORGE_WORKER=1`.
No configuration files: on first visit the
UI walks through setup — it generates the worker token and stores it in the data volume.
Until setup completes, worker endpoints refuse requests (they are never open in production).
First visitor claims setup, so finish it right after installing. Re-running the installer
updates to the latest image.

### Authentication

Two independent gates, each optional:

- **Workers** — the shared bearer token (`LATENTFORGE_WORKER_TOKEN` or first-run setup).
- **Browsers (`LATENTFORGE_USR_URL`)** — usr SSO. LatentForge keeps **no accounts of its
  own**: users, roles, and sign-out live in usr. Browsers authenticate with the cross-app
  `nz_id` cookie that usr sets on the shared parent domain; the backend verifies it offline
  against usr's JWKS (cached 5 min, refetched on key rotation) and admits identities holding
  any role in the `latentforge` app. `latentforge:admin` is the admin; every other
  `latentforge:<tag>` role is a user grant that doubles as a **model-access tag** — admins
  tag restricted models in the UI, and a user may run a model only if they hold every tag on
  it (untagged models are open to every user). With no or an expired cookie the SPA bounces
  to usr's `/api/auth/sso/refresh`, which re-mints from the live usr session (or shows usr's
  login) and returns; a valid cookie without a `latentforge` role shows "no access" instead
  of looping. Requires both apps under one parent domain behind the shared HTTPS edge with
  usr's `USR_SSO_COOKIE_DOMAIN` set. Unset, the browser side is open — the original LAN/VPN
  assumption.

To deploy from a checkout instead, `just up` builds and starts the same stack locally.
Pre-setting `LATENTFORGE_WORKER_TOKEN` in the environment (or a `.env` next to the compose
file) skips first-run setup; the env var always wins over the stored token.

For deploy tooling that git-clones this repo and drives compose itself (e.g. a deploy
control plane), use [docker-compose.deploy.yml](docker-compose.deploy.yml) — the same
image-based stack the installer generates, kept in the repo so clone-and-`compose up`
deploys don't build from source. Provide `LATENTFORGE_WORKER_TOKEN` (and an absolute
`LATENTFORGE_MODELS_DIR` if the deployer's `$HOME` differs from the host user's) via a
`.env` in the checkout root.

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

### HTTPS

The stack serves plain HTTP; HTTPS is the job of a reverse proxy in front of it, not of
this stack. If the host runs a shared edge proxy on an external docker network named
`edge` (one Caddy/Traefik/nginx owning 80/443 for the whole box), the opt-in
[docker-compose.edge.yml](docker-compose.edge.yml) override joins the backend to that
network so the proxy can reach `latentforge:19526` by container name — no extra
published ports, no certs in this stack. Enable it by listing both compose files, e.g.
`COMPOSE_FILE=docker-compose.yml:docker-compose.edge.yml` in `.env`. Without a proxy,
any host-level reverse proxy pointed at `http://localhost:19526` works too. The
plain-HTTP port stays published either way, so workers keep using
`http://<server>:19526` while browsers use the proxy's hostname.

### Containerized worker

When the GPU lives on the same box as the server (or on any Linux/CUDA machine with
Docker), the worker can run as a container next to the stack instead — one management
surface for restarts, logs, and metrics. Requires the NVIDIA driver and
[nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
on the host, plus `LATENTFORGE_WORKER_TOKEN` in `.env` (the container can't read the
token from the data volume, so the env var is not optional here).

**Via the installer** (production): answer `y` to the worker prompt, or set
`LATENTFORGE_WORKER=1` for non-interactive runs. The installer pulls the published
`ghcr.io/nazuraki/latentforge-worker` image, resolves the token
(`LATENTFORGE_WORKER_TOKEN`, else `~/.latentforge/token` from a previous host-side
worker install, else a prompt) into `.env`, and records the choice as
`COMPOSE_PROFILES=worker` — so re-running the installer updates both images without
re-asking, and plain `docker compose` commands in the install directory include the
worker automatically.

**From a checkout** (builds the image locally):

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
