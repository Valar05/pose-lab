#!/usr/bin/env python3
import argparse
import json
from poseclip_workflow_lib import changed_track_names, clip_payload, load_json, project_path, rel, sprite_frames, write_json


def compare(base_path, candidate_path, min_delta):
    base = clip_payload(load_json(base_path))
    candidate = clip_payload(load_json(candidate_path))
    changes = changed_track_names(base, candidate, min_delta=min_delta)
    base_frames = {(frame.get('tag'), frame.get('spriteFrame'), frame.get('sourceTime')) for frame in sprite_frames(base)}
    candidate_frames = {(frame.get('tag'), frame.get('spriteFrame'), frame.get('sourceTime')) for frame in sprite_frames(candidate)}
    return {
        'schema': 'pose-lab-poseclip-version-compare-v1',
        'base': rel(project_path(base_path)),
        'candidate': rel(project_path(candidate_path)),
        'baseClipName': base.get('name'),
        'candidateClipName': candidate.get('name'),
        'changedTrackCount': len(changes),
        'changedTracks': changes[:50],
        'scheduleAdded': [list(item) for item in sorted(candidate_frames - base_frames)],
        'scheduleRemoved': [list(item) for item in sorted(base_frames - candidate_frames)],
        'meaningfulDelta': bool(changes or candidate_frames != base_frames),
    }


def main():
    parser = argparse.ArgumentParser(description='Compare two poseclips and report actual track/schedule deltas.')
    parser.add_argument('--base', required=True)
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--min-delta', type=float, default=0.000001)
    parser.add_argument('--out')
    args = parser.parse_args()
    report = compare(args.base, args.candidate, args.min_delta)
    if args.out:
        write_json(args.out, report)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
