#!/usr/bin/env python3
"""Extrahera ljud från en video och transkribera med faster-whisper.

Användning:
  transcribe.py INPUT_VIDEO OUTPUT_JSON [MODEL] [LANGUAGE]

Skriver en JSON-lista med segment till OUTPUT_JSON:
  [{"start": float, "end": float, "text": str}, ...]
samt skriver en kort sammanfattning till stdout.
"""
import sys
import json
import subprocess
import tempfile
import os

MODEL = sys.argv[3] if len(sys.argv) > 3 else "small"
LANGUAGE = sys.argv[4] if len(sys.argv) > 4 else None


def extract_audio(video_path, wav_path):
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", video_path,
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        wav_path,
    ]
    subprocess.run(cmd, check=True)


def main():
    if len(sys.argv) < 3:
        print("Användning: transcribe.py INPUT OUTPUT_JSON [MODEL] [LANGUAGE]", file=sys.stderr)
        sys.exit(2)

    video_path = sys.argv[1]
    output_json = sys.argv[2]

    from faster_whisper import WhisperModel

    with tempfile.TemporaryDirectory() as tmp:
        wav_path = os.path.join(tmp, "audio.wav")
        print(f"Extraherar ljud från {video_path}...", file=sys.stderr)
        extract_audio(video_path, wav_path)

        print(f"Laddar modell '{MODEL}'...", file=sys.stderr)
        model = WhisperModel(MODEL, device="auto", compute_type="default")

        print("Transkriberar...", file=sys.stderr)
        segments, info = model.transcribe(
            wav_path,
            language=LANGUAGE,
            beam_size=5,
            vad_filter=False,
            word_timestamps=True,
        )

        result = []
        total_duration = float(getattr(info, "duration", 0) or 0)
        last_reported = -1
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            words = []
            for word in getattr(segment, "words", []) or []:
                word_text = (getattr(word, "word", "") or "").strip()
                if word_text:
                    words.append({
                        "start": round(float(word.start), 3),
                        "end": round(float(word.end), 3),
                        "word": word_text,
                    })
            result.append({
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": text,
                "words": words,
            })
            if total_duration > 0:
                progress = min(99, int((segment.end / total_duration) * 100))
                if progress != last_reported:
                    print(f"PROGRESS {progress}", file=sys.stderr, flush=True)
                    last_reported = progress

    with open(output_json, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)

    print(f"Färdig: {len(result)} segment, språk={info.language}", file=sys.stderr)


if __name__ == "__main__":
    main()
