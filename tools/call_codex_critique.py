#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path
from typing import Any

from poseclip_workflow_lib import infer_poseclip_stem, project_path, rel

ROOT = project_path('.')
DEFAULT_GUIDE = project_path('docs/SF2_ANIMATION_CRITIQUE_GUIDE.md')
DEFAULT_PROMPT = """You are a fighting-game animation critique agent.

Use the supplied SF2 animation guide as the scoring rubric.
Focus on combat readability, silhouette, anticipation, commitment, contact, recovery, weight, and move identity.
Prefer concrete visual reads over generic advice.
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


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding='utf-8'))


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def write_json(path: Path, payload: dict[str, Any]) -> None:
    write_text(path, json.dumps(payload, indent=2, ensure_ascii=False) + '\n')

def infer_out_dir(args: argparse.Namespace) -> Path:
    if args.out:
        return project_path(args.out)
    stem = infer_poseclip_stem(args.poseclip or 'poseclip')
    return project_path(f'generated/codex_critiques/{stem}')


def build_packet(args: argparse.Namespace, out_dir: Path) -> tuple[dict[str, Any], dict[str, Any] | None]:
    packet_out = out_dir / 'packet_build'
    command = [
        'python3',
        str(project_path('tools/build_critique_packet.py')),
        '--poseclip',
        str(project_path(args.poseclip)),
        '--out',
        str(packet_out),
        '--view',
        args.view,
        '--frames',
        args.frames,
    ]
    if args.evidence:
        command.extend(['--evidence', str(project_path(args.evidence))])
    if args.video:
        command.append('--video')
    packet_summary = json.loads(subprocess.run(command, cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).stdout)
    before_after = None
    if args.include_before_after and args.poseclip:
        before_after = json.loads(subprocess.run([
            'python3',
            str(project_path('tools/build_before_after_packet.py')),
            '--poseclip',
            str(project_path(args.poseclip)),
            '--out',
            str(out_dir / 'before_after'),
            '--view',
            args.view,
        ], cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).stdout)
    return packet_summary, before_after


def read_optional_text(path_value: str | None) -> str | None:
    if not path_value:
        return None
    path = project_path(path_value)
    if not path.exists():
        return None
    return path.read_text(encoding='utf-8')


def select_images(manifest: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    frames = list(manifest.get('frames', []))
    priority = {'contact': 0, 'contactHold': 1, 'anticipation': 2, 'anticipationHold': 3, 'apex': 4, 'snap': 5, 'start': 6, 'recoil': 7, 'recoilSettle': 8, 'recovery': 9, 'settle': 10}
    frames.sort(key=lambda frame: (priority.get(str(frame.get('tag', '')), 99), int(frame.get('spriteFrame', 0))))
    selected = []
    seen = set()
    for frame in frames:
        png = frame.get('png')
        if not png or png in seen:
            continue
        seen.add(png)
        selected.append(frame)
        if len(selected) >= limit:
            break
    return selected


def build_prompt(args: argparse.Namespace, packet_summary: dict[str, Any], before_after: dict[str, Any] | None, out_dir: Path) -> tuple[str, dict[str, Any]]:
    manifest = load_json(project_path(packet_summary['manifest']))
    selected_frames = select_images(manifest, args.image_limit)
    prompt_bits: list[str] = []
    prompt_bits.append(DEFAULT_PROMPT if not args.prompt else project_path(args.prompt).read_text(encoding='utf-8'))
    prompt_bits.append('Critique this move as authored fighting-game animation. Prefer specific visual judgments over generic advice.')

    if getattr(args, 'include_guide', True) and DEFAULT_GUIDE.exists():
        prompt_bits.append('SF2 Critique Guide:\n\n' + DEFAULT_GUIDE.read_text(encoding='utf-8'))
    critique_packet_text = read_optional_text(packet_summary.get('critiquePacket'))
    if critique_packet_text:
        prompt_bits.append('Poseclip Critique Packet:\n\n' + critique_packet_text)
    if before_after and before_after.get('packet'):
        before_after_text = read_optional_text(before_after.get('packet'))
        if before_after_text:
            prompt_bits.append('Before/After Reduction Packet:\n\n' + before_after_text)
    manifest_excerpt = {
        'poseclip': manifest.get('poseclip'),
        'frameCount': len(manifest.get('frames', [])),
        'selectedFrames': [
            {
                'tag': frame.get('tag'),
                'spriteFrame': frame.get('spriteFrame'),
                'sourceTime': frame.get('sourceTime'),
                'description': frame.get('description'),
                'durationToNext': frame.get('durationToNext'),
                'annotations': frame.get('annotations', []),
            }
            for frame in selected_frames
        ],
    }
    prompt_bits.append('Render Manifest Excerpt:\n\n' + json.dumps(manifest_excerpt, indent=2))
    selected_images = []
    for frame in selected_frames:
        png_rel = frame.get('png')
        png_path = project_path(png_rel)
        if not png_path.exists():
            continue
        selected_images.append({
            'tag': frame.get('tag'),
            'spriteFrame': frame.get('spriteFrame'),
            'png': rel(png_path),
            'detail': args.detail,
        })
        note_bits = []
        for note in frame.get('annotations', []) or []:
            text_note = note.get('comment') or note.get('text')
            if text_note:
                note_bits.append(text_note)
        annotation_text = (' Annotations: ' + ' | '.join(note_bits)) if note_bits else ''
        prompt_bits.append(
            f"Frame `{frame.get('tag')}` sprite `{frame.get('spriteFrame')}` source `{frame.get('sourceTime')}`: {frame.get('description', '')}{annotation_text}"
        )
        prompt_bits.append('Selected image path: ' + rel(png_path))

    packet_text = '\n\n'.join(prompt_bits).strip() + '\n'
    request_meta = {
        'schema': 'pose-lab-codex-critique-request-v1',
        'poseclip': packet_summary.get('poseclip'),
        'packetSummary': packet_summary,
        'beforeAfter': before_after,
        'selectedImages': selected_images,
        'promptLength': len(packet_text),
        'promptPreview': packet_text[:5000],
    }
    return packet_text, request_meta


def run_codex(prompt_text: str, out_dir: Path, model: str) -> dict[str, Any]:
    codex_output = out_dir / 'codex_last_message.md'
    stderr_path = out_dir / 'codex.stderr.log'
    command = [
        'codex', 'exec',
        '--json',
        '--skip-git-repo-check',
        '-C', str(ROOT),
        '-s', 'workspace-write',
        '-c', 'approval_policy="never"',
        '-m', model,
        '-o', str(codex_output),
        '-',
    ]
    proc = subprocess.run(command, input=prompt_text, cwd=ROOT, text=True, capture_output=True)
    stderr_path.write_text(proc.stderr or '', encoding='utf-8')
    events_path = out_dir / 'codex_events.jsonl'
    events_path.write_text(proc.stdout or '', encoding='utf-8')
    return {
        'schema': 'pose-lab-codex-critique-run-v1',
        'returncode': proc.returncode,
        'codexOutput': rel(codex_output),
        'stderr': rel(stderr_path),
        'events': rel(events_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description='Run a Codex-backed critique pass from a poseclip packet.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_axekick_sf2.poseclip.json')
    parser.add_argument('--out', help='Output directory. Default: generated/codex_critiques/<poseclip stem>')
    parser.add_argument('--view', choices=['xy', 'xz', 'zy'], default='xy')
    parser.add_argument('--frames', choices=['read', 'step', 'all'], default='read')
    parser.add_argument('--video', action='store_true')
    parser.add_argument('--include-before-after', action='store_true')
    parser.add_argument('--evidence', help='Override visual evidence path for frame annotations')
    parser.add_argument('--prompt', help='Override the base prompt text')
    parser.add_argument('--model', default=os.environ.get('CODEX_MODEL', '').strip() or 'o3')
    parser.add_argument('--detail', choices=['low', 'high'], default='low')
    parser.add_argument('--image-limit', type=int, default=3)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    out_dir = infer_out_dir(args)
    out_dir.mkdir(parents=True, exist_ok=True)
    packet_summary, before_after = build_packet(args, out_dir)
    prompt_text, request_meta = build_prompt(args, packet_summary, before_after, out_dir)
    write_text(out_dir / 'prompt.md', prompt_text)
    write_json(out_dir / 'request_meta.json', request_meta)
    if args.dry_run:
        preview = {
            'schema': 'pose-lab-codex-critique-run-v1',
            'dryRun': True,
            'model': args.model,
            'packetSummary': packet_summary,
            'beforeAfter': before_after,
            'requestMeta': request_meta,
            'prompt': rel(out_dir / 'prompt.md'),
        }
        write_json(out_dir / 'request_preview.json', preview)
        print(json.dumps(preview, indent=2))
        return 0

    run = run_codex(prompt_text, out_dir, args.model)
    write_json(out_dir / 'run.json', run)
    print(json.dumps(run, indent=2))
    return 0 if run['returncode'] == 0 else run['returncode']


if __name__ == '__main__':
    raise SystemExit(main())
