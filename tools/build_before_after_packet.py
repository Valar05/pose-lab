#!/usr/bin/env python3
import argparse
import json
import subprocess
from pathlib import Path
from poseclip_workflow_lib import clip_payload, infer_index_path, load_json, project_path, rel


def main():
    parser = argparse.ArgumentParser(description='Build a packet that compares source timing and generated read poses.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_frontkick_sf2.poseclip.json')
    parser.add_argument('--out', default='generated/before_after/frontkick')
    parser.add_argument('--view', default='xz', choices=['xy', 'xz', 'zy'])
    args = parser.parse_args()
    out_dir = project_path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        'python3', str(project_path('tools/render_poseclip_stickframes.py')),
        '--poseclip', str(project_path(args.poseclip)), '--out', str(out_dir / 'render'), '--view', args.view, '--frames', 'read'
    ], cwd=project_path('.'), check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    payload = load_json(args.poseclip)
    clip = clip_payload(payload)
    reduction = clip.get('userData', {}).get('sourceReduction', {})
    lines = ['# Before And After Packet', '', f"Poseclip: `{rel(project_path(args.poseclip))}`", f"Index: `{rel(infer_index_path(args.poseclip))}`", '', '## Source vs Generated Reads']
    for frame in reduction.get('spriteFrames', []):
        lines.append(f"- `{frame['tag']}` sprite `{frame['spriteFrame']}` uses source `{frame['sourceTime']}`: {frame.get('description', '')}")
    markdown_path = out_dir / 'before_after_packet.md'
    markdown_path.write_text('\n'.join(lines) + '\n')
    report = {
        'schema': 'pose-lab-before-after-packet-v1',
        'poseclip': rel(project_path(args.poseclip)),
        'renderManifest': rel(out_dir / 'render' / 'manifest.json'),
        'packet': rel(markdown_path),
        'sourceFrameCount': len(reduction.get('spriteFrames', [])),
    }
    (out_dir / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
