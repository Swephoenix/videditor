#!/usr/bin/env python3
"""2x video super-resolution with the local RealESRGAN_x4plus model."""

from __future__ import annotations

import argparse
import math
import os
import signal
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as functional


class ResidualDenseBlock(nn.Module):
    def __init__(self, channels: int = 64, growth: int = 32) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(channels, growth, 3, 1, 1)
        self.conv2 = nn.Conv2d(channels + growth, growth, 3, 1, 1)
        self.conv3 = nn.Conv2d(channels + growth * 2, growth, 3, 1, 1)
        self.conv4 = nn.Conv2d(channels + growth * 3, growth, 3, 1, 1)
        self.conv5 = nn.Conv2d(channels + growth * 4, channels, 3, 1, 1)
        self.activation = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        first = self.activation(self.conv1(value))
        second = self.activation(self.conv2(torch.cat((value, first), 1)))
        third = self.activation(self.conv3(torch.cat((value, first, second), 1)))
        fourth = self.activation(self.conv4(torch.cat((value, first, second, third), 1)))
        fifth = self.conv5(torch.cat((value, first, second, third, fourth), 1))
        return fifth * 0.2 + value


class ResidualInResidualDenseBlock(nn.Module):
    def __init__(self, channels: int = 64, growth: int = 32) -> None:
        super().__init__()
        self.rdb1 = ResidualDenseBlock(channels, growth)
        self.rdb2 = ResidualDenseBlock(channels, growth)
        self.rdb3 = ResidualDenseBlock(channels, growth)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        return self.rdb3(self.rdb2(self.rdb1(value))) * 0.2 + value


