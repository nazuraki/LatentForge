# GPU worker image. Runs on a Linux host with an NVIDIA GPU — requires the
# NVIDIA driver and nvidia-container-toolkit on the host. Checkpoints are
# bind-mounted at /models (see the `worker` service in docker-compose.yml).
FROM pytorch/pytorch:2.9.1-cuda12.8-cudnn9-runtime

WORKDIR /app
COPY pyproject.toml latentforge_worker.py ./
# torch comes from the base image; pip only pulls the remaining deps
RUN pip install --no-cache-dir .

ENV LATENTFORGE_MODELS_DIR=/models \
    HF_HOME=/cache/huggingface

CMD ["latentforge-worker"]
