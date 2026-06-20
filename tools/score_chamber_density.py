#!/usr/bin/env python3
import argparse
import json
import subprocess
from poseclip_workflow_lib import clip_payload, frame_by_tag, load_json, project_path, rel


def attacking_side(attack_name):
    name = (attack_name or '').lower()
    if name in {'frontkick', 'axekick'}:
        return 'left'
    if name in {'lowbackkick', 'spinninghighkick', 'axlekick'}:
        return 'right'
    if 'left' in name:
        return 'left'
    return 'right'


def score(poseclip_path):
    payload = load_json(poseclip_path)
    clip = clip_payload(payload)
    attack_name = payload.get('attackName') or clip.get('userData', {}).get('attackName')
    side = attacking_side(attack_name)
    foot = f'{side}Foot'
    raw = subprocess.check_output([
        'python3', str(project_path('tools/measure_poseclip_world_metrics.py')),
        '--poseclip', str(project_path(poseclip_path)), '--view', 'xz'
    ], cwd=project_path('.'), text=True)
    metrics = json.loads(raw)
    by_tag = {frame['tag']: frame for frame in metrics['frames']}
    chamber = by_tag.get('anticipation') or by_tag.get('windup') or by_tag.get('start')
    chamber_hold = by_tag.get('anticipationHold') or chamber
    contact = by_tag.get('contact')
    compact_y = chamber['positions'][foot][1] if chamber else 0.0
    compact_z = chamber['positions'][foot][2] - chamber['positions']['head'][2] if chamber else 0.0
    hold_compact_z = chamber_hold['positions'][foot][2] - chamber_hold['positions']['head'][2] if chamber_hold else 0.0
    release_delta = (contact['positions'][foot][1] - chamber_hold['positions'][foot][1]) if contact and chamber_hold else 0.0
    hold_frames = 0
    anticipation = frame_by_tag(clip, 'anticipation')
    anticipation_hold = frame_by_tag(clip, 'anticipationHold')
    if anticipation and anticipation_hold:
        hold_frames = int(anticipation_hold.get('spriteFrame', 0)) - int(anticipation.get('spriteFrame', 0))
    score_value = round(max(0.0, (0.5 - compact_y) * 3.0 + max(0.0, -compact_z) * 1.5 + max(0.0, -hold_compact_z) * 1.0 + release_delta * 0.8 + hold_frames * 0.4), 3)
    return {
        'schema': 'pose-lab-chamber-density-score-v1',
        'poseclip': rel(project_path(poseclip_path)),
        'attackName': attack_name,
        'attackingSide': side,
        'attackingFoot': foot,
        'metrics': {
            'chamberFootHeight': round(compact_y, 5),
            'chamberFootBehindHead': round(compact_z, 5),
            'heldChamberFootBehindHead': round(hold_compact_z, 5),
            'releaseHeightDelta': round(release_delta, 5),
            'chamberHoldFrames': hold_frames,
        },
        'chamberDensityScore': score_value,
        'needsHeavierChamber': hold_frames == 0 or compact_y > 0.35,
    }


def main():
    parser = argparse.ArgumentParser(description='Score how dense and distinct a chamber pose is before release.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_lowbackkick_sf2.poseclip.json')
    args = parser.parse_args()
    print(json.dumps(score(args.poseclip), indent=2))


if __name__ == '__main__':
    main()