class RealEsrganX4(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.conv_first = nn.Conv2d(3, 64, 3, 1, 1)
        self.body = nn.Sequential(
            *(ResidualInResidualDenseBlock(64, 32) for _ in range(23))
        )
        self.conv_body = nn.Conv2d(64, 64, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(64, 64, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(64, 64, 3, 1, 1)
        self.conv_hr = nn.Conv2d(64, 64, 3, 1, 1)
        self.conv_last = nn.Conv2d(64, 3, 3, 1, 1)
        self.activation = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        feature = self.conv_first(value)
        body = self.conv_body(self.body(feature)) + feature
        body = self.activation(self.conv_up1(functional.interpolate(body, scale_factor=2, mode="nearest")))
        body = self.activation(self.conv_up2(functional.interpolate(body, scale_factor=2, mode="nearest")))
        return self.conv_last(self.activation(self.conv_hr(body)))


def load_model(model_path: Path, device: torch.device) -> nn.Module:
    checkpoint = torch.load(model_path, map_location="cpu", weights_only=True)
    parameters = checkpoint.get("params_ema") if isinstance(checkpoint, dict) else None
    if not isinstance(parameters, dict):
        raise RuntimeError("Real-ESRGAN-modellen saknar params_ema.")
    model = RealEsrganX4()
    model.load_state_dict(parameters, strict=True)
    model.eval().to(device)
    if device.type == "cuda":
        model.half()
    return model


@torch.inference_mode()
def upscale_frame(
    model: nn.Module,
    frame_bgr: np.ndarray,
    device: torch.device,
    tile_size: int,
    tile_padding: int = 12,
) -> np.ndarray:
    height, width = frame_bgr.shape[:2]
    output = np.empty((height * 2, width * 2, 3), dtype=np.uint8)
    tiles_x = math.ceil(width / tile_size)
    tiles_y = math.ceil(height / tile_size)
    for tile_y in range(tiles_y):
        for tile_x in range(tiles_x):
            start_x = tile_x * tile_size
            end_x = min(start_x + tile_size, width)
            start_y = tile_y * tile_size
            end_y = min(start_y + tile_size, height)
            padded_start_x = max(0, start_x - tile_padding)
            padded_end_x = min(width, end_x + tile_padding)
            padded_start_y = max(0, start_y - tile_padding)
            padded_end_y = min(height, end_y + tile_padding)

            tile = frame_bgr[padded_start_y:padded_end_y, padded_start_x:padded_end_x, ::-1].copy()
            tensor = torch.from_numpy(tile).permute(2, 0, 1).unsqueeze(0).to(device)
            tensor = tensor.half() if device.type == "cuda" else tensor.float()
            enhanced_x4 = model(tensor.div_(255.0)).clamp_(0, 1)
            enhanced_x2 = functional.interpolate(
                enhanced_x4,
                size=(tile.shape[0] * 2, tile.shape[1] * 2),
                mode="bicubic",
                align_corners=False,
                antialias=True,
            )
            enhanced = (
                enhanced_x2.squeeze(0).permute(1, 2, 0).mul_(255).byte().cpu().numpy()[..., ::-1]
            )
            crop_left = (start_x - padded_start_x) * 2
            crop_top = (start_y - padded_start_y) * 2
            crop_right = crop_left + (end_x - start_x) * 2
            crop_bottom = crop_top + (end_y - start_y) * 2
            output[start_y * 2:end_y * 2, start_x * 2:end_x * 2] = enhanced[
                crop_top:crop_bottom, crop_left:crop_right
            ]
    return output


def encoder_command(
    input_path: Path,
    temporary_output: Path,
    width: int,
    height: int,
    fps: float,
    encoder: str,
) -> list[str]:
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s:v", f"{width}x{height}",
        "-r", f"{fps:.8f}", "-i", "pipe:0", "-i", str(input_path),
        "-map", "0:v:0", "-map", "1:a?", "-map_metadata", "1",
    ]
    if encoder == "h264_nvenc":
        command.extend([
            "-c:v", "h264_nvenc", "-preset", "p7", "-tune", "hq",
            "-rc", "vbr", "-cq", "12", "-b:v", "0",
        ])
    else:
        command.extend(["-c:v", "libx264", "-preset", "slow", "-crf", "12"])
    command.extend([
        "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest",
        "-movflags", "+faststart", str(temporary_output),
    ])
    return command


def process_video(arguments: argparse.Namespace) -> None:
    if arguments.require_cuda and not torch.cuda.is_available():
        raise RuntimeError("CUDA är inte tillgängligt för Real-ESRGAN. Kontrollera NVIDIA-drivrutinen.")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(arguments.model, device)
    if arguments.check_model:
        print(f"MODEL_OK device={device.type}", flush=True)
        return

    capture = cv2.VideoCapture(str(arguments.input))
    if not capture.isOpened():
        raise RuntimeError(f"Kunde inte öppna videon: {arguments.input}")
    source_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count = max(0, int(capture.get(cv2.CAP_PROP_FRAME_COUNT)))
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    if source_width <= 0 or source_height <= 0:
        raise RuntimeError("Indatavideon saknar giltig upplösning.")
    if not math.isfinite(fps) or fps <= 0:
        fps = 30.0

    output_path = arguments.output
    temporary_output = output_path.with_name(f".{output_path.stem}.ai-tmp{output_path.suffix}")
    temporary_output.unlink(missing_ok=True)
    encoder = subprocess.Popen(
        encoder_command(
            arguments.input,
            temporary_output,
            source_width * 2,
            source_height * 2,
            fps,
            arguments.encoder,
        ),
        stdin=subprocess.PIPE,
    )
    cancelled = False

    def stop(_signal: int, _frame: object) -> None:
        nonlocal cancelled
        cancelled = True
        capture.release()
        if encoder.poll() is None:
            encoder.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    processed = 0
    try:
        while not cancelled:
            ok, frame = capture.read()
            if not ok:
                break
            enhanced = upscale_frame(model, frame, device, arguments.tile)
            if encoder.stdin is None:
                raise RuntimeError("FFmpeg-kodaren saknar indataflöde.")
            encoder.stdin.write(enhanced.tobytes())
            processed += 1
            if frame_count > 0 and (processed == 1 or processed % 5 == 0):
                print(f"PROGRESS {min(99, round(processed / frame_count * 100))}", flush=True)
        if encoder.stdin is not None:
            encoder.stdin.close()
        code = encoder.wait()
        if cancelled:
            raise RuntimeError("AI-uppskalningen avbröts.")
        if code != 0:
            raise RuntimeError(f"FFmpeg kunde inte koda den AI-förbättrade videon (kod {code}).")
        if processed == 0:
            raise RuntimeError("Indatavideon innehöll inga läsbara bildrutor.")
        os.replace(temporary_output, output_path)
        print("PROGRESS 100", flush=True)
    finally:
        capture.release()
        if encoder.poll() is None:
            encoder.kill()
            encoder.wait()
        temporary_output.unlink(missing_ok=True)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?", type=Path)
    parser.add_argument("output", nargs="?", type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--tile", type=int, default=256)
    parser.add_argument("--encoder", choices=("h264_nvenc", "libx264"), default="h264_nvenc")
    parser.add_argument("--require-cuda", action="store_true")
    parser.add_argument("--check-model", action="store_true")
    result = parser.parse_args()
    if not result.check_model and (result.input is None or result.output is None):
        parser.error("input och output krävs")
    if result.tile < 32:
        parser.error("--tile måste vara minst 32")
    return result


if __name__ == "__main__":
    try:
        process_video(parse_arguments())
    except Exception as error:  # noqa: BLE001 - CLI:n ska ge ett kort exportfel
        print(f"AI_UPSCALE_ERROR: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1)
