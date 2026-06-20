#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def load_json(path):
    return json.loads(Path(path).read_text())


def unwrap_clip(payload):
    if isinstance(payload, dict) and isinstance(payload.get('clip'), dict):
        return payload['clip']
    return payload


def critique_summary(payload):
    clip = unwrap_clip(payload)
    critique = (clip or {}).get('userData', {}).get('critique') or {}
    note = critique.get('note') or {}
    bone_edits = critique.get('boneEdits') or []
    return {
        'schema': 'pose-lab-critique-snapshot-report-v1',
        'hasCritique': bool(critique),
        'clipName': (clip or {}).get('name', ''),
        'frameKey': critique.get('frameKey', ''),
        'frameTag': critique.get('frameTag', ''),
        'spriteFrame': critique.get('spriteFrame'),
        'sourceTime': critique.get('sourceTime'),
        'noteComment': note.get('comment', ''),
        'noteMarkCount': len(note.get('marks') or []),
        'noteBoneCount': len(note.get('bones') or []),
        'boneEditCount': len(bone_edits),
        'editedBones': [str(entry.get('boneName') or entry.get('name') or '') for entry in bone_edits if entry.get('boneName') or entry.get('name')],
        'savedAt': critique.get('savedAt', ''),
    }


def main():
    parser = argparse.ArgumentParser(description='Report saved critique snapshot metadata from an exported poseclip or draft payload.')
    parser.add_argument('--clip', required=True, help='poseclip JSON or exported draft JSON')
    parser.add_argument('--pretty', action='store_true', help='pretty-print JSON output')
    args = parser.parse_args()
    summary = critique_summary(load_json(args.clip))
    print(json.dumps(summary, indent=2 if args.pretty else None))


if __name__ == '__main__':
    main()
