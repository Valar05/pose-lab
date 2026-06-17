#!/usr/bin/env python3
import json
import math
from pathlib import Path

ROOT = Path('/storage/emulated/0/Documents/GodotProjects/pose-lab')
DEFAULT_POSECLIP = ROOT / 'assets/pose_indexes/ares_axekick_sf2.poseclip.json'
DEFAULT_MODEL = ROOT / 'assets/models/gravity_fist/Ares.glb'


def project_path(value):
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def rel(path):
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def load_json(path):
    return json.loads(project_path(path).read_text())


def write_json(path, payload):
    project_path(path).parent.mkdir(parents=True, exist_ok=True)
    project_path(path).write_text(json.dumps(payload, indent=2) + '\n')


def clip_payload(poseclip_payload):
    return poseclip_payload.get('clip', poseclip_payload)


def infer_poseclip_stem(path):
    name = Path(path).name
    if name.endswith('.poseclip.json'):
        return name[:-len('.poseclip.json')]
    return Path(name).stem


def infer_evidence_path(poseclip_path):
    poseclip_path = project_path(poseclip_path)
    return poseclip_path.with_name(f'{infer_poseclip_stem(poseclip_path)}_visual_evidence.json')


def infer_reduction_path(poseclip_path):
    poseclip_path = project_path(poseclip_path)
    stem = infer_poseclip_stem(poseclip_path)
    if stem.endswith('_sf2'):
        return poseclip_path.with_name(f'{stem}_reduction.json')
    return poseclip_path.with_name(f'{stem}_sf2_reduction.json')


def infer_index_path(poseclip_path):
    poseclip_path = project_path(poseclip_path)
    stem = infer_poseclip_stem(poseclip_path)
    if stem.endswith('_sf2'):
        stem = stem[:-4]
    return poseclip_path.with_name(f'{stem}_index.json')


def track_stride(track):
    if track.get('type') == 'quaternion':
        return 4
    if track.get('type') == 'vector':
        return 3
    return 1


def track_by_name(clip, name):
    for track in clip.get('tracks', []):
        if track.get('name') == name:
            return track
    return None


def sample_track_at_time(track, time_value, exact=False, epsilon=0.0003):
    times = [float(value) for value in track.get('times', [])]
    if not times:
        return None
    if exact:
        matches = [idx for idx, value in enumerate(times) if abs(value - time_value) <= epsilon]
        if not matches:
            return None
        idx = matches[0]
    else:
        idx = min(range(len(times)), key=lambda item: abs(times[item] - time_value))
    stride = track_stride(track)
    start = idx * stride
    values = track.get('values', [])[start:start + stride]
    return [float(value) for value in values]


def sample_track_at_frame(track, frame, fps=60):
    return sample_track_at_time(track, round(frame / fps, 5), exact=False)


def distance(a, b):
    if a is None or b is None or len(a) != len(b):
        return 0.0
    return math.sqrt(sum((a[idx] - b[idx]) ** 2 for idx in range(len(a))))


def evidence_slots_for_poseclip(poseclip_path):
    evidence_path = infer_evidence_path(poseclip_path)
    if evidence_path.exists():
        return load_json(evidence_path).get('captureSlots', [])
    clip = clip_payload(load_json(poseclip_path))
    reduction = clip.get('userData', {}).get('sourceReduction', {})
    slots = []
    for frame in reduction.get('spriteFrames', []):
        sprite_frame = int(frame.get('spriteFrame', 0))
        slots.append({
            'evidenceKey': f'generated:f{sprite_frame:03d}:{frame.get("tag", "pose")}',
            'tag': frame.get('tag'),
            'spriteFrame': sprite_frame,
            'poseclipTime': round(sprite_frame / 60, 5),
            'sourceTime': frame.get('sourceTime'),
            'description': frame.get('description', ''),
            'overlayPhases': [],
        })
    return slots


def slots_by_tag(slots):
    return {slot.get('tag'): slot for slot in slots}


def source_reduction(clip):
    return clip.get('userData', {}).get('sourceReduction', {})


def sprite_frames(clip):
    return source_reduction(clip).get('spriteFrames', [])


def frame_by_tag(clip, tag):
    for frame in sprite_frames(clip):
        if frame.get('tag') == tag:
            return frame
    return None


def hold_frames(clip, start_tag, end_tag):
    start = frame_by_tag(clip, start_tag)
    end = frame_by_tag(clip, end_tag)
    if not start or not end:
        return 0
    return int(end.get('spriteFrame', 0)) - int(start.get('spriteFrame', 0))


def track_total_delta(clip, track_names, start_frame=None, end_frame=None):
    frames = sprite_frames(clip)
    if not frames:
        return 0.0
    start_frame = int(frames[0].get('spriteFrame', 0) if start_frame is None else start_frame)
    end_frame = int(frames[-1].get('spriteFrame', 0) if end_frame is None else end_frame)
    total = 0.0
    for name in track_names:
        track = track_by_name(clip, name)
        if not track:
            continue
        total += distance(sample_track_at_frame(track, start_frame), sample_track_at_frame(track, end_frame))
    return round(total, 6)


def changed_track_names(base_clip, candidate_clip, min_delta=1e-6):
    base = {track.get('name'): track for track in base_clip.get('tracks', [])}
    candidate = {track.get('name'): track for track in candidate_clip.get('tracks', [])}
    names = sorted(set(base) | set(candidate))
    out = []
    for name in names:
        a = base.get(name)
        b = candidate.get(name)
        if not a or not b:
            out.append({'name': name, 'status': 'added' if b else 'removed', 'maxDelta': None})
            continue
        stride = min(track_stride(a), track_stride(b))
        count = min(len(a.get('values', [])), len(b.get('values', []))) // stride
        max_delta = 0.0
        for idx in range(count):
            av = [float(value) for value in a['values'][idx * stride:idx * stride + stride]]
            bv = [float(value) for value in b['values'][idx * stride:idx * stride + stride]]
            max_delta = max(max_delta, distance(av, bv))
        if max_delta > min_delta:
            out.append({'name': name, 'status': 'changed', 'maxDelta': round(max_delta, 6)})
    return out
