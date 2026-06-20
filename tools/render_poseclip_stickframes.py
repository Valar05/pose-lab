#!/usr/bin/env python3
import argparse
import importlib.util
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path('/storage/emulated/0/Documents/GodotProjects/pose-lab')
BASE_SCRIPT = ROOT / 'tools/index_gravity_fist_jab.py'
DEFAULT_MODEL = ROOT / 'assets/models/gravity_fist/Ares.glb'
DEFAULT_OUT_ROOT = ROOT / 'generated/pose_renders'
CRITIQUE_GUIDE = ROOT / 'docs/SF2_ANIMATION_CRITIQUE_GUIDE.md'

BONE_CHAINS = [
    ('torso', '#d9e2ec', ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head']),
    ('left_arm', '#ff6fb1', ['mixamorig:Spine2', 'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand']),
    ('right_arm', '#ff9a3d', ['mixamorig:Spine2', 'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand']),
    ('left_leg', '#55d68a', ['mixamorig:Hips', 'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot', 'mixamorig:LeftToeBase']),
    ('right_leg', '#49b6ff', ['mixamorig:Hips', 'mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot', 'mixamorig:RightToeBase']),
]

POINT_BONES = {
    'head': ('mixamorig:Head', '#ffe66d'),
    'hips': ('mixamorig:Hips', '#ffe66d'),
    'left_hand': ('mixamorig:LeftHand', '#ff6fb1'),
    'right_hand': ('mixamorig:RightHand', '#ff9a3d'),
    'left_foot': ('mixamorig:LeftFoot', '#55d68a'),
    'right_foot': ('mixamorig:RightFoot', '#49b6ff'),
}


def load_base():
    spec = importlib.util.spec_from_file_location('gravity_fist_jab_indexer', BASE_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def project_path(path):
    path = Path(path)
    if path.is_absolute():
        return path
    return ROOT / path


def rel(path):
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def safe_stem(path):
    name = Path(path).name
    if name.endswith('.poseclip.json'):
        name = name[:-len('.poseclip.json')]
    elif '.' in name:
        name = name.rsplit('.', 1)[0]
    out = []
    for char in name:
        if char.isalnum():
            out.append(char.lower())
        elif out and out[-1] != '_':
            out.append('_')
    return ''.join(out).strip('_') or 'poseclip'


def load_json(path):
    return json.loads(Path(path).read_text())


def infer_evidence_path(poseclip_path):
    stem = Path(poseclip_path).name
    if stem.endswith('.poseclip.json'):
        stem = stem[:-len('.poseclip.json')]
    return Path(poseclip_path).with_name(f'{stem}_visual_evidence.json')


def track_stride(track):
    if track.get('type') == 'quaternion':
        return 4
    if track.get('type') == 'vector':
        return 3
    return 1


def sample_track(track, time_value):
    times = [float(value) for value in track.get('times', [])]
    values = track.get('values', [])
    if not times:
        return None
    nearest = min(range(len(times)), key=lambda idx: abs(times[idx] - time_value))
    stride = track_stride(track)
    start = nearest * stride
    sample = values[start:start + stride]
    if stride == 1:
        return float(sample[0])
    return [float(value) for value in sample]


def build_track_bindings(base, index, tracks):
    bindings = []
    suffix_to_path = {
        'position': 'translation',
        'quaternion': 'rotation',
        'scale': 'scale',
    }
    for track in tracks:
        name = track.get('name', '')
        if '.' not in name:
            continue
        node_name, suffix = name.rsplit('.', 1)
        local_path = suffix_to_path.get(suffix)
        if not local_path:
            continue
        node_index = index.name_to_index.get(base.canonical(node_name))
        if node_index is None:
            continue
        bindings.append((track, node_index, local_path))
    return bindings


def sample_poseclip_world(base, index, bindings, time_value):
    local = {}
    for node_index, node in enumerate(index.nodes):
        local[node_index] = {
            'translation': list(node.get('translation', [0.0, 0.0, 0.0])),
            'rotation': list(node.get('rotation', [0.0, 0.0, 0.0, 1.0])),
            'scale': list(node.get('scale', [1.0, 1.0, 1.0])),
        }
    for track, node_index, local_path in bindings:
        sample = sample_track(track, time_value)
        if sample is not None:
            local[node_index][local_path] = sample

    world = {}

    def compute(node_index):
        if node_index in world:
            return world[node_index]
        parent = index.parents.get(node_index)
        local_state = local[node_index]
        if parent is None:
            value = (
                local_state['translation'],
                base.quat_normalize(local_state['rotation']),
                local_state['scale'],
            )
        else:
            parent_pos, parent_rot, parent_scale = compute(parent)
            value = base.compose_world(
                parent_pos,
                parent_rot,
                parent_scale,
                local_state['translation'],
                base.quat_normalize(local_state['rotation']),
                local_state['scale'],
            )
        world[node_index] = value
        return value

    for node_index in range(len(index.nodes)):
        compute(node_index)
    return world


def evidence_slots(evidence, clip, fps, mode):
    reduction = clip.get('userData', {}).get('sourceReduction', {})
    sprite_frames = reduction.get('spriteFrames', [])
    if mode == 'read':
        if evidence and evidence.get('captureSlots'):
            return list(evidence['captureSlots'])
        slots = []
        for frame in sprite_frames:
            sprite_frame = int(frame['spriteFrame'])
            slots.append({
                'evidenceKey': f"generated:f{sprite_frame:03d}:{frame['tag']}",
                'tag': frame['tag'],
                'spriteFrame': sprite_frame,
                'poseclipTime': round(sprite_frame / fps, 5),
                'sourceTime': frame.get('sourceTime'),
                'description': frame.get('description', ''),
                'overlayPhases': [],
            })
        return slots
    if mode == 'step':
        if evidence and evidence.get('captureSlots'):
            source_slots = list(evidence['captureSlots'])
            source_by_frame = {int(slot.get('spriteFrame', 0)): slot for slot in source_slots}
        else:
            source_by_frame = {int(frame.get('spriteFrame', 0)): frame for frame in sprite_frames}
        if source_by_frame:
            last_frame = max(source_by_frame)
        else:
            duration = float(clip.get('duration', 0.0))
            last_frame = max(0, int(round(duration * fps)))
        slots = []
        for frame_no in range(last_frame + 1):
            source_slot = source_by_frame.get(frame_no, {})
            slots.append({
                'evidenceKey': f'generated:f{frame_no:03d}:step',
                'tag': f'f{frame_no:03d}',
                'markerTag': source_slot.get('tag', ''),
                'spriteFrame': frame_no,
                'poseclipTime': round(frame_no / fps, 5),
                'sourceTime': source_slot.get('sourceTime', round(frame_no / fps, 5)),
                'description': source_slot.get('description', ''),
                'overlayPhases': source_slot.get('overlayPhases', []),
                'contactModifiers': source_slot.get('contactModifiers', []),
                'headDiscipline': source_slot.get('headDiscipline', []),
                'annotations': source_slot.get('annotations', []),
            })
        return slots

    slots = list(evidence['captureSlots']) if evidence and evidence.get('captureSlots') else []
    if not slots:
        slots = []
        for frame in sprite_frames:
            sprite_frame = int(frame['spriteFrame'])
            slots.append({
                'evidenceKey': f"generated:f{sprite_frame:03d}:{frame['tag']}",
                'tag': frame['tag'],
                'spriteFrame': sprite_frame,
                'poseclipTime': round(sprite_frame / fps, 5),
                'sourceTime': frame.get('sourceTime'),
                'description': frame.get('description', ''),
                'overlayPhases': [],
            })
    duration = float(clip.get('duration', 0.0))
    last_frame = max(0, int(round(duration * fps)))
    by_frame = {int(slot.get('spriteFrame', 0)): slot for slot in slots}
    all_slots = []
    for frame_no in range(last_frame + 1):
        slot = dict(by_frame.get(frame_no, {}))
        slot.setdefault('evidenceKey', f'generated:f{frame_no:03d}:baked')
        slot.setdefault('tag', slot.get('tag') or 'baked')
        slot['spriteFrame'] = frame_no
        slot.setdefault('poseclipTime', round(frame_no / fps, 5))
        slot.setdefault('description', '')
        slot.setdefault('overlayPhases', [])
        all_slots.append(slot)
    return all_slots

def axis_pair(view):
    if view == 'xz':
        return 0, 2
    if view == 'zy':
        return 2, 1
    return 0, 1


def node_index(base, index, bone_name):
    return index.name_to_index.get(base.canonical(bone_name))


def frame_points(base, index, world, view):
    ax, ay = axis_pair(view)
    points = {}
    for _, _, chain in BONE_CHAINS:
        for bone in chain:
            idx = node_index(base, index, bone)
            if idx is not None and idx in world:
                pos = world[idx][0]
                points[bone] = (pos[ax], pos[ay])
    return points


def build_projection_bounds(base, index, sampled, view):
    xs = []
    ys = []
    for world in sampled:
        points = frame_points(base, index, world, view)
        for x, y in points.values():
            xs.append(x)
            ys.append(y)
    if not xs or not ys:
        return (-1.0, 1.0, -1.0, 1.0)
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    if abs(max_x - min_x) < 1e-5:
        min_x -= 1.0
        max_x += 1.0
    if abs(max_y - min_y) < 1e-5:
        min_y -= 1.0
        max_y += 1.0
    pad_x = (max_x - min_x) * 0.12
    pad_y = (max_y - min_y) * 0.12
    return (min_x - pad_x, max_x + pad_x, min_y - pad_y, max_y + pad_y)


def projector(bounds, width, height):
    min_x, max_x, min_y, max_y = bounds
    left, top, right, bottom = 56, 112, width - 56, height - 92
    scale = min((right - left) / (max_x - min_x), (bottom - top) / (max_y - min_y))
    used_w = (max_x - min_x) * scale
    used_h = (max_y - min_y) * scale
    off_x = left + ((right - left) - used_w) * 0.5
    off_y = top + ((bottom - top) - used_h) * 0.5

    def project(point):
        x, y = point
        px = off_x + (x - min_x) * scale
        py = off_y + (max_y - y) * scale
        return (px, py)

    return project


def wrap_text(text, width):
    words = str(text or '').split()
    lines = []
    current = ''
    for word in words:
        candidate = f'{current} {word}'.strip()
        if len(candidate) > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or ['']


def draw_text_block(draw, pos, lines, fill, line_height=18):
    x, y = pos
    for line in lines:
        draw.text((x, y), line, fill=fill)
        y += line_height


def draw_frame(base, index, world, slot, output_path, bounds, width, height, view, title):
    image = Image.new('RGB', (width, height), '#101820')
    draw = ImageDraw.Draw(image)
    project = projector(bounds, width, height)

    draw.rectangle((0, 0, width, 78), fill='#15232f')
    draw.rectangle((0, height - 58, width, height), fill='#15232f')
    draw.text((24, 18), title, fill='#f7f3e8')
    draw.text((24, 42), f"f{int(slot.get('spriteFrame', 0)):03d}  {slot.get('markerTag') or slot.get('tag', 'pose')}  t={float(slot.get('poseclipTime', 0.0)):.5f}s  view={view}", fill='#a7c7e7')

    for _, color, chain in BONE_CHAINS:
        chain_points = []
        for bone in chain:
            idx = node_index(base, index, bone)
            if idx is None or idx not in world:
                continue
            pos = world[idx][0]
            ax, ay = axis_pair(view)
            chain_points.append(project((pos[ax], pos[ay])))
        for first, second in zip(chain_points, chain_points[1:]):
            draw.line((first, second), fill=color, width=7)
        for point in chain_points:
            x, y = point
            draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=color)

    for label, (bone, color) in POINT_BONES.items():
        idx = node_index(base, index, bone)
        if idx is None or idx not in world:
            continue
        pos = world[idx][0]
        ax, ay = axis_pair(view)
        x, y = project((pos[ax], pos[ay]))
        draw.ellipse((x - 9, y - 9, x + 9, y + 9), outline=color, width=3)
        draw.text((x + 10, y - 10), label.replace('_', ' '), fill=color)

    description = slot.get('description') or ''
    overlays = slot.get('overlayPhases') or []
    overlay_text = ', '.join([phase.get('tag', phase.get('mode', 'overlay')) for phase in overlays]) or 'none'
    modifiers = slot.get('contactModifiers') or []
    modifier_text = ', '.join([modifier.get('tag', modifier.get('kind', 'modifier')) for modifier in modifiers]) or 'none'
    head_modifiers = slot.get('headDiscipline') or []
    head_text = ', '.join([modifier.get('tag', modifier.get('kind', 'head')) for modifier in head_modifiers]) or 'none'
    footer = [
        f"source={slot.get('sourceClipName', '')} @{slot.get('sourceTime', '')}",
        f"desc: {description}",
        f"overlay: {overlay_text}",
        f"modifier: {modifier_text}",
        f"head: {head_text}",
        f"evidence: {slot.get('evidenceKey', '')}",
    ]
    draw_text_block(draw, (24, height - 48), footer[:1], '#f7f3e8')
    draw_text_block(draw, (width * 0.33, height - 48), wrap_text(footer[1], 58)[:2], '#d9e2ec')
    draw_text_block(draw, (width * 0.72, height - 48), wrap_text(footer[2], 34)[:2], '#f8c471')

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)


