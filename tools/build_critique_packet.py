#!/usr/bin/env python3
import argparse
import json
import subprocess
from pathlib import Path
from poseclip_workflow_lib import project_path, rel


def run_renderer(poseclip, out, view, frames, video):
    command = [
        'python3',
        str(project_path('tools/render_poseclip_stickframes.py')),
        '--poseclip', poseclip,
        '--out', out,
        '--frames', frames,
        '--view', view,
    ]
    command.append('--video' if video else '--no-video')
    subprocess.run(command, cwd=project_path('.'), check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return json.loads(project_path(out).joinpath('manifest.json').read_text())


def main():
    parser = argparse.ArgumentParser(description='Build a minimal GPT critique packet from a poseclip render.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_axekick_sf2.poseclip.json')
    parser.add_argument('--out', default='generated/pose_renders/packet_build')
    parser.add_argument('--view', choices=['xy', 'xz', 'zy'], default='xy')
    parser.add_argument('--frames', choices=['read', 'all'], default='read')
    parser.add_argument('--video', action='store_true')
    args = parser.parse_args()
    manifest = run_renderer(args.poseclip, args.out, args.view, args.frames, args.video)
    summary = {
        'schema': 'pose-lab-critique-packet-build-v1',
        'poseclip': manifest.get('poseclip'),
        'manifest': rel(project_path(args.out) / 'manifest.json'),
        'critiquePacket': manifest.get('critiquePacket'),
        'critiqueGuide': manifest.get('critiqueGuide'),
        'video': manifest.get('video'),
        'animationGif': manifest.get('animationGif'),
        'frames': len(manifest.get('frames', [])),
        'recommendedUploadFiles': [manifest.get('critiquePacket'), manifest.get('animationGif') or manifest.get('video'), manifest.get('frames', [{}])[0].get('png')],
    }
    project_path(args.out).joinpath('packet_summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
