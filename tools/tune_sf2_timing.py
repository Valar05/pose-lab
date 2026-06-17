#!/usr/bin/env python3
import argparse
import json
from poseclip_workflow_lib import clip_payload, frame_by_tag, load_json, project_path, rel, sprite_frames, write_json

VARIANTS = {
    'light': {'anticipation': 4, 'contactHold': 3, 'recovery': 5},
    'medium': {'anticipation': 6, 'contactHold': 6, 'recovery': 7},
    'heavy': {'anticipation': 9, 'contactHold': 10, 'recovery': 9},
    'special': {'anticipation': 11, 'contactHold': 11, 'recovery': 10},
}


def tune(poseclip_path, variant):
    clip = clip_payload(load_json(poseclip_path))
    frames = sprite_frames(clip)
    params = VARIANTS[variant]
    source_by_tag = {frame.get('tag'): frame for frame in frames}
    order = [tag for tag in ['start', 'anticipation', 'anticipationHold', 'lift', 'apex', 'apexHold', 'snap', 'contact', 'contactHold', 'recoil', 'recoverySettle', 'settle'] if tag in source_by_tag]
    sprite = 0
    tuned = []
    for tag in order:
        src = dict(source_by_tag[tag])
        if tag == 'start':
            sprite = 0
        elif tag == 'anticipation':
            sprite = params['anticipation']
        elif tag == 'anticipationHold':
            sprite += max(2, params['anticipation'] // 2)
        elif tag == 'contact':
            sprite = max(sprite + 1, int((frame_by_tag(clip, 'snap') or src).get('spriteFrame', sprite)) + 1)
        elif tag == 'contactHold':
            contact = next((item for item in tuned if item['tag'] == 'contact'), None)
            sprite = (contact['spriteFrame'] if contact else sprite) + params['contactHold']
        elif tag in ('recoil', 'recoverySettle', 'settle'):
            sprite += max(1, params['recovery'] // 3)
        else:
            sprite += max(1, int(src.get('spriteFrame', sprite + 1)) - int((tuned[-1]['sourceSpriteFrame'] if tuned else 0)))
        src['sourceSpriteFrame'] = src.get('spriteFrame')
        src['spriteFrame'] = int(sprite)
        tuned.append(src)
    return {
        'schema': 'pose-lab-sf2-timing-variant-v1',
        'poseclip': rel(project_path(poseclip_path)),
        'variant': variant,
        'goal': 'Proposed timing only; does not rewrite poseclip tracks.',
        'spriteFrames': tuned,
    }


def main():
    parser = argparse.ArgumentParser(description='Generate SF2 timing variant proposals from an existing pose schedule.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_axekick_sf2.poseclip.json')
    parser.add_argument('--variant', choices=sorted(VARIANTS), default='heavy')
    parser.add_argument('--out')
    args = parser.parse_args()
    report = tune(args.poseclip, args.variant)
    if args.out:
        write_json(args.out, report)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
