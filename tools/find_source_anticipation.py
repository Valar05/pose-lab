#!/usr/bin/env python3
import argparse
import json
from poseclip_workflow_lib import infer_index_path, infer_reduction_path, load_json, project_path, rel, write_json


def find(index_path, reduction_path=None, limit=5):
    index_data = load_json(index_path)
    analysis = index_data.get('analysis', {})
    frames = analysis.get('frames', [])
    reduction = load_json(reduction_path) if reduction_path and project_path(reduction_path).exists() else {}
    contact_time = None
    for frame in reduction.get('spriteFrames', []):
        if frame.get('tag') in ('contact', 'snap'):
            contact_time = frame.get('sourceTime')
            if frame.get('tag') == 'contact':
                break
    if contact_time is None:
        contact_time = float(index_data.get('metadata', {}).get('dash_start', 0.2))

    style = analysis.get('attackStyle') or index_data.get('attackName', '').lower()
    candidates = []
    for frame in frames:
        if float(frame.get('time', 0.0)) >= float(contact_time):
            continue
        motion = float(frame.get('motionTotal', 0.0) or 0.0)
        reach = float(frame.get('strikeReach', 0.0) or 0.0)
        extension = float(frame.get('effectorExtension', abs(reach)) or 0.0)
        height = float(frame.get('effectorHeight', 0.0) or 0.0)
        score = motion * 0.35 + max(0.0, -reach) * 0.8 + max(0.0, height) * 1.25 + max(0.0, 1.2 - extension) * 0.4
        if 'kick' in str(style).lower():
            score += max(0.0, height) * 0.9
        candidates.append({
            'frameIndex': frame.get('frameIndex'),
            'time': frame.get('time'),
            'semanticTag': frame.get('semanticTag'),
            'description': frame.get('description'),
            'score': round(score, 5),
            'strikeReach': reach,
            'effectorHeight': height,
            'effectorExtension': extension,
            'motionTotal': motion,
        })
    candidates.sort(key=lambda item: item['score'], reverse=True)
    return {
        'schema': 'pose-lab-source-anticipation-candidates-v1',
        'index': rel(project_path(index_path)),
        'reduction': rel(project_path(reduction_path)) if reduction_path else None,
        'attackName': index_data.get('attackName'),
        'sourceClipName': index_data.get('clipName'),
        'contactSourceTime': contact_time,
        'candidates': candidates[:limit],
    }


def main():
    parser = argparse.ArgumentParser(description='Find source-keyframe anticipation candidates before contact.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_axekick_sf2.poseclip.json')
    parser.add_argument('--index')
    parser.add_argument('--reduction')
    parser.add_argument('--limit', type=int, default=5)
    parser.add_argument('--out')
    args = parser.parse_args()
    index_path = args.index or infer_index_path(args.poseclip)
    reduction_path = args.reduction or infer_reduction_path(args.poseclip)
    report = find(index_path, reduction_path, args.limit)
    if args.out:
        write_json(args.out, report)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
