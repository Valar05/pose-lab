#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from poseclip_workflow_lib import project_path, write_json, load_json

DEFAULT_PATH = 'docs/move_grammar_notes.json'
DEFAULT_NOTES = {
    'schema': 'pose-lab-move-grammar-notes-v1',
    'updatedAt': None,
    'notes': {
        'AxeKick': ['compose strike-line upper body with grounded-finish lower body', 'use held heavy contact and overcommit'],
        'FrontKick': ['do not sacrifice snap for pose appeal', 'identity lives in acceleration and recoil'],
        'LowBackKick': ['heavier chamber than AxeKick', 'stage windup, chamber, held chamber, then release'],
    },
}


def load_notes(path):
    target = project_path(path)
    if not target.exists():
        return json.loads(json.dumps(DEFAULT_NOTES))
    return load_json(path)


def main():
    parser = argparse.ArgumentParser(description='Track durable move-grammar notes in repo-local JSON.')
    parser.add_argument('--path', default=DEFAULT_PATH)
    parser.add_argument('--attack')
    parser.add_argument('--note')
    parser.add_argument('--list', action='store_true')
    args = parser.parse_args()
    payload = load_notes(args.path)
    if args.attack and args.note:
        payload.setdefault('notes', {}).setdefault(args.attack, [])
        if args.note not in payload['notes'][args.attack]:
            payload['notes'][args.attack].append(args.note)
        payload['updatedAt'] = datetime.now(timezone.utc).isoformat()
        write_json(args.path, payload)
    if args.list or (not args.attack and not args.note):
        print(json.dumps(payload, indent=2))
    else:
        print(json.dumps({'schema': payload['schema'], 'attack': args.attack, 'count': len(payload['notes'].get(args.attack, []))}, indent=2))


if __name__ == '__main__':
    main()
