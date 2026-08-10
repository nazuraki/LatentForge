"""LatentForge worker: claims jobs from the backend and runs local diffusion inference.

Talks to the backend over its HTTP API only (register -> claim -> result), so it can
run on any machine that can reach the backend. Models are single-file checkpoints
(.safetensors) discovered in --models-dir.
"""

import argparse
import base64
import io
import logging
import os
import random
import socket
import sys
import time
from pathlib import Path

import requests

log = logging.getLogger("latentforge.worker")

# Relative default for dev; deployments set LATENTFORGE_MODELS_DIR (or --models-dir).
DEFAULT_MODELS_DIR = Path(__file__).parent / "models"
MAX_SEED = 2**32 - 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-url", default="http://localhost:3001")
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=os.environ.get("LATENTFORGE_MODELS_DIR", DEFAULT_MODELS_DIR),
    )
    parser.add_argument("--name", default=socket.gethostname())
    parser.add_argument("--poll-interval", type=float, default=2.0)
    return parser.parse_args()


def discover_models(models_dir: Path) -> dict[str, Path]:
    """Map model name (file stem) -> checkpoint path."""
    hint = "set LATENTFORGE_MODELS_DIR or pass --models-dir (checkpoints may be symlinks)"
    if not models_dir.is_dir():
        sys.exit(f"models dir not found: {models_dir} — {hint}")
    models = {p.stem: p for p in sorted(models_dir.glob("*.safetensors"))}
    if not models:
        sys.exit(f"no .safetensors checkpoints in {models_dir} — {hint}")
    return models


def pick_device() -> str:
    import torch

    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


class PipelineCache:
    """Loads pipelines lazily and keeps the most recent one (checkpoints are GBs)."""

    def __init__(self, device: str) -> None:
        self.device = device
        self.path: Path | None = None
        self.pipeline = None

    def get(self, path: Path):
        if self.path == path:
            return self.pipeline
        import torch
        from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline

        log.info("loading checkpoint %s (device=%s)", path.name, self.device)
        cls = StableDiffusionXLPipeline if "xl" in path.stem.lower() else StableDiffusionPipeline
        dtype = torch.float16 if self.device != "cpu" else torch.float32
        pipeline = cls.from_single_file(str(path), torch_dtype=dtype)
        pipeline.to(self.device)
        pipeline.enable_attention_slicing()
        self.path, self.pipeline = path, pipeline
        return pipeline


def generate(pipelines: PipelineCache, checkpoint: Path, request: dict) -> tuple[bytes, int]:
    """Run inference; returns (png bytes, seed used)."""
    import torch

    params = request.get("params") or {}
    seed = request.get("seed")
    if seed is None:
        seed = random.randint(0, MAX_SEED)
    pipeline = pipelines.get(checkpoint)
    generator = torch.Generator(pipelines.device).manual_seed(seed)
    result = pipeline(
        prompt=request["prompt"],
        negative_prompt=params.get("negative_prompt"),
        width=int(params.get("width", 512)),
        height=int(params.get("height", 512)),
        num_inference_steps=int(params.get("steps", 20)),
        guidance_scale=float(params.get("guidance", 7.5)),
        generator=generator,
    )
    buffer = io.BytesIO()
    result.images[0].save(buffer, format="PNG")
    return buffer.getvalue(), seed


class Backend:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.worker_id: str | None = None

    def register(self, name: str, models: list[str]) -> None:
        res = self.session.post(
            f"{self.base_url}/api/workers", json={"name": name, "models": models}, timeout=10
        )
        res.raise_for_status()
        self.worker_id = res.json()["id"]
        log.info("registered as %s (%s)", name, self.worker_id)

    def claim(self) -> dict | None:
        res = self.session.post(
            f"{self.base_url}/api/workers/{self.worker_id}/claim", timeout=10
        )
        res.raise_for_status()
        return res.json() if res.status_code == 200 else None

    def report(self, job_id: str, payload: dict) -> None:
        res = self.session.post(
            f"{self.base_url}/api/workers/{self.worker_id}/jobs/{job_id}/result",
            json=payload,
            timeout=60,
        )
        if res.status_code == 409:
            log.info("job %s was canceled before the result landed", job_id)
        else:
            res.raise_for_status()


def resolve_checkpoint(models: dict[str, Path], requested: str | None) -> Path:
    if requested is None:
        return next(iter(models.values()))
    if requested not in models:
        raise ValueError(f"model not available on this worker: {requested}")
    return models[requested]


def run_job(backend: Backend, pipelines: PipelineCache, models: dict[str, Path], job: dict):
    job_id, request = job["id"], job["request"]
    log.info("job %s: %r", job_id, request["prompt"])
    try:
        checkpoint = resolve_checkpoint(models, request.get("model"))
        started = time.monotonic()
        png, seed = generate(pipelines, checkpoint, request)
        log.info("job %s: done in %.1fs (seed=%d)", job_id, time.monotonic() - started, seed)
    except Exception as err:  # report failure instead of crashing the worker
        log.exception("job %s failed", job_id)
        backend.report(job_id, {"status": "failed", "error": str(err)})
        return
    backend.report(
        job_id,
        {
            "status": "succeeded",
            "images": [base64.b64encode(png).decode("ascii")],
            "seed": seed,
        },
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = parse_args()
    models = discover_models(args.models_dir)
    log.info("models: %s", ", ".join(models))
    device = pick_device()
    log.info("device: %s", device)

    backend = Backend(args.backend_url)
    backend.register(args.name, list(models))
    pipelines = PipelineCache(device)

    while True:
        try:
            job = backend.claim()
        except requests.ConnectionError:
            log.warning("backend unreachable, retrying in %.0fs", args.poll_interval)
            time.sleep(args.poll_interval)
            continue
        if job is None:
            time.sleep(args.poll_interval)
            continue
        run_job(backend, pipelines, models, job)


if __name__ == "__main__":
    main()
