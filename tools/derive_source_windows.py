#!/usr/bin/env python3
import argparse
import json
from poseclip_workflow_lib import clip_payload, frame_by_tag, infer_index_path, load_json, project_path, rel


def window(center, radius=0.03333):
    return {'start': round(max(0.0, center - radius), 5), 'end': round(center + radius, 5), 'center': round(center, 5)}


def main():
    parser = argparse.ArgumentParser(description='Derive useful source time windows around key move phases.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_frontkick_sf2.poseclip.json')
    args = parser.parse_args()
    payload = load_json(args.poseclip)
    clip = clip_payload(payload)
    attack_name = payload.get('attackName') or clip.get('userData', {}).get('attackName')
    reduction = clip.get('userData', {}).get('sourceReduction', {})
    frames = {frame['tag']: frame for frame in reduction.get('spriteFrames', [])}
    windows = {}
    for tag in ['windup', 'anticipation', 'anticipationHold', 'lift', 'apex', 'snap', 'contact', 'contactHold', 'recoil', 'recoilSettle', 'settle']:
        frame = frames.get(tag)
        if frame:
            windows[tag] = window(float(frame['sourceTime']))
    report = {
        'schema': 'pose-lab-source-windows-v1',
        'poseclip': rel(project_path(args.poseclip)),
        'index': rel(infer_index_path(args.poseclip)),
        'attackName': attack_name,
        'windows': windows,
    }
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
