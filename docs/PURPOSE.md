# Purpose

## Problem being solved

Generating images with diffusion models at any real scale quickly outgrows a single machine and a
folder of outputs. Teams end up hand-rolling scripts to fan work out across GPU workers, re-running
failed jobs manually, and losing track of which prompt, seed, and model produced which asset.

LatentForge provides distributed image generation with workflow automation and managed assets: it
coordinates generation jobs across workers, lets users define repeatable multi-step workflows
(generate → upscale → post-process), and keeps the resulting assets organized, searchable, and
traceable back to the parameters that produced them.

<!-- TODO: refine as the architecture takes shape -->

## Non-goals

- Training or fine-tuning models — LatentForge orchestrates inference, not training
- Being a general-purpose job scheduler — workflows are image-generation-centric
- Image editing tools (painting, masking UIs) beyond what workflows automate

## Intended audience

Teams and individual practitioners running diffusion-model image generation who need repeatable
pipelines and organized output — not casual users generating one-off images in a hosted UI.