def duration_to_next(slots, index, fps, clip_duration):
    current = int(slots[index].get('spriteFrame', 0))
    if index + 1 < len(slots):
        next_frame = int(slots[index + 1].get('spriteFrame', current + 1))
        return max(1.0 / fps, (next_frame - current) / fps)
    current_time = current / fps
    return max(1.0 / fps, clip_duration - current_time)


def ffconcat_quote(path):
    return str(path).replace("'", "'\\''")


def artifact_path(value):
    path = Path(value)
    if path.is_absolute():
        return path
    return ROOT / path


def stitch_video(out_dir, frame_entries, video_path, fps):
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        return None, 'ffmpeg not found'
    concat_path = out_dir / 'frames.ffconcat'
    lines = ['ffconcat version 1.0']
    for entry in frame_entries:
        lines.append(f"file '{ffconcat_quote(artifact_path(entry['png']).resolve())}'")
        lines.append(f"duration {entry['durationToNext']:.5f}")
    if frame_entries:
        lines.append(f"file '{ffconcat_quote(artifact_path(frame_entries[-1]['png']).resolve())}'")
    concat_path.write_text('\n'.join(lines) + '\n')
    command = [
        ffmpeg,
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        str(concat_path),
        '-r',
        str(fps),
        '-pix_fmt',
        'yuv420p',
        str(video_path),
    ]
    result = subprocess.run(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        return None, result.stderr[-1200:]
    return video_path, None


def stitch_gif(frame_entries, gif_path):
    if not frame_entries:
        return None, 'no frames to stitch'
    frames = []
    durations = []
    for entry in frame_entries:
        frame_path = artifact_path(entry['png'])
        frames.append(Image.open(frame_path).convert('P', palette=Image.ADAPTIVE))
        raw_ms = float(entry.get('durationToNext', 1.0 / 60.0)) * 1000
        durations.append(max(20, int(round(raw_ms / 10.0) * 10)))
    gif_path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        gif_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
    )
    return gif_path, None


