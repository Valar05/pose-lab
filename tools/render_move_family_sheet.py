#!/usr/bin/env python3
import argparse
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw
from poseclip_workflow_lib import load_json, project_path, rel

ROOT = Path('/storage/emulated/0/Documents/GodotProjects/pose-lab')


def run_renderer(poseclip, out_dir, view='xz'):
    subprocess.run([
        'python3', str(project_path('tools/render_poseclip_stickframes.py')),
        '--poseclip', str(project_path(poseclip)), '--out', str(project_path(out_dir)), '--view', view, '--frames', 'read'
    ], cwd=project_path('.'), check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return load_json(project_path(out_dir) / 'manifest.json')


def main():
    parser = argparse.ArgumentParser(description='Render a quick comparison sheet for a move family.')
    parser.add_argument('--family', default='kicks', choices=['kicks', 'punches', 'all'])
    parser.add_argument('--out', default='generated/family_sheets/kicks')
    parser.add_argument('--view', default='xz', choices=['xy', 'xz', 'zy'])
    args = parser.parse_args()
    manifest = load_json('assets/pose_indexes/ares_sf2_attack_batch_manifest.json')
    attacks = manifest.get('attacks', [])
    if args.family == 'kicks':
        attacks = [attack for attack in attacks if attack.get('attackStyle') == 'kick']
    elif args.family == 'punches':
        attacks = [attack for attack in attacks if attack.get('attackStyle') == 'punch']
    out_dir = project_path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for attack in attacks:
        stem = Path(attack['poseclip']).name.replace('.poseclip.json', '')
        render_dir = out_dir / stem
        render_manifest = run_renderer(attack['poseclip'], render_dir, args.view)
        frames = {Path(frame['png']).stem.split('_', 1)[1]: project_path(frame['png']) for frame in render_manifest.get('frames', [])}
        rows.append({'attackName': attack['attackName'], 'frames': frames, 'poseclip': attack['poseclip']})
    phase_order = ['anticipation', 'anticipationHold', 'contact', 'contactHold', 'recoil', 'recoilSettle']
    cell_w, cell_h = 320, 240
    canvas = Image.new('RGB', (cell_w * len(phase_order), cell_h * max(1, len(rows))), '#101820')
    draw = ImageDraw.Draw(canvas)
    for row_idx, row in enumerate(rows):
        for col_idx, tag in enumerate(phase_order):
            x = col_idx * cell_w
            y = row_idx * cell_h
            draw.rectangle([x, y, x + cell_w - 1, y + cell_h - 1], outline='#2d3b45')
            img_path = row['frames'].get(tag)
            if img_path and img_path.exists():
                img = Image.open(img_path).convert('RGB').resize((cell_w, cell_h))
                canvas.paste(img, (x, y))
            draw.text((x + 8, y + 8), f"{row['attackName']} {tag}", fill='#ffffff')
    sheet_path = out_dir / 'family_sheet.png'
    canvas.save(sheet_path)
    report = {
        'schema': 'pose-lab-move-family-sheet-v1',
        'family': args.family,
        'view': args.view,
        'rows': len(rows),
        'sheet': rel(sheet_path),
        'attacks': [row['attackName'] for row in rows],
    }
    (out_dir / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
