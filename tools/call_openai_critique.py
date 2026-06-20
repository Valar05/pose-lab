#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from poseclip_workflow_lib import infer_poseclip_stem, project_path, rel

ROOT = project_path('.')
DEFAULT_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
DEFAULT_ENDPOINT = DEFAULT_BASE_URL.rstrip("/") + "/responses"
DEFAULT_GUIDE = project_path("docs/SF2_ANIMATION_CRITIQUE_GUIDE.md")
DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "").strip()
DEFAULT_PROMPT = """You are a fighting-game animation critique agent.

Use the supplied SF2 animation guide as the scoring rubric.
Focus on combat readability, silhouette, anticipation, commitment, contact, recovery, weight, and move identity.
Prefer concrete visual reads over generic prose.
Name exact phases or frames when something fails.
Do not rewrite the whole move. Recommend the smallest high-value changes.
Return markdown with these sections:

## First Read
## What Works
## What Fails
## Highest Value Changes
## Scores

In Scores, include 0-10 ratings for Readability, Anticipation, Commitment, Contact, Recovery, Weight, Silhouette, Move Identity, and SF2 Feel, plus Overall.
""".strip()


def load_env() -> None:
    for path in (Path.home() / ".secrets" / "openai.env", Path.home() / ".bashrc", Path.home() / ".profile"):
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key or key in os.environ:
                continue
            os.environ[key] = value.strip().strip('"').strip("'")