def write_critique_packet(out_dir, manifest):
    packet_path = out_dir / 'critique_packet.md'
    frames = manifest.get('frames', [])
    lines = [
        f"# {manifest.get('actorLabel') or manifest.get('actorKey') or 'Actor'} {manifest.get('attackName') or manifest.get('clipName') or 'Poseclip'} Critique Packet",
        '',
        'Use this packet with `docs/SF2_ANIMATION_CRITIQUE_GUIDE.md` as the scoring standard.',
        '',
        '## Render Artifacts',
        '',
        f"- Manifest: `{rel(out_dir / 'manifest.json')}`",
        f"- Critique guide: `{rel(CRITIQUE_GUIDE)}`",
        f"- Critique mode: `{manifest.get('critiqueMode', {}).get('kind', 'standard')}`",
        f"- Poseclip: `{manifest.get('poseclip')}`",
        f"- Evidence: `{manifest.get('evidence')}`",
        f"- Video: `{manifest.get('video') or 'not generated'}`",
        f"- Timed GIF: `{manifest.get('animationGif') or 'not generated'}`",
        '',
        '## Critique Instructions',
        '',
        'Evaluate the animation as a Street Fighter II-inspired fighting-game move, not as realistic mocap.',
        'Score each category 0-10: Readability, Anticipation, Commitment, Contact, Recovery, Weight, Silhouette, Move Identity, SF2 Feel.',
        'Prioritize whether each pose reads in a single glance. Contact and anticipation frames should be judged as screenshots first and motion second.',
        '',
        '## Pose Frames',
        '',
    ]
    for frame in frames:
        overlays = ', '.join(phase.get('tag', phase.get('mode', 'overlay')) for phase in frame.get('overlayPhases', [])) or 'none'
        modifiers = ', '.join(modifier.get('tag', modifier.get('kind', 'modifier')) for modifier in frame.get('contactModifiers', [])) or 'none'
        head_discipline = ', '.join(modifier.get('tag', modifier.get('kind', 'head')) for modifier in frame.get('headDiscipline', [])) or 'none'
        annotations = frame.get('annotations', [])
        lines.extend([
            f"### f{int(frame.get('spriteFrame', 0)):03d} {frame.get('tag', 'pose')}",
            '',
            f"- PNG: `{frame.get('png')}`",
            f"- Duration to next: `{frame.get('durationToNext')}` seconds",
            f"- Poseclip time: `{frame.get('poseclipTime')}` seconds",
            f"- Source: `{frame.get('sourceClipName')}` at `{frame.get('sourceTime')}` seconds",
            f"- Description: {frame.get('description') or 'none'}",
        f"- Marker: {frame.get('markerTag') or 'none'}",
            f"- Overlay phases: {overlays}",
            f"- Contact modifiers: {modifiers}",
            f"- Head discipline: {head_discipline}",
            f"- Evidence key: `{frame.get('evidenceKey')}`",
            f"- Annotations: {len(annotations) if isinstance(annotations, list) else 0}",
            '' if not annotations else '- Note: ' + ' | '.join((note.get('comment') or note.get('text') or '').strip() for note in annotations if (note.get('comment') or note.get('text'))),
            '',
        ])
    packet_path.write_text('\n'.join(lines).rstrip() + '\n')
    return packet_path


