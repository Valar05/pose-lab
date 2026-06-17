#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/storage/emulated/0/Documents/GodotProjects/pose-lab')
OUT_DIR = ROOT / 'assets/pose_indexes'


def safe_stem(name):
    out = []
    for char in name:
        if char.isalnum():
            out.append(char.lower())
        elif out and out[-1] != '_':
            out.append('_')
    return ''.join(out).strip('_') or 'attack'


def display_path(path):
    path = Path(path).expanduser()
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def main():
    parser = argparse.ArgumentParser(description='Attach a screenshot path to a generated pose visual evidence slot.')
    parser.add_argument('--attack', required=True, help='Runtime attack name, for example AxeKick')
    parser.add_argument('--tag', help='Pose tag such as anticipation, snap, contact, or recoil')
    parser.add_argument('--frame', type=int, help='Generated 60fps sprite frame number')
    parser.add_argument('--screenshot', required=True, help='Screenshot or video-frame image path to link')
    parser.add_argument('--note', default='', help='Optional visual critique note')
    parser.add_argument('--evidence', help='Override evidence JSON path')
    args = parser.parse_args()

    if not args.tag and args.frame is None:
        parser.error('provide --tag or --frame')

    evidence_path = Path(args.evidence) if args.evidence else OUT_DIR / f'ares_{safe_stem(args.attack)}_sf2_visual_evidence.json'
    payload = json.loads(evidence_path.read_text())
    matches = []
    for slot in payload.get('captureSlots', []):
        if args.tag and slot.get('tag') != args.tag:
            continue
        if args.frame is not None and int(slot.get('spriteFrame')) != args.frame:
            continue
        matches.append(slot)

    if len(matches) != 1:
        raise SystemExit(f'Expected exactly one slot, found {len(matches)} for tag={args.tag!r} frame={args.frame!r}')

    slot = matches[0]
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    slot['screenshot'] = {
        'linked': True,
        'path': display_path(args.screenshot),
        'expectedPath': slot.get('screenshot', {}).get('expectedPath'),
        'linkedAt': now,
    }
    if args.note:
        notes = slot.setdefault('notes', [])
        notes.append({'createdAt': now, 'text': args.note})

    evidence_path.write_text(json.dumps(payload, indent=2) + '\n')
    print(json.dumps({
        'evidence': str(evidence_path.relative_to(ROOT) if evidence_path.is_relative_to(ROOT) else evidence_path),
        'evidenceKey': slot.get('evidenceKey'),
        'tag': slot.get('tag'),
        'spriteFrame': slot.get('spriteFrame'),
        'screenshot': slot['screenshot'],
    }, indent=2))


if __name__ == '__main__':
    main()
