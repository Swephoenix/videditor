import ast
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "upscale_realesrgan.py"
MODEL = ROOT / "models" / "realesr-general-x4v3.pth"


def realesrgan_python() -> Path:
    candidates = [
        os.environ.get("REALESRGAN_PYTHON"),
        ROOT / ".venv" / "bin" / "python",
        ROOT.parent / "venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    raise AssertionError("Ingen Real-ESRGAN Python-miljö hittades")


def test_upscale_script_is_valid_python_and_requires_real_model() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    ast.parse(source)
    assert "RealEsrganX4" in source
    assert "RealEsrganCompactX4" in source
    assert "scale_cuda" not in source


def test_local_realesrgan_weights_match_the_implementation() -> None:
    assert MODEL.is_file(), "realesr-general-x4v3.pth saknas"
    result = subprocess.run(
        [
            str(realesrgan_python()),
            str(SCRIPT),
            "--model",
            str(MODEL),
            "--check-model",
            "--tile",
            "32",
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert "MODEL_OK" in result.stdout
    assert "architecture=RealEsrganCompactX4" in result.stdout