def render(args):
    base = load_base()
    poseclip_path = project_path(args.poseclip)
    model_path = project_path(args.model)
    out_dir = project_path(args.out) if args.out else DEFAULT_OUT_ROOT / safe_stem(poseclip_path)
    evidence_path = project_path(args.evidence) if args.evidence else infer_evidence_path(poseclip_path)

    payload = load_json(poseclip_path)
    clip = payload.get('clip', payload)
    evidence = load_json(evidence_path) if evidence_path.exists() else None
    index = base.GLBAnimationIndex(model_path)
    bindings = build_track_bindings(base, index, clip.get('tracks', []))
    slots = evidence_slots(evidence, clip, args.fps, args.frames)
    worlds = [sample_poseclip_world(base, index, bindings, float(slot.get('poseclipTime', int(slot.get('spriteFrame', 0)) / args.fps))) for slot in slots]
    bounds = build_projection_bounds(base, index, worlds, args.view)
    title = f"{payload.get('actorLabel', payload.get('actorKey', 'Actor'))} {payload.get('attackName', clip.get('name', 'Poseclip'))}"

    frame_entries = []
    out_dir.mkdir(parents=True, exist_ok=True)
    clip_duration = float(clip.get('duration', 0.0))
    for idx, (slot, world) in enumerate(zip(slots, worlds)):
        sprite_frame = int(slot.get('spriteFrame', 0))
        tag = str(slot.get('tag', 'pose'))
        png_path = out_dir / f'f{sprite_frame:03d}_{tag}.png'
        draw_frame(base, index, world, slot, png_path, bounds, args.width, args.height, args.view, title)
        entry = {
            'evidenceKey': slot.get('evidenceKey'),
            'tag': tag,
            'markerTag': slot.get('markerTag', ''),
            'spriteFrame': sprite_frame,
            'poseclipTime': float(slot.get('poseclipTime', sprite_frame / args.fps)),
            'sourceClipName': slot.get('sourceClipName'),
            'sourceTime': slot.get('sourceTime'),
            'description': slot.get('description', ''),
            'overlayPhases': slot.get('overlayPhases', []),
            'contactModifiers': slot.get('contactModifiers', []),
            'headDiscipline': slot.get('headDiscipline', []),
            'annotations': slot.get('annotations', []),
            'png': rel(png_path),
            'durationToNext': round(duration_to_next(slots, idx, args.fps, clip_duration), 5),
        }
        frame_entries.append(entry)

    video_entry = None
    video_error = None
    animation_gif = None
    animation_error = None
    if args.video:
        video_path = out_dir / f'{safe_stem(poseclip_path)}_{args.frames}_{args.view}.mp4'
        created, video_error = stitch_video(out_dir, frame_entries, video_path, args.fps)
        if created:
            video_entry = rel(created)
        else:
            gif_path = out_dir / f'{safe_stem(poseclip_path)}_{args.frames}_{args.view}.gif'
            gif_created, animation_error = stitch_gif(frame_entries, gif_path)
            if gif_created:
                animation_gif = rel(gif_created)

    manifest = {
        'schema': 'pose-lab-stickframe-render-v1',
        'renderedAt': datetime.now(timezone.utc).isoformat(),
        'poseclip': rel(poseclip_path),
        'model': rel(model_path),
        'evidence': rel(evidence_path) if evidence_path.exists() else None,
        'actorKey': payload.get('actorKey'),
        'actorLabel': payload.get('actorLabel'),
        'attackName': payload.get('attackName'),
        'clipName': clip.get('name'),
        'fps': args.fps,
        'framesMode': args.frames,
        'view': args.view,
        'size': {'width': args.width, 'height': args.height},
        'boneChains': [{'name': name, 'bones': chain} for name, _, chain in BONE_CHAINS],
        'frames': frame_entries,
        'video': video_entry,
        'videoError': video_error,
        'animationGif': animation_gif,
        'animationError': animation_error,
        'critiqueGuide': rel(CRITIQUE_GUIDE) if CRITIQUE_GUIDE.exists() else None,
        'critiqueMode': (evidence or {}).get('critiqueMode', {'kind': 'standard'}),
    }
    packet_path = write_critique_packet(out_dir, manifest)
    manifest['critiquePacket'] = rel(packet_path)
    manifest_path = out_dir / 'manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({
        'manifest': rel(manifest_path),
        'frames': len(frame_entries),
        'video': video_entry,
        'videoError': video_error,
        'animationGif': animation_gif,
        'animationError': animation_error,
        'critiquePacket': rel(packet_path),
    }, indent=2))


def main():
    parser = argparse.ArgumentParser(description='Render baked poseclip frames as bone-aware stickframe PNGs and optional timed video.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_axekick_sf2.poseclip.json')
    parser.add_argument('--model', default=str(DEFAULT_MODEL))
    parser.add_argument('--evidence')
    parser.add_argument('--out')
    parser.add_argument('--frames', choices=['read', 'step', 'all'], default='read')
    parser.add_argument('--fps', type=int, default=60)
    parser.add_argument('--width', type=int, default=960)
    parser.add_argument('--height', type=int, default=720)
    parser.add_argument('--view', choices=['xy', 'xz', 'zy'], default='xy')
    parser.add_argument('--video', action='store_true', default=False)
    parser.add_argument('--no-video', dest='video', action='store_false')
    args = parser.parse_args()
    render(args)


if __name__ == '__main__':
    main()
