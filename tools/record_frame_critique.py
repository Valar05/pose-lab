#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/storage/emulated/0/Documents/GodotProjects/pose-lab')
OUT_DIR = ROOT / 'assets' / 'pose_indexes'


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


def load_json(path):
    return json.loads(Path(path).read_text())


def main():
    parser = argparse.ArgumentParser(description='Attach compact grease-pencil style critique notes to a pose visual evidence slot.')
    parser.add_argument('--attack', required=True, help='Runtime attack name, for example AxeKick')
    parser.add_argument('--tag', help='Pose tag such as anticipation, snap, contact, or recoil')
    parser.add_argument('--frame', type=int, help='Generated 60fps sprite frame number')
    parser.add_argument('--comment', required=True, help='Short critique comment to attach to the frame')
    parser.add_argument('--mark', action='append', default=[], help='Optional short mark label, repeatable')
    parser.add_argument('--bone', action='append', default=[], help='Optional bone name to call out, repeatable')
    parser.add_argument('--evidence', help='Override evidence JSON path')
    args = parser.parse_args()

    if not args.tag and args.frame is None:
        parser.error('provide --tag or --frame')

    evidence_path = Path(args.evidence) if args.evidence else OUT_DIR / f'ares_{safe_stem(args.attack)}_sf2_visual_evidence.json'
    payload = load_json(evidence_path)
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
    payload['critiqueMode'] = {
        'kind': 'grease-pencil-comment-v1',
        'enabled': True,
        'reason': 'Keep critique compact and frame-local: attach short comments and frame marks directly to a specific capture slot instead of writing a giant packet note.',
        'frameControls': True,
        'notes': 'Use this when you want to draw a picture in a way the agent can remember and understand.',
    }
    annotations = slot.setdefault('annotations', [])
    annotations.append({
        'createdAt': now,
        'kind': 'grease-pencil-comment',
        'comment': args.comment,
        'marks': [mark for mark in args.mark if mark],
        'bones': [bone for bone in args.bone if bone],
        'frameControl': {
            'tag': slot.get('tag'),
            'spriteFrame': slot.get('spriteFrame'),
            'evidenceKey': slot.get('evidenceKey'),
        },
    })
    if args.comment:
        notes = slot.setdefault('notes', [])
        notes.append({'createdAt': now, 'text': args.comment})

    evidence_path.write_text(json.dumps(payload, indent=2) + '\n')

    print(json.dumps({
        'schema': 'pose-lab-frame-critique-note-v1',
        'evidence': display_path(evidence_path),
        'evidenceKey': slot.get('evidenceKey'),
        'tag': slot.get('tag'),
        'spriteFrame': slot.get('spriteFrame'),
        'annotations': len(slot.get('annotations', [])),
    }, indent=2))


if __name__ == '__main__':
    main()