def env_value(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    pattern = re.compile(r"^\s*(?:export\s+)?(?P<key>[A-Za-z_][A-Za-z0-9_]*)=(?P<value>.*)$")
    for path in (Path.home() / ".secrets" / "openai.env", Path.home() / ".bashrc", Path.home() / ".profile"):
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            match = pattern.match(raw.strip())
            if not match or match.group("key") != name:
                continue
            value_text = match.group("value").strip()
            if value_text[:1] == value_text[-1:] and value_text[:1] in {'"', "'"}:
                value_text = value_text[1:-1]
            return value_text.strip()
    return ""


def run_json(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return json.loads(result.stdout)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    write_text(path, json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def infer_out_dir(args: argparse.Namespace) -> Path:
    if args.out:
        return project_path(args.out)
    stem = infer_poseclip_stem(args.poseclip or "poseclip")
    return project_path(f"generated/openai_critiques/{stem}")


def build_packet(args: argparse.Namespace, out_dir: Path) -> tuple[dict[str, Any], dict[str, Any] | None]:
    if args.packet_summary:
        packet_summary = load_json(project_path(args.packet_summary))
    else:
        packet_out = out_dir / "packet_build"
        command = [
            "python3",
            str(project_path("tools/build_critique_packet.py")),
            "--poseclip",
            str(project_path(args.poseclip)),
            "--out",
            str(packet_out),
            "--view",
            args.view,
            "--frames",
            args.frames,
        ]
        if args.evidence:
            command.extend(['--evidence', str(project_path(args.evidence))])
        if args.video:
            command.append("--video")
        packet_summary = run_json(command)
    before_after = None
    if args.include_before_after and args.poseclip:
        before_after = run_json([
            "python3",
            str(project_path("tools/build_before_after_packet.py")),
            "--poseclip",
            str(project_path(args.poseclip)),
            "--out",
            str(out_dir / "before_after"),
            "--view",
            args.view,
        ])
    return packet_summary, before_after


def priority_for_tag(tag: str) -> int:
    order = {
        "contact": 0,
        "contactHold": 1,
        "anticipation": 2,
        "anticipationHold": 3,
        "apex": 4,
        "snap": 5,
        "start": 6,
        "recoil": 7,
        "recoilSettle": 8,
        "recovery": 9,
        "settle": 10,
    }
    return order.get(tag, 99)


def select_images(manifest: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    frames = list(manifest.get("frames", []))
    frames.sort(key=lambda frame: (priority_for_tag(str(frame.get("tag", ""))), int(frame.get("spriteFrame", 0))))
    selected = []
    seen = set()
    for frame in frames:
        png = frame.get("png")
        if not png or png in seen:
            continue
        seen.add(png)
        selected.append(frame)
        if len(selected) >= limit:
            break
    return selected


def as_data_url(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    mime = mime or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def read_optional_text(path_value: str | None) -> str | None:
    if not path_value:
        return None
    path = project_path(path_value)
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def estimate_input_tokens(texts: list[str]) -> int:
    return max(1, sum((len(text) + 3) // 4 for text in texts if text))


def build_request(args: argparse.Namespace, packet_summary: dict[str, Any], before_after: dict[str, Any] | None, out_dir: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest = load_json(project_path(packet_summary["manifest"]))
    selected_frames = select_images(manifest, args.image_limit)
    content: list[dict[str, Any]] = []
    prompt_texts: list[str] = []

    prompt_texts.append(DEFAULT_PROMPT if not args.prompt else project_path(args.prompt).read_text(encoding="utf-8"))
    prompt_texts.append("Critique this move as authored fighting-game animation. Prefer specific visual judgments over generic advice.")

    if args.include_guide and DEFAULT_GUIDE.exists():
        guide_text = DEFAULT_GUIDE.read_text(encoding="utf-8")
        prompt_texts.append("SF2 Critique Guide:\n\n" + guide_text)

    critique_packet_text = read_optional_text(packet_summary.get("critiquePacket"))
    if critique_packet_text:
        prompt_texts.append("Poseclip Critique Packet:\n\n" + critique_packet_text)

    if before_after and before_after.get("packet"):
        before_after_text = read_optional_text(before_after.get("packet"))
        if before_after_text:
            prompt_texts.append("Before/After Reduction Packet:\n\n" + before_after_text)

    manifest_excerpt = {
        "poseclip": manifest.get("poseclip"),
        "frameCount": len(manifest.get("frames", [])),
        "selectedFrames": [
            {
                "tag": frame.get("tag"),
                "spriteFrame": frame.get("spriteFrame"),
                "sourceTime": frame.get("sourceTime"),
                "description": frame.get("description"),
                "durationToNext": frame.get("durationToNext"),
                "annotations": frame.get("annotations", []),
            }
            for frame in selected_frames
        ],
    }
    prompt_texts.append("Render Manifest Excerpt:\n\n" + json.dumps(manifest_excerpt, indent=2))

    for text in prompt_texts:
        content.append({"type": "input_text", "text": text})

    selected_images = []
    for frame in selected_frames:
        png_rel = frame.get("png")
        png_path = project_path(png_rel)
        if not png_path.exists():
            continue
        selected_images.append({
            "tag": frame.get("tag"),
            "spriteFrame": frame.get("spriteFrame"),
            "png": rel(png_path),
            "detail": args.detail,
        })
        note_bits = []
        for note in frame.get('annotations', []) or []:
            text_note = note.get('comment') or note.get('text')
            if text_note:
                note_bits.append(text_note)
        annotation_text = (' Annotations: ' + ' | '.join(note_bits)) if note_bits else ''
        content.append({
            "type": "input_text",
            "text": f"Frame `{frame.get('tag')}` sprite `{frame.get('spriteFrame')}` source `{frame.get('sourceTime')}`: {frame.get('description', '')}{annotation_text}",
        })
        content.append({
            "type": "input_image",
            "detail": args.detail,
            "image_url": as_data_url(png_path),
        })

    body: dict[str, Any] = {
        "model": args.model,
        "input": [{"role": "user", "content": content}],
        "max_output_tokens": args.max_output_tokens,
    }
    if args.temperature is not None:
        body["temperature"] = args.temperature

    meta = {
        "poseclip": packet_summary.get("poseclip"),
        "manifest": packet_summary.get("manifest"),
        "critiquePacket": packet_summary.get("critiquePacket"),
        "beforeAfterPacket": before_after.get("packet") if before_after else None,
        "selectedImages": selected_images,
        "imageCount": len(selected_images),
        "estimatedInputTokens": estimate_input_tokens(prompt_texts),
    }
    write_json(out_dir / "request_preview.json", body)
    write_json(out_dir / "request_meta.json", meta)
    return body, meta


def extract_output_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str) and payload.get("output_text").strip():
        return payload["output_text"].strip()
    parts: list[str] = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            content_type = content.get("type")
            if content_type in {"output_text", "text"}:
                text = content.get("text", "")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
    text = "\n\n".join(parts).strip()
    if text:
        return text
    raise SystemExit("OpenAI response did not contain output text")


def call_openai(body: dict[str, Any], endpoint: str, timeout: int, attempts: int) -> dict[str, Any]:
    api_key = env_value("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is not set")
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "pose-lab-openai-critique/1.0",
        },
        method="POST",
    )
    errors: list[str] = []
    for attempt in range(1, max(1, attempts) + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise SystemExit(f"OpenAI API error {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            errors.append(f"attempt {attempt}: {exc}")
            if attempt < attempts:
                time.sleep(min(2**attempt, 6))
    raise SystemExit("OpenAI API connection failed:\n" + "\n".join(errors))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Submit Pose Lab critique packets to OpenAI instead of spending Codex turns on first-pass critique.")
    parser.add_argument("--poseclip", help="Project-relative poseclip path. Builds packet assets automatically.")
    parser.add_argument("--packet-summary", help="Existing packet_summary.json from build_critique_packet.py.")
    parser.add_argument("--out", help="Output directory. Default: generated/openai_critiques/<poseclip stem>")
    parser.add_argument("--view", choices=["xy", "xz", "zy"], default="xz")
    parser.add_argument("--frames", choices=["read", "step", "all"], default="read")
    parser.add_argument("--video", action="store_true")
    parser.add_argument("--include-before-after", action="store_true", default=True)
    parser.add_argument("--no-before-after", dest="include_before_after", action="store_false")
    parser.add_argument("--include-guide", action="store_true", default=True)
    parser.add_argument("--no-guide", dest="include_guide", action="store_false")
    parser.add_argument("--prompt", help="Optional markdown prompt override.")
    parser.add_argument("--evidence", help="Override visual evidence JSON path used for frame annotations.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--detail", choices=["low", "high", "auto"], default="low")
    parser.add_argument("--image-limit", type=int, default=4)
    parser.add_argument("--max-output-tokens", type=int, default=1400)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--api-attempts", type=int, default=2)
    args = parser.parse_args()
    if not args.poseclip and not args.packet_summary:
        parser.error("provide --poseclip or --packet-summary")
    if not args.model:
        parser.error("provide --model or set OPENAI_MODEL")
    return args


def main() -> int:
    load_env()
    args = parse_args()
    out_dir = infer_out_dir(args)
    out_dir.mkdir(parents=True, exist_ok=True)

    packet_summary, before_after = build_packet(args, out_dir)
    body, meta = build_request(args, packet_summary, before_after, out_dir)

    result: dict[str, Any] = {
        "schema": "pose-lab-openai-critique-run-v1",
        "poseclip": packet_summary.get("poseclip"),
        "outDir": rel(out_dir),
        "request": rel(out_dir / "request_preview.json"),
        "requestMeta": rel(out_dir / "request_meta.json"),
        "packetSummary": packet_summary,
        "beforeAfter": before_after,
        "dryRun": bool(args.dry_run),
        "model": args.model,
        "endpoint": args.endpoint,
        "imageCount": meta["imageCount"],
        "estimatedInputTokens": meta["estimatedInputTokens"],
        "critique": None,
        "response": None,
    }

    if args.dry_run:
        write_json(out_dir / "run_manifest.json", result)
        print(json.dumps(result, indent=2))
        return 0

    response = call_openai(body, args.endpoint, args.timeout, args.api_attempts)
    critique = extract_output_text(response)
    write_text(out_dir / "critique.md", critique + ("\n" if not critique.endswith("\n") else ""))
    write_json(out_dir / "response.json", response)
    result["critique"] = rel(out_dir / "critique.md")
    result["response"] = rel(out_dir / "response.json")
    write_json(out_dir / "run_manifest.json", result)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
