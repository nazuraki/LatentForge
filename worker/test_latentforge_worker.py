"""Tests for latentforge_worker.py — run with `python -m unittest test_latentforge_worker`."""

import json
import struct
import tempfile
import unittest
from pathlib import Path

from latentforge_worker import discover_models


def write_fake_safetensors(path: Path, keys: list[str]) -> None:
    """Write a safetensors file with only a header (no tensor data) for the given keys."""
    header = {
        key: {"dtype": "F16", "shape": [1], "data_offsets": [0, 0]} for key in keys
    }
    header_bytes = json.dumps(header).encode("utf-8")
    with path.open("wb") as f:
        f.write(struct.pack("<Q", len(header_bytes)))
        f.write(header_bytes)


class DiscoverModelsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.models_dir = Path(self.tmp.name)

    def test_registers_sdxl_and_sd1x_checkpoints(self) -> None:
        write_fake_safetensors(
            self.models_dir / "sdxl_model.safetensors",
            ["conditioner.embedders.0.foo"],
        )
        write_fake_safetensors(
            self.models_dir / "sd1x_model.safetensors",
            ["cond_stage_model.foo"],
        )

        models = discover_models(self.models_dir)

        self.assertEqual(set(models), {"sdxl_model", "sd1x_model"})

    def test_excludes_unsupported_architecture(self) -> None:
        write_fake_safetensors(
            self.models_dir / "sdxl_model.safetensors",
            ["conditioner.embedders.0.foo"],
        )
        write_fake_safetensors(
            self.models_dir / "zimage_model.safetensors",
            ["transformer.blocks.0.foo"],
        )

        with self.assertLogs("latentforge.worker", level="INFO") as logs:
            models = discover_models(self.models_dir)

        self.assertEqual(set(models), {"sdxl_model"})
        self.assertTrue(
            any("skipping zimage_model.safetensors" in line for line in logs.output)
        )

    def test_excludes_corrupt_file(self) -> None:
        write_fake_safetensors(
            self.models_dir / "sdxl_model.safetensors",
            ["conditioner.embedders.0.foo"],
        )
        (self.models_dir / "corrupt.safetensors").write_bytes(b"not a safetensors file")

        with self.assertLogs("latentforge.worker", level="INFO") as logs:
            models = discover_models(self.models_dir)

        self.assertEqual(set(models), {"sdxl_model"})
        self.assertTrue(
            any("skipping corrupt.safetensors" in line for line in logs.output)
        )

    def test_exits_when_all_checkpoints_unsupported(self) -> None:
        write_fake_safetensors(
            self.models_dir / "zimage_model.safetensors",
            ["transformer.blocks.0.foo"],
        )

        with self.assertLogs("latentforge.worker", level="INFO"):
            with self.assertRaises(SystemExit):
                discover_models(self.models_dir)


if __name__ == "__main__":
    unittest.main()
