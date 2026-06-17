#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from poseclip_workflow_lib import ROOT, project_path, rel

ALLOWED_WRITE_ROOTS = [
    ROOT / 'assets/pose_indexes',
    ROOT / 'assets/pose_evidence',
    ROOT / 'generated/pose_renders',
    ROOT / 'generated/pose_overwrites',
    ROOT / 'generated/pose_write_tests',
]

SCHEMA_KINDS = {
    'poseclip': {'pose-lab-animation-clip-v1'},
    'visual-evidence': {'pose-lab-visual-evidence-v1'},
    'reduction': {'pose-lab-sf2-reduction-v1'},
    'index': {'pose-lab-attack-index-v1'},
    'render-manifest': {'pose-lab-stickframe-render-v1'},
    'score': {'pose-lab-sf2-local-score-v1'},
    'phase-candidates': {'pose-lab-phase-candidates-v1'},
    'anticipation-candidates': {'pose-lab-source-anticipation-candidates-v1'},
    'timing-variant': {'pose-lab-sf2-timing-variant-v1'},
    'overlay-plan': {'pose-lab-overlay-motion-plan-v1'},
    'cache-audit': {'pose-lab-cache-key-audit-v1'},
    'critique-packet-build': {'pose-lab-critique-packet-build-v1'},
}


def fail(message, code=2):
    print(json.dumps({'ok': False, 'error': message}, indent=2), file=sys.stderr)
    raise SystemExit(code)


def resolved(path):
    return Path(path).resolve()


def assert_allowed_target(target):
    target = resolved(project_path(target))
    for root in ALLOWED_WRITE_ROOTS:
        root = resolved(root)
        try:
            target.relative_to(root)
            return target
        except ValueError:
            continue
    allowed = [rel(root) for root in ALLOWED_WRITE_ROOTS]
    fail(f'target outside allowed pose data roots: {target}; allowed={allowed}')


def load_source(args):
    if args.stdin:
        raw = sys.stdin.read()
        source_label = '<stdin>'
    elif args.source:
        source_path = project_path(args.source)
        raw = source_path.read_text()
        source_label = rel(source_path)
    else:
        fail('provide --source or --stdin')
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f'source is not valid JSON: {exc}')
    return payload, source_label


def payload_schema(payload):
    if isinstance(payload, dict) and isinstance(payload.get('clip'), dict):
        return payload['clip'].get('schema') or payload.get('schema')
    if isinstance(payload, dict):
        return payload.get('schema')
    return None


def detect_kind(payload):
    schema = payload_schema(payload)
    for kind, schemas in SCHEMA_KINDS.items():
        if schema in schemas:
            return kind
    return None


def validate_payload(payload, kind):
    if not isinstance(payload, dict):
        fail('pose data payload must be a JSON object')
    detected = detect_kind(payload)
    schema = payload_schema(payload)
    if kind == 'auto':
        if not detected:
            fail(f'could not infer pose data kind from schema {schema!r}')
        kind = detected
    if kind not in SCHEMA_KINDS:
        fail(f'unknown pose data kind {kind!r}')
    if schema not in SCHEMA_KINDS[kind]:
        fail(f'{kind} requires schema {sorted(SCHEMA_KINDS[kind])}, got {schema!r}')
    if kind == 'poseclip':
        clip = payload.get('clip', payload)
        if not isinstance(clip.get('tracks'), list):
            fail('poseclip must include clip.tracks[]')
        if not clip.get('name'):
            fail('poseclip must include clip.name')
    if kind == 'visual-evidence' and not isinstance(payload.get('captureSlots'), list):
        fail('visual-evidence must include captureSlots[]')
    if kind == 'reduction' and not isinstance(payload.get('spriteFrames'), list):
        fail('reduction must include spriteFrames[]')
    if kind == 'index' and not isinstance(payload.get('analysis'), dict):
        fail('index must include analysis{}')
    if kind == 'render-manifest' and not isinstance(payload.get('frames'), list):
        fail('render-manifest must include frames[]')
    return kind, schema


def stable_json(payload):
    return json.dumps(payload, indent=2) + '\n'


def atomic_write(target, text):
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f'.{target.name}.', suffix='.tmp', dir=str(target.parent))
    try:
        with os.fdopen(fd, 'w') as handle:
            handle.write(text)
        os.replace(tmp_name, target)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def backup_existing(target, backup_dir):
    if not target.exists():
        return None
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = backup_dir / f'{target.name}.{stamp}.bak'
    counter = 1
    while backup.exists():
        backup = backup_dir / f'{target.name}.{stamp}.{counter}.bak'
        counter += 1
    shutil.copy2(target, backup)
    return backup


def main():
    parser = argparse.ArgumentParser(description='Atomically overwrite validated Pose Lab pose data without apply_patch.')
    parser.add_argument('--target', required=True, help='Project-relative target under allowed pose data roots.')
    parser.add_argument('--source', help='JSON source file. Use --stdin to read JSON from stdin.')
    parser.add_argument('--stdin', action='store_true', help='Read JSON payload from stdin.')
    parser.add_argument('--kind', default='auto', choices=['auto', *sorted(SCHEMA_KINDS)], help='Expected pose data kind/schema.')
    parser.add_argument('--allow-new', action='store_true', help='Allow creating a new target file.')
    parser.add_argument('--dry-run', action='store_true', help='Validate only; do not write.')
    parser.add_argument('--backup-dir', default='generated/pose_overwrites/backups')
    args = parser.parse_args()

    target = assert_allowed_target(args.target)
    if not target.exists() and not args.allow_new:
        fail(f'target does not exist; pass --allow-new to create: {rel(target)}')

    payload, source_label = load_source(args)
    kind, schema = validate_payload(payload, args.kind)
    text = stable_json(payload)
    existing_text = target.read_text() if target.exists() else None
    unchanged = existing_text == text
    backup = None

    if not args.dry_run and not unchanged:
        backup = backup_existing(target, project_path(args.backup_dir))
        atomic_write(target, text)

    report = {
        'ok': True,
        'schema': 'pose-lab-pose-data-overwrite-result-v1',
        'target': rel(target),
        'source': source_label,
        'kind': kind,
        'payloadSchema': schema,
        'dryRun': bool(args.dry_run),
        'created': (not target.exists()) if args.dry_run else (backup is None and not unchanged),
        'unchanged': unchanged,
        'backup': rel(backup) if backup else None,
        'bytes': len(text.encode('utf-8')),
    }
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
