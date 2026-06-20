#!/usr/bin/env python3
import argparse
import json
from poseclip_workflow_lib import clip_payload, load_json, project_path, rel

GRAMMARS = {
    'heavy_kick': {
        'coreRules': ['hold anticipation', 'hold contact', 'overcommitted recovery'],
        'identity': 'pose contrast and impact hold',
    },
    'ballistic_front_kick': {
        'coreRules': ['brief anticipation', 'explosive extension', 'minimal contact hold', 'fast recoil'],
        'identity': 'foot-path snap and retraction',
    },
    'heavy_chamber_kick': {
        'coreRules': ['early windup', 'dense chamber', 'held chamber', 'delayed extension'],
        'identity': 'loaded chamber before release',
    },
    'rotational_kick': {
        'coreRules': ['visible chamber', 'rotational acceleration', 'follow-through'],
        'identity': 'rotation and arc commitment',
    },
    'ballistic_punch': {
        'coreRules': ['tiny anticipation', 'huge acceleration', 'immediate recovery'],
        'identity': 'snap and quick reset',
    },
    'headbutt_drive': {
        'coreRules': ['body-led commitment', 'arms sell motion', 'head stays protected'],
        'identity': 'mass drive through torso and arms',
    },
    'generic_attack': {
        'coreRules': ['readable anticipation', 'distinct contact', 'clear recovery'],
        'identity': 'single-glance readability',
    },
}


def infer(attack_name, attack_style=''):
    name = (attack_name or '').lower()
    if name == 'axekick':
        family = 'heavy_kick'
    elif name == 'frontkick':
        family = 'ballistic_front_kick'
    elif name == 'lowbackkick':
        family = 'heavy_chamber_kick'
    elif name in {'spinninghighkick', 'axlekick'}:
        family = 'rotational_kick'
    elif name == 'headbutt':
        family = 'headbutt_drive'
    elif attack_style == 'punch' or any(token in name for token in ['jab', 'cross', 'hook', 'uppercut', 'backfist', 'punch']):
        family = 'ballistic_punch'
    elif attack_style == 'kick' or 'kick' in name:
        family = 'generic_attack'
    else:
        family = 'generic_attack'
    rationale = {
        'heavy_kick': 'Heavy downward kick benefits from authored pose contrast and impact hold.',
        'ballistic_front_kick': 'Front kick identity lives in extension path and retraction, not a long impact freeze.',
        'heavy_chamber_kick': 'This kick reads from a denser chamber before release rather than a broad held contact.',
        'rotational_kick': 'Rotational kicks read from arc, chamber, and follow-through more than static holds.',
        'ballistic_punch': 'Punch identity depends on acceleration and reset more than held poses.',
        'headbutt_drive': 'Headbutt needs mass drive with arms selling the motion instead of generic guard rules.',
        'generic_attack': 'Fallback readable combat grammar when no move-specific family is known.',
    }[family]
    out = dict(GRAMMARS[family])
    out.update({'family': family, 'rationale': rationale})
    return out


def main():
    parser = argparse.ArgumentParser(description='Classify an attack into a reusable move-grammar family.')
    parser.add_argument('--poseclip')
    parser.add_argument('--attack-name')
    args = parser.parse_args()
    attack_name = args.attack_name
    attack_style = ''
    poseclip_rel = None
    if args.poseclip:
        payload = load_json(args.poseclip)
        clip = clip_payload(payload)
        attack_name = attack_name or payload.get('attackName') or clip.get('userData', {}).get('attackName')
        attack_style = clip.get('userData', {}).get('sourceReduction', {}).get('attackStyle', '')
        poseclip_rel = rel(project_path(args.poseclip))
    report = infer(attack_name, attack_style)
    report = {
        'schema': 'pose-lab-attack-grammar-v1',
        'poseclip': poseclip_rel,
        'attackName': attack_name,
        'attackStyle': attack_style or None,
        **report,
    }
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
