#!/usr/bin/env python3
import argparse
import json
from poseclip_workflow_lib import infer_index_path, load_json, project_path, rel, write_json

PHASES = ['start', 'anticipation', 'apex', 'snap', 'contact', 'recoil', 'settle']


def best(frames, predicate, score, fallback):
    candidates = [frame for frame in frames if predicate(frame)]
    if not candidates:
        return fallback
    return max(candidates, key=score)


def extract(index_path):
    data = load_json(index_path)
    frames = data.get('analysis', {}).get('frames', [])
    if not frames:
        raise SystemExit(f'No analysis frames in {index_path}')
    metadata = data.get('metadata', {})
    dash_start = float(metadata.get('dash_start', 0.15))
    attack_end = float(metadata.get('attack_end', frames[-1].get('time', 0.0)))
    start = frames[0]
    contact = best(
        frames,
        lambda f: dash_start * 0.7 <= float(f.get('time', 0.0)) <= attack_end + 0.1,
        lambda f: float(f.get('strikeReach', 0.0) or 0.0) + float(f.get('effectorExtension', 0.0) or 0.0) * 0.55 + float(f.get('motionTotal', 0.0) or 0.0) * 0.15,
        start,
    )
    anticipation = best(
        frames,
        lambda f: 0.0 < float(f.get('time', 0.0)) < float(contact.get('time', attack_end)),
        lambda f: float(f.get('motionTotal', 0.0) or 0.0) + max(0.0, float(f.get('effectorHeight', 0.0) or 0.0)) * 1.2 - float(f.get('strikeReach', 0.0) or 0.0) * 0.25,
        start,
    )
    apex = best(
        frames,
        lambda f: float(anticipation.get('time', 0.0)) <= float(f.get('time', 0.0)) <= float(contact.get('time', attack_end)),
        lambda f: float(f.get('effectorHeight', 0.0) or 0.0) + float(f.get('effectorExtension', 0.0) or 0.0) * 0.25,
        anticipation,
    )
    snap = best(
        frames,
        lambda f: float(apex.get('time', 0.0)) <= float(f.get('time', 0.0)) <= float(contact.get('time', attack_end)),
        lambda f: float(f.get('motionTotal', 0.0) or 0.0),
        contact,
    )
    recoil = best(
        frames,
        lambda f: float(f.get('time', 0.0)) > float(contact.get('time', 0.0)),
        lambda f: float(f.get('motionTotal', 0.0) or 0.0) - abs(float(f.get('strikeReach', 0.0) or 0.0) - float(start.get('strikeReach', 0.0) or 0.0)) * 0.1,
        frames[-1],
    )
    settle = frames[-1]
    phase_map = {'start': start, 'anticipation': anticipation, 'apex': apex, 'snap': snap, 'contact': contact, 'recoil': recoil, 'settle': settle}
    return {
        'schema': 'pose-lab-phase-candidates-v1',
        'index': rel(project_path(index_path)),
        'attackName': data.get('attackName'),
        'sourceClipName': data.get('clipName'),
        'phases': [{
            'tag': tag,
            'frameIndex': phase_map[tag].get('frameIndex'),
            'sourceTime': phase_map[tag].get('time'),
            'description': phase_map[tag].get('description'),
            'strikeReach': phase_map[tag].get('strikeReach'),
            'effectorHeight': phase_map[tag].get('effectorHeight'),
            'effectorExtension': phase_map[tag].get('effectorExtension'),
            'motionTotal': phase_map[tag].get('motionTotal'),
        } for tag in PHASES],
    }


def main():
    parser = argparse.ArgumentParser(description='Extract proposed source phase candidates from indexed animation frames.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_axekick_sf2.poseclip.json')
    parser.add_argument('--index')
    parser.add_argument('--out')
    args = parser.parse_args()
    report = extract(args.index or infer_index_path(args.poseclip))
    if args.out:
        write_json(args.out, report)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
