#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

from poseclip_workflow_lib import project_path, rel

ROOT = project_path('.')


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def run_json(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return json.loads(result.stdout)


def collect_poseclips(args: argparse.Namespace) -> list[str]:
    items: list[str] = []
    seen = set()
    for value in args.poseclip:
        rel_value = rel(project_path(value))
        if rel_value.endswith('.poseclip.json') and rel_value not in seen:
            seen.add(rel_value)
            items.append(rel_value)
    for pattern in args.glob:
        for path in sorted(project_path('.').glob(pattern)):
            rel_value = rel(path)
            if rel_value.endswith('.poseclip.json') and rel_value not in seen:
                seen.add(rel_value)
                items.append(rel_value)
    return items


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch OpenAI critique runner for Pose Lab poseclips.")
    parser.add_argument("--poseclip", action="append", default=[])
    parser.add_argument("--glob", action="append", default=[])
    parser.add_argument("--out", default="generated/openai_critiques/batch")
    parser.add_argument("--model", required=True)
    parser.add_argument("--view", default="xz", choices=["xy", "xz", "zy"])
    parser.add_argument("--frames", default="read", choices=["read", "all"])
    parser.add_argument("--detail", default="low", choices=["low", "high", "auto"])
    parser.add_argument("--image-limit", type=int, default=4)
    parser.add_argument("--max-output-tokens", type=int, default=1400)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    poseclips = collect_poseclips(args)
    if not poseclips:
        raise SystemExit("No poseclips matched. Use --poseclip or --glob.")

    out_dir = project_path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    runs = []
    for poseclip in poseclips:
        stem = Path(poseclip).name.replace('.poseclip.json', '')
        run_out = out_dir / stem
        command = [
            "python3",
            str(project_path("tools/call_openai_critique.py")),
            "--poseclip",
            poseclip,
            "--out",
            str(run_out),
            "--model",
            args.model,
            "--view",
            args.view,
            "--frames",
            args.frames,
            "--detail",
            args.detail,
            "--image-limit",
            str(args.image_limit),
            "--max-output-tokens",
            str(args.max_output_tokens),
            "--temperature",
            str(args.temperature),
        ]
        if args.dry_run:
            command.append("--dry-run")
        runs.append(run_json(command))

    report = {
        "schema": "pose-lab-openai-critique-batch-v1",
        "outDir": rel(out_dir),
        "count": len(runs),
        "dryRun": bool(args.dry_run),
        "model": args.model,
        "poseclips": poseclips,
        "runs": runs,
    }
    write_json(out_dir / "batch_manifest.json", report)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
