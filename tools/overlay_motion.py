#!/usr/bin/env python3
import argparse
import json
from poseclip_workflow_lib import clip_payload, load_json, project_path, rel, track_by_name, write_json

DEFAULT_ARM_BONES = [
    'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
    'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
]


def plan(target_poseclip, donor_poseclip, bones, path_name):
    target = clip_payload(load_json(target_poseclip))
    donor = clip_payload(load_json(donor_poseclip))
    suffix = 'quaternion' if path_name == 'rotation' else path_name
    tracks = []
    missing = []
    for bone in bones:
        name = f'{bone}.{suffix}'
        target_track = track_by_name(target, name)
        donor_track = track_by_name(donor, name)
        if target_track and donor_track:
            tracks.append(name)
        else:
            missing.append({'track': name, 'target': bool(target_track), 'donor': bool(donor_track)})
    return {
        'schema': 'pose-lab-overlay-motion-plan-v1',
        'targetPoseclip': rel(project_path(target_poseclip)),
        'donorPoseclip': rel(project_path(donor_poseclip)),
        'targetClipName': target.get('name'),
        'donorClipName': donor.get('name'),
        'path': path_name,
        'mode': 'phase-blend-local-arm-rotations',
        'targetBones': bones,
        'trackCount': len(tracks),
        'tracks': tracks,
        'missingTracks': missing,
        'safeToApply': len(tracks) > 0 and not missing,
        'note': 'Plan only. Apply overlays in the generator so tests can prove non-target tracks did not change.',
    }


def main():
    parser = argparse.ArgumentParser(description='Plan a narrow donor overlay without mutating poseclips.')
    parser.add_argument('--target', default='assets/pose_indexes/ares_axekick_sf2.poseclip.json')
    parser.add_argument('--donor', default='assets/pose_indexes/ares_headbutt_sf2.poseclip.json')
    parser.add_argument('--path', default='rotation')
    parser.add_argument('--bones', nargs='*', default=DEFAULT_ARM_BONES)
    parser.add_argument('--out')
    args = parser.parse_args()
    report = plan(args.target, args.donor, args.bones, args.path)
    if args.out:
        write_json(args.out, report)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
