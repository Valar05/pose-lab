#!/usr/bin/env python3
import argparse
import json
import subprocess
from poseclip_workflow_lib import clip_payload, frame_by_tag, load_json, project_path, rel


def attacking_side(attack_name):
    name = (attack_name or '').lower()
    if 'left' in name:
        return 'left'
    if 'right' in name:
        return 'right'
    if name in {'frontkick', 'axekick'}:
        return 'left'
    if name in {'lowbackkick', 'spinninghighkick', 'axlekick'}:
        return 'right'
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
    anticipation = by_tag.get('anticipation') or by_tag.get('windup') or by_tag.get('start')
    contact = by_tag.get('contact')
    recoil = by_tag.get('recoil')
    recoil_settle = by_tag.get('recoilSettle') or by_tag.get('recoverySettle') or by_tag.get('settle')
    ext_y = (contact['positions'][foot][1] - anticipation['positions'][foot][1]) if anticipation and contact else 0.0
    ext_z = (contact['positions'][foot][2] - anticipation['positions'][foot][2]) if anticipation and contact else 0.0
    retract_z = (contact['positions'][foot][2] - recoil_settle['positions'][foot][2]) if contact and recoil_settle else 0.0
    recoil_start_z = (contact['positions'][foot][2] - recoil['positions'][foot][2]) if contact and recoil else 0.0
    hold_frames = 0
    contact_frame = frame_by_tag(clip, 'contact')
    hold_frame = frame_by_tag(clip, 'contactHold')
    if contact_frame and hold_frame:
        hold_frames = int(hold_frame.get('spriteFrame', 0)) - int(contact_frame.get('spriteFrame', 0))
    score = round(max(0.0, ext_y * 2.0 + ext_z * 0.6 + retract_z * 0.7 + recoil_start_z * 0.4 - hold_frames * 0.25), 3)
    return {
        'schema': 'pose-lab-ballistic-path-score-v1',
        'poseclip': rel(project_path(poseclip_path)),
        'attackName': attack_name,
        'attackingSide': side,
        'attackingFoot': foot,
        'metrics': {
            'extensionHeightDelta': round(ext_y, 5),
            'extensionForwardDelta': round(ext_z, 5),
            'recoilStartDelta': round(recoil_start_z, 5),
            'retractVisibleDelta': round(retract_z, 5),
            'contactHoldFrames': hold_frames,
        },
        'ballisticPathScore': score,
        'needsFastRecoil': hold_frames > 2 or retract_z < 0.75,
    }


def main():
    parser = argparse.ArgumentParser(description='Score foot-path launch and retraction for ballistic attacks.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_frontkick_sf2.poseclip.json')
    args = parser.parse_args()
    print(json.dumps(score(args.poseclip), indent=2))


if __name__ == '__main__':
    main()
