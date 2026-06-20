#!/usr/bin/env python3
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path('/storage/emulated/0/Documents/GodotProjects/pose-lab')


def project_path(value):
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def load_poseclip(path):
    payload = json.loads(project_path(path).read_text())
    return payload.get('clip', payload)


def measure_frames(poseclip):
    output = subprocess.check_output([
        'python3',
        'tools/measure_poseclip_world_metrics.py',
        '--poseclip', poseclip,
        '--frames', 'all',
        '--view', 'xz',
    ], cwd=ROOT, text=True)
    data = json.loads(output)
    frames = data['frames']
    previous = None
    for frame in frames:
        feet = frame.setdefault('feet', {})
        if 'leftFootMinusHipsForward' not in feet:
            hips = frame['positions']['hips']
            left = frame['positions']['leftFoot']
            right = frame['positions']['rightFoot']
            feet['leftFootMinusHipsForward'] = round(left[2] - hips[2], 6)
            feet['rightFootMinusHipsForward'] = round(right[2] - hips[2], 6)
            feet['leftFootHeight'] = round(left[1], 6)
            feet['rightFootHeight'] = round(right[1], 6)
        deltas = {}
        if previous is not None:
            deltas['leftFootHeight'] = round(feet['leftFootHeight'] - previous['feet']['leftFootHeight'], 6)
            deltas['rightFootHeight'] = round(feet['rightFootHeight'] - previous['feet']['rightFootHeight'], 6)
            deltas['leftFootMinusHipsForward'] = round(feet['leftFootMinusHipsForward'] - previous['feet']['leftFootMinusHipsForward'], 6)
            deltas['rightFootMinusHipsForward'] = round(feet['rightFootMinusHipsForward'] - previous['feet']['rightFootMinusHipsForward'], 6)
            deltas['leftFootHeightDelta'] = deltas['leftFootHeight']
            deltas['rightFootHeightDelta'] = deltas['rightFootHeight']
            deltas['leftFootMinusHipsForwardDelta'] = deltas['leftFootMinusHipsForward']
            deltas['rightFootMinusHipsForwardDelta'] = deltas['rightFootMinusHipsForward']
        frame['deltas'] = deltas
        previous = frame
    return data


def metric_value(frame, metric):
    if metric in frame.get('feet', {}):
        return frame['feet'][metric]
    if metric in frame.get('deltas', {}):
        return frame['deltas'][metric]
    if metric in frame.get('guard', {}):
        return frame['guard'][metric]
    if metric in frame.get('posture', {}):
        return frame['posture'][metric]
    if metric in frame.get('xz', {}):
        return frame['xz'][metric]
    raise KeyError(metric)


def condition_failed(frame, condition):
    value = metric_value(frame, condition['metric'])
    if 'min' in condition and not (value >= condition['min']):
        return value, f"{condition['metric']}={value:.3f} < min {condition['min']:.3f}"
    if 'max' in condition and not (value <= condition['max']):
        return value, f"{condition['metric']}={value:.3f} > max {condition['max']:.3f}"
    if 'maxAbs' in condition and not (abs(value) <= condition['maxAbs']):
        return value, f"abs({condition['metric']})={abs(value):.3f} > maxAbs {condition['maxAbs']:.3f}"
    return None, None


def evaluate_rule(frame, rule):
    failures = []
    if 'conditions' in rule:
        for condition in rule['conditions']:
            value, message = condition_failed(frame, condition)
            if message:
                failures.append({'metric': condition['metric'], 'value': value, 'message': message})
        return failures
    if 'allOf' in rule:
        matched = []
        for condition in rule['allOf']:
            value, message = condition_failed(frame, condition)
            if not message:
                return []
            matched.append({'metric': condition['metric'], 'value': value, 'message': message})
        return matched
    return failures


def audit(args):
    clip = load_poseclip(args.poseclip)
    metrics = measure_frames(args.poseclip)
    frames = metrics['frames']
    ruleset = clip.get('userData', {}).get('badFrameRules')
    if not ruleset:
        return {
            'schema': 'pose-lab-bad-frame-audit-v1',
            'poseclip': args.poseclip,
            'attackName': clip.get('userData', {}).get('attackName'),
            'appliedRuleSet': None,
            'checkedFrames': len(frames),
            'failureCount': 0,
            'failures': [],
        }
    failures = []
    windows = ruleset.get('windows', [])
    for window in windows:
        start = int(window['startFrame'])
        end = int(window['endFrame'])
        rules = window.get('rules', [])
        for frame in frames:
            sprite_frame = int(frame['spriteFrame'])
            if sprite_frame < start or sprite_frame > end:
                continue
            for rule in rules:
                matched = evaluate_rule(frame, rule)
                if not matched:
                    continue
                failures.append({
                    'window': window['name'],
                    'ruleId': rule['id'],
                    'ruleLabel': rule.get('label', rule['id']),
                    'spriteFrame': sprite_frame,
                    'tag': frame.get('tag'),
                    'details': matched,
                })
    return {
        'schema': 'pose-lab-bad-frame-audit-v1',
        'poseclip': args.poseclip,
        'attackName': clip.get('userData', {}).get('attackName'),
        'appliedRuleSet': ruleset.get('kind'),
        'checkedFrames': len(frames),
        'failureCount': len(failures),
        'failures': failures,
    }


def main():
    parser = argparse.ArgumentParser(description='Audit baked poseclips for visually banned bad frames.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_axekick_sf2.poseclip.json')
    args = parser.parse_args()
    print(json.dumps(audit(args), indent=2))


if __name__ == '__main__':
    main()
