#!/usr/bin/env python3
import json
import math
import struct
from bisect import bisect_right
from pathlib import Path

ROOT = Path('/storage/emulated/0/Documents/GodotProjects/pose-lab')
ARES_GLB = ROOT / 'assets/models/gravity_fist/Ares.glb'
ATTACKS_JSON = ROOT / 'assets/data/gravity_fist_player_attacks.json'
OUT_INDEX = ROOT / 'assets/pose_indexes/ares_jab_index.json'
OUT_REDUCED = ROOT / 'assets/pose_indexes/ares_jab_sf2_reduction.json'
OUT_CRITIQUE = ROOT / 'assets/pose_indexes/ares_jab_sf2_critique.md'
OUT_POSECLIP = ROOT / 'assets/pose_indexes/ares_jab_sf2.poseclip.json'

COMPONENT_TYPE = {
    5120: ('b', 1),
    5121: ('B', 1),
    5122: ('h', 2),
    5123: ('H', 2),
    5125: ('I', 4),
    5126: ('f', 4),
}
TYPE_COUNT = {
    'SCALAR': 1,
    'VEC2': 2,
    'VEC3': 3,
    'VEC4': 4,
    'MAT2': 4,
    'MAT3': 9,
    'MAT4': 16,
}
WATCH_NAMES = {
    'hips': ['mixamorig:Hips', 'mixamorigHips', 'Hips'],
    'head': ['mixamorig:Head', 'mixamorigHead', 'Head'],
    'left_hand': ['mixamorig:LeftHand', 'mixamorigLeftHand', 'LeftHand'],
    'right_hand': ['mixamorig:RightHand', 'mixamorigRightHand', 'RightHand'],
    'left_foot': ['mixamorig:LeftFoot', 'mixamorigLeftFoot', 'LeftFoot'],
    'right_foot': ['mixamorig:RightFoot', 'mixamorigRightFoot', 'RightFoot'],
    'left_shoulder': ['mixamorig:LeftShoulder', 'mixamorigLeftShoulder', 'LeftShoulder'],
    'right_shoulder': ['mixamorig:RightShoulder', 'mixamorigRightShoulder', 'RightShoulder'],
}


def clamp(value, low, high):
    return max(low, min(high, value))


def round_value(value, digits=5):
    return round(float(value), digits)


def canonical(name):
    return ''.join(ch.lower() for ch in str(name or '') if ch.isalnum())


def vec_add(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def vec_sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def vec_scale(v, s):
    return [v[0] * s, v[1] * s, v[2] * s]


def vec_dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vec_cross(a, b):
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def vec_length(v):
    return math.sqrt(max(0.0, vec_dot(v, v)))


def vec_normalize(v):
    length = vec_length(v)
    if length < 1e-8:
        return [0.0, 0.0, 0.0]
    return [v[0] / length, v[1] / length, v[2] / length]


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_vec(a, b, t):
    return [lerp(a[i], b[i], t) for i in range(len(a))]


def quat_normalize(q):
    length = math.sqrt(sum(part * part for part in q))
    if length < 1e-8:
        return [0.0, 0.0, 0.0, 1.0]
    return [part / length for part in q]


def quat_dot(a, b):
    return sum(a[i] * b[i] for i in range(4))


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ]


def quat_conjugate(q):
    return [-q[0], -q[1], -q[2], q[3]]


def quat_rotate(q, v):
    qv = [v[0], v[1], v[2], 0.0]
    rotated = quat_mul(quat_mul(q, qv), quat_conjugate(q))
    return rotated[:3]


def quat_slerp(a, b, t):
    qa = quat_normalize(a)
    qb = quat_normalize(b)
    dot = quat_dot(qa, qb)
    if dot < 0.0:
        qb = [-part for part in qb]
        dot = -dot
    if dot > 0.9995:
        return quat_normalize([lerp(qa[i], qb[i], t) for i in range(4)])
    theta_0 = math.acos(clamp(dot, -1.0, 1.0))
    theta = theta_0 * t
    sin_theta = math.sin(theta)
    sin_theta_0 = math.sin(theta_0)
    s0 = math.cos(theta) - dot * sin_theta / sin_theta_0
    s1 = sin_theta / sin_theta_0
    return [s0 * qa[i] + s1 * qb[i] for i in range(4)]


def compose_world(parent_pos, parent_rot, parent_scale, local_pos, local_rot, local_scale):
    scaled = [local_pos[i] * parent_scale[i] for i in range(3)]
    world_pos = vec_add(parent_pos, quat_rotate(parent_rot, scaled))
    world_rot = quat_normalize(quat_mul(parent_rot, local_rot))
    world_scale = [parent_scale[i] * local_scale[i] for i in range(3)]
    return world_pos, world_rot, world_scale


class GLBAnimationIndex:
    def __init__(self, path: Path):
        self.path = path
        self.doc, self.binary = self._read_glb(path)
        self.nodes = self.doc.get('nodes', [])
        self.parents = {index: None for index in range(len(self.nodes))}
        for parent_index, node in enumerate(self.nodes):
            for child in node.get('children', []):
                self.parents[child] = parent_index
        self.name_to_index = {}
        for index, node in enumerate(self.nodes):
            name = node.get('name') or f'node_{index}'
            self.name_to_index.setdefault(canonical(name), index)
        self.animations = {anim.get('name', f'anim_{i}'): self._build_animation(anim) for i, anim in enumerate(self.doc.get('animations', []))}

    def _read_glb(self, path: Path):
        data = path.read_bytes()
        magic, version, length = struct.unpack_from('<4sII', data, 0)
        if magic != b'glTF':
            raise ValueError(f'{path} is not a GLB file')
        offset = 12
        json_chunk = None
        bin_chunk = b''
        while offset < length:
            chunk_length, chunk_type = struct.unpack_from('<II', data, offset)
            offset += 8
            chunk_data = data[offset:offset + chunk_length]
            offset += chunk_length
            if chunk_type == 0x4E4F534A:
                json_chunk = json.loads(chunk_data.decode('utf-8'))
            elif chunk_type == 0x004E4942:
                bin_chunk = chunk_data
        if json_chunk is None:
            raise ValueError('GLB missing JSON chunk')
        return json_chunk, bin_chunk

    def _read_accessor(self, accessor_index):
        accessor = self.doc['accessors'][accessor_index]
        buffer_view = self.doc['bufferViews'][accessor['bufferView']]
        component_fmt, component_size = COMPONENT_TYPE[accessor['componentType']]
        count = accessor['count']
        value_count = TYPE_COUNT[accessor['type']]
        offset = buffer_view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = buffer_view.get('byteStride', value_count * component_size)
        out = []
        for item_index in range(count):
            base = offset + item_index * stride
            values = struct.unpack_from('<' + component_fmt * value_count, self.binary, base)
            if value_count == 1:
                out.append(values[0])
            else:
                out.append(list(values))
        return out

    def _build_animation(self, animation):
        channels = {}
        key_times = set()
        for channel in animation.get('channels', []):
            sampler = animation['samplers'][channel['sampler']]
            node_index = channel['target']['node']
            path = channel['target']['path']
            times = [float(v) for v in self._read_accessor(sampler['input'])]
            values = self._read_accessor(sampler['output'])
            interpolation = sampler.get('interpolation', 'LINEAR')
            node_channels = channels.setdefault(node_index, {})
            node_channels[path] = {
                'times': times,
                'values': values,
                'interpolation': interpolation,
            }
            key_times.update(times)
        return {
            'channels': channels,
            'key_times': sorted(key_times),
        }

    def find_node(self, names):
        for name in names:
            match = self.name_to_index.get(canonical(name))
            if match is not None:
                return match
        return None

    def sample_clip(self, clip_name, time_value):
        animation = self.animations[clip_name]
        local = {}
        for node_index, node in enumerate(self.nodes):
            local[node_index] = {
                'translation': list(node.get('translation', [0.0, 0.0, 0.0])),
                'rotation': list(node.get('rotation', [0.0, 0.0, 0.0, 1.0])),
                'scale': list(node.get('scale', [1.0, 1.0, 1.0])),
            }
        for node_index, node_channels in animation['channels'].items():
            for path, channel in node_channels.items():
                local[node_index][path] = self._sample_channel(channel, time_value)
        world = {}

        def compute(node_index):
            if node_index in world:
                return world[node_index]
            parent = self.parents.get(node_index)
            local_state = local[node_index]
            if parent is None:
                value = (
                    local_state['translation'],
                    quat_normalize(local_state['rotation']),
                    local_state['scale'],
                )
            else:
                parent_pos, parent_rot, parent_scale = compute(parent)
                value = compose_world(
                    parent_pos,
                    parent_rot,
                    parent_scale,
                    local_state['translation'],
                    quat_normalize(local_state['rotation']),
                    local_state['scale'],
                )
            world[node_index] = value
            return value

        for node_index in range(len(self.nodes)):
            compute(node_index)
        return world

    def _sample_channel(self, channel, time_value):
        times = channel['times']
        values = channel['values']
        if not times:
            return values[0]
        if time_value <= times[0]:
            return values[0]
        if time_value >= times[-1]:
            return values[-1]
        hi = bisect_right(times, time_value)
        lo = max(0, hi - 1)
        if abs(times[hi] - times[lo]) < 1e-8:
            return values[lo]
        alpha = (time_value - times[lo]) / (times[hi] - times[lo])
        a = values[lo]
        b = values[hi]
        if isinstance(a, list) and len(a) == 4:
            return quat_slerp(a, b, alpha)
        if isinstance(a, list):
            return lerp_vec(a, b, alpha)
        return lerp(a, b, alpha)


def load_jab_metadata():
    payload = json.loads(ATTACKS_JSON.read_text())
    for entry in payload.get('standard', []):
        if entry.get('name') == 'Jab':
            return entry
    raise ValueError('Jab metadata not found')


def build_frame_records(index: GLBAnimationIndex, clip_name: str, metadata):
    animation = index.animations[clip_name]
    key_times = animation['key_times']
    node_indices = {key: index.find_node(names) for key, names in WATCH_NAMES.items()}
    missing = [key for key, value in node_indices.items() if value is None]
    if missing:
        raise ValueError(f'Missing watch nodes: {missing}')

    start_world = index.sample_clip(clip_name, key_times[0])
    hips_idx = node_indices['hips']
    head_idx = node_indices['head']
    ls_idx = node_indices['left_shoulder']
    rs_idx = node_indices['right_shoulder']
    hips_pos = start_world[hips_idx][0]
    head_pos = start_world[head_idx][0]
    left_shoulder_pos = start_world[ls_idx][0]
    right_shoulder_pos = start_world[rs_idx][0]
    up_axis = vec_normalize(vec_sub(head_pos, hips_pos))
    shoulder_axis = vec_normalize(vec_sub(right_shoulder_pos, left_shoulder_pos))
    forward_axis = vec_normalize(vec_cross(shoulder_axis, up_axis))
    if vec_length(forward_axis) < 1e-5:
        forward_axis = [0.0, 0.0, 1.0]

    frames = []
    for idx, time_value in enumerate(key_times):
        world = index.sample_clip(clip_name, time_value)
        points = {}
        for label, node_index in node_indices.items():
            pos, rot, scale = world[node_index]
            points[label] = {
                'position': [round_value(v, 5) for v in pos],
                'rotation': [round_value(v, 5) for v in rot],
                'scale': [round_value(v, 5) for v in scale],
            }
        hips = points['hips']['position']
        left_hand = points['left_hand']['position']
        right_hand = points['right_hand']['position']
        left_foot = points['left_foot']['position']
        right_foot = points['right_foot']['position']
        left_reach = vec_dot(vec_sub(left_hand, hips), forward_axis)
        right_reach = vec_dot(vec_sub(right_hand, hips), forward_axis)
        left_guard = vec_dot(vec_sub(left_hand, hips), up_axis)
        right_guard = vec_dot(vec_sub(right_hand, hips), up_axis)
        hand_span = vec_length(vec_sub(left_hand, right_hand))
        foot_span = vec_length(vec_sub(left_foot, right_foot))
        frames.append({
            'frameIndex': idx,
            'time': round_value(time_value, 5),
            'normalizedTime': round_value(time_value / max(0.0001, key_times[-1]), 5),
            'leftReach': round_value(left_reach, 5),
            'rightReach': round_value(right_reach, 5),
            'leftGuard': round_value(left_guard, 5),
            'rightGuard': round_value(right_guard, 5),
            'handSpan': round_value(hand_span, 5),
            'footSpan': round_value(foot_span, 5),
            'points': points,
        })

    for idx, frame in enumerate(frames):
        prev_frame = frames[idx - 1] if idx > 0 else None
        next_frame = frames[idx + 1] if idx + 1 < len(frames) else None
        motion_in = frame_delta(prev_frame, frame)
        motion_out = frame_delta(frame, next_frame)
        frame['motionIn'] = round_value(motion_in, 5)
        frame['motionOut'] = round_value(motion_out, 5)
        frame['motionTotal'] = round_value(motion_in + motion_out, 5)

    peak_frame = max(frames, key=lambda f: max(abs(f['leftReach']), abs(f['rightReach'])))
    strike_side = 'right' if abs(peak_frame['rightReach']) >= abs(peak_frame['leftReach']) else 'left'
    raw_peak_reach = peak_frame['rightReach'] if strike_side == 'right' else peak_frame['leftReach']
    strike_sign = 1.0 if raw_peak_reach >= 0 else -1.0
    for frame in frames:
        raw_reach = frame['rightReach'] if strike_side == 'right' else frame['leftReach']
        reach = raw_reach * strike_sign
        frame['strikeSide'] = strike_side
        frame['strikeReach'] = round_value(reach, 5)
        frame['semanticTag'] = classify_semantic(frame['time'], metadata, key_times[-1])
        frame['description'] = describe_frame(frame)

    return {
        'clipName': clip_name,
        'duration': round_value(key_times[-1], 5),
        'keyTimes': [round_value(t, 5) for t in key_times],
        'forwardAxis': [round_value(v, 5) for v in forward_axis],
        'upAxis': [round_value(v, 5) for v in up_axis],
        'strikeSide': strike_side,
        'frames': frames,
    }


def frame_delta(a, b):
    if not a or not b:
        return 0.0
    total = 0.0
    for label in ['hips', 'left_hand', 'right_hand', 'left_foot', 'right_foot', 'head']:
        pa = a['points'][label]['position']
        pb = b['points'][label]['position']
        total += vec_length(vec_sub(pa, pb))
    total += abs(a['leftReach'] - b['leftReach']) + abs(a['rightReach'] - b['rightReach'])
    return total


def classify_semantic(time_value, metadata, duration):
    if abs(time_value) < 1e-5:
        return 'start'
    dash_start = float(metadata.get('dash_start', 0.15))
    attack_end = float(metadata.get('attack_end', min(duration, 0.25)))
    if time_value < dash_start * 0.7:
        return 'guard'
    if time_value < dash_start:
        return 'anticipation'
    if time_value <= attack_end:
        return 'strike'
    if time_value <= attack_end + 0.15:
        return 'recovery'
    return 'settle'


def describe_frame(frame):
    reach = frame['strikeReach']
    motion = frame['motionTotal']
    if reach > 0.55:
        reach_label = 'full extension'
    elif reach > 0.32:
        reach_label = 'extended'
    elif reach > 0.18:
        reach_label = 'half extension'
    else:
        reach_label = 'guarded'
    if motion > 0.8:
        motion_label = 'fast transition'
    elif motion > 0.35:
        motion_label = 'readable shift'
    else:
        motion_label = 'held pose'
    guard = max(frame['leftGuard'], frame['rightGuard'])
    guard_label = 'high hands' if guard > 0.5 else 'mid guard' if guard > 0.25 else 'low hands'
    return f"{frame['semanticTag']} {reach_label}, {guard_label}, {motion_label}"


def choose_anchor_frames(index_data, metadata):
    frames = index_data['frames']
    dash_start = float(metadata.get('dash_start', 0.15))
    attack_end = float(metadata.get('attack_end', 0.25))
    strike_side = index_data['strikeSide']

    def best(predicate, score_fn, fallback=None):
        candidates = [frame for frame in frames if predicate(frame)]
        if not candidates:
            return fallback or frames[0]
        return max(candidates, key=score_fn)

    start = frames[0]
    anticipation = best(
        lambda f: 0.0 < f['time'] <= dash_start,
        lambda f: f['motionTotal'] + (f['strikeReach'] * 0.4),
        fallback=start,
    )
    contact = best(
        lambda f: dash_start * 0.8 <= f['time'] <= max(attack_end + 0.08, dash_start + 0.05),
        lambda f: f['strikeReach'] + (f['motionTotal'] * 0.2),
        fallback=anticipation,
    )
    recoil_candidates = [
        f for f in frames
        if f['time'] > contact['time'] and f['time'] <= min(index_data['duration'], attack_end + 0.05)
    ]
    if recoil_candidates:
        recoil = max(
            recoil_candidates,
            key=lambda f: ((contact['strikeReach'] - f['strikeReach']) * 1.3) + (f['motionTotal'] * 0.35),
        )
    else:
        recoil = frames[min(len(frames) - 1, contact['frameIndex'] + 1)]
    settle = best(
        lambda f: f['time'] >= attack_end,
        lambda f: -abs(f['strikeReach'] - start['strikeReach']) - abs(max(f['leftGuard'], f['rightGuard']) - max(start['leftGuard'], start['rightGuard'])) - (f['motionTotal'] * 0.3),
        fallback=frames[-1],
    )

    anchors = []
    seen = set()
    for tag, frame in [('start', start), ('anticipation', anticipation), ('contact', contact), ('recoil', recoil), ('settle', settle)]:
        if frame['frameIndex'] in seen:
            continue
        seen.add(frame['frameIndex'])
        anchors.append({
            'tag': tag,
            'frameIndex': frame['frameIndex'],
            'time': frame['time'],
            'description': frame['description'],
            'strikeSide': strike_side,
            'reach': frame['strikeReach'],
            'motionTotal': frame['motionTotal'],
        })
    anchors.sort(key=lambda entry: entry['time'])
    return anchors


def build_sprite_timing(index_data, metadata, anchors):
    attack_end = float(metadata.get('attack_end', 0.25))
    dash_start = float(metadata.get('dash_start', 0.15))
    total_frames = max(8, round(attack_end * 60))
    pre_hit = max(2, round(dash_start * 60))
    schedule = []
    anchor_map = {entry['tag']: entry for entry in anchors}

    def pick_anchor(*tags):
        for tag in tags:
            if tag in anchor_map:
                return anchor_map[tag]
        return anchors[-1]

    anticipation_anchor = pick_anchor('anticipation', 'contact', 'start')
    contact_anchor = pick_anchor('contact', 'anticipation', 'recoil', 'start')
    recoil_anchor = pick_anchor('recoil', 'contact', 'settle', 'anticipation')
    desired = [
        ('start', 0),
        ('anticipation', max(2, round(pre_hit * 0.67))),
        ('contact', min(total_frames - 4, max(pre_hit, round((contact_anchor['time'] / attack_end) * total_frames)))),
        ('recoil', min(total_frames - 2, max(pre_hit + 2, round((recoil_anchor['time'] / attack_end) * total_frames)))),
        ('settle', total_frames),
    ]
    last = -1
    for tag, frame_no in desired:
        anchor = pick_anchor(tag, 'contact', 'anticipation', 'recoil', 'start', 'settle')
        frame_no = max(last + 1, frame_no)
        schedule.append({
            'tag': tag,
            'spriteFrame': frame_no,
            'sourceFrameIndex': anchor['frameIndex'],
            'sourceTime': anchor['time'],
            'description': anchor['description'],
            'easingOptions': easing_options_for(tag),
        })
        last = frame_no
    holds = []
    for idx, item in enumerate(schedule[:-1]):
        next_item = schedule[idx + 1]
        holds.append({
            'from': item['tag'],
            'to': next_item['tag'],
            'holdFrames': next_item['spriteFrame'] - item['spriteFrame'],
            'easingOptions': item['easingOptions'],
        })
    return {
        'schema': 'pose-lab-sf2-reduction-v1',
        'actorKey': 'ares',
        'clipName': index_data['clipName'],
        'goal': 'Street Fighter 2 style discrete read poses with procedural 3D easing between anchors.',
        'combatWindowSeconds': attack_end,
        'combatWindowFrames60fps': total_frames,
        'discardedTailSeconds': round_value(max(0.0, index_data['duration'] - attack_end), 5),
        'spriteFrames': schedule,
        'segments': holds,
    }


def easing_options_for(tag):
    if tag == 'start':
        return ['hold', 'easeInQuad', 'holdThenSnap']
    if tag == 'anticipation':
        return ['easeOutExpo', 'cubicOut', 'snapLunge']
    if tag == 'contact':
        return ['stepHold', 'criticalDampReturn', 'ballisticRecoil']
    if tag == 'recoil':
        return ['easeOutCubic', 'dampedRecover', 'microOvershoot']
    return ['hold', 'easeOutSine', 'springLow']


def easing_value(name, t):
    t = clamp(t, 0.0, 1.0)
    if name == 'holdThenSnap':
        if t < 0.65:
            return 0.0
        u = (t - 0.65) / 0.35
        return 1.0 - ((1.0 - u) ** 3)
    if name == 'easeOutExpo':
        return 1.0 if t >= 1.0 else 1.0 - math.pow(2.0, -10.0 * t)
    if name == 'stepHold':
        if t < 0.45:
            return 0.0
        u = (t - 0.45) / 0.55
        return 1.0 - ((1.0 - u) ** 2)
    if name == 'dampedRecover':
        return 1.0 - math.exp(-4.0 * t)
    if name == 'easeOutCubic':
        return 1.0 - ((1.0 - t) ** 3)
    return t


def default_segment_easing(from_tag, to_tag):
    if from_tag == 'start' and to_tag == 'anticipation':
        return 'holdThenSnap'
    if from_tag == 'anticipation' and to_tag == 'contact':
        return 'easeOutExpo'
    if from_tag == 'contact' and to_tag == 'recoil':
        return 'stepHold'
    if from_tag == 'recoil' and to_tag == 'settle':
        return 'dampedRecover'
    return 'easeOutCubic'


def build_baked_poseclip(index, clip_name, reduced_data):
    animation = index.animations[clip_name]
    sprite_frames = reduced_data['spriteFrames']
    duration = round_value(reduced_data['combatWindowFrames60fps'] / 60.0, 5)
    output_times = [round_value(frame / 60.0, 5) for frame in range(reduced_data['combatWindowFrames60fps'] + 1)]
    segments = []
    for left, right in zip(sprite_frames, sprite_frames[1:]):
        segments.append({
            'startFrame': left['spriteFrame'],
            'endFrame': right['spriteFrame'],
            'startTime': left['sourceTime'],
            'endTime': right['sourceTime'],
            'easing': default_segment_easing(left['tag'], right['tag']),
            'fromTag': left['tag'],
            'toTag': right['tag'],
        })

    def mapped_source_time(output_time):
        frame = output_time * 60.0
        if frame <= segments[0]['startFrame']:
            return segments[0]['startTime']
        for seg in segments:
            if frame <= seg['endFrame']:
                span = max(1e-6, seg['endFrame'] - seg['startFrame'])
                alpha = (frame - seg['startFrame']) / span
                eased = easing_value(seg['easing'], alpha)
                return lerp(seg['startTime'], seg['endTime'], eased)
        return segments[-1]['endTime']

    tracks = []
    for node_index, node_channels in animation['channels'].items():
        node_name = index.nodes[node_index].get('name') or f'node_{node_index}'
        for path_name, channel in node_channels.items():
            suffix = 'quaternion' if path_name == 'rotation' else 'position' if path_name == 'translation' else path_name
            track_name = node_name + '.' + suffix
            values = []
            for output_time in output_times:
                source_time = mapped_source_time(output_time)
                sample = index._sample_channel(channel, source_time)
                if isinstance(sample, list):
                    values.extend(round_value(v, 6) for v in sample)
                else:
                    values.append(round_value(sample, 6))
            tracks.append({
                'name': track_name,
                'type': 'quaternion' if path_name == 'rotation' else 'vector' if path_name in ('translation', 'scale') else 'number',
                'times': output_times,
                'values': values,
            })

    clip = {
        'schema': 'pose-lab-animation-clip-v1',
        'name': 'Jab [sf2-eased]',
        'duration': duration,
        'userData': {
            'origin': 'cleanup:ares:sf2-jab',
            'cleanup': True,
            'cleanupOp': 'sf2-jab-bake',
            'mode': 'sf2 reduced jab baked from source-time remap',
            'sourceName': clip_name,
            'sourceDuration': reduced_data['combatWindowSeconds'],
            'sourceReduction': reduced_data,
            'segmentEasing': segments,
        },
        'tracks': tracks,
    }
    return {
        'exportedAt': 'offline-script',
        'actorKey': 'ares',
        'actorLabel': 'Ares',
        'clip': clip,
    }


def build_critique(index_data, reduced_data, metadata, anchors):
    frames = index_data['frames']
    duration = index_data['duration']
    attack_end = float(metadata.get('attack_end', 0.25))
    tail = max(0.0, duration - attack_end)
    dense_keys = [b - a for a, b in zip(index_data['keyTimes'], index_data['keyTimes'][1:])]
    avg_gap = sum(dense_keys) / len(dense_keys) if dense_keys else 0.0
    strike_peak = max(frames, key=lambda frame: abs(frame['strikeReach']))
    readable = [frame for frame in frames if frame['time'] <= attack_end + 0.05]
    noisy_tail = [frame for frame in frames if frame['time'] > attack_end + 0.05]
    critique = []
    critique.append('# Ares Jab SF2 Reduction Critique')
    critique.append('')
    critique.append('## Source Read')
    critique.append(f'- Source clip: `{index_data["clipName"]}`')
    critique.append(f'- Original keyed frames: `{len(frames)}` over `{duration:.3f}s`')
    critique.append(f'- Average key spacing: `{avg_gap:.4f}s`')
    critique.append(f'- Gameplay attack end from metadata: `{attack_end:.3f}s`')
    critique.append(f'- Tail beyond gameplay window: `{tail:.3f}s`')
    critique.append(f'- Peak {index_data["strikeSide"]}-hand reach occurs at frame `{strike_peak["frameIndex"]}` time `{strike_peak["time"]:.3f}s`')
    critique.append('')
    critique.append('## Reduction Verdict')
    critique.append(f'- Reduced schedule keeps `{len(reduced_data["spriteFrames"])}` read poses across `{reduced_data["combatWindowFrames60fps"]}` 60fps gameplay frames.')
    critique.append('- This is the right direction if the goal is sprite-era readability rather than mocap completeness.')
    critique.append('- The main win is throwing away the long settle tail and keeping only guard, anticipation, contact, recoil, and settle reads.')
    critique.append('')
    critique.append('## What Survives Well')
    critique.append(f'- Early frames up to `{attack_end:.3f}s` contain the meaningful punch read; there are `{len(readable)}` keyed frames in that useful window.')
    critique.append('- The anticipation to contact jump is strong enough to support a discrete sprite-style hold-then-snap rhythm.')
    critique.append('- The contact read is clear enough to justify a very short active pose, then let easing carry the recoil.')
    critique.append('')
    critique.append('## What Should Be Cut Or Compressed')
    critique.append(f'- Frames after `{attack_end + 0.05:.3f}s` are mostly recovery noise for this use case; `{len(noisy_tail)}` keyed frames live in that tail.')
    critique.append('- If you preserve the whole mocap duration, the jab will read mushy compared to SF2 timing even if the pose quality is good.')
    critique.append('- The reduced form should not preserve every micro wrist or shoulder correction. Those are better treated as easing, not authored reads.')
    critique.append('')
    critique.append('## Recommended Procedural Policy')
    critique.append('- Use discrete source poses at the reduced anchor frames, not every GLB key time.')
    critique.append('- Keep startup and contact transitions snappy with `holdThenSnap` or `easeOutExpo`.')
    critique.append('- Let recoil and settle use damped easing so the 3D model breathes between sprite reads without adding new authored poses.')
    critique.append('- Treat the metadata attack end as the combat truth. Any extra settle should be presentation-only, not hit timing.')
    critique.append('')
    critique.append('## Anchor Frames')
    for anchor in anchors:
        critique.append(f'- `{anchor["tag"]}` at `{anchor["time"]:.3f}s`: {anchor["description"]}')
    critique.append('')
    critique.append('## Risk')
    critique.append('- If the runtime interpolates all bones uniformly, the eased in-between may look too floaty. Hands and shoulders should get stronger easing than hips and feet.')
    critique.append('- If the runtime keeps full root translation during eased holds, the jab may glide instead of reading as a held sprite pose. Root/hip easing likely needs its own curve or clamp.')
    return '\n'.join(critique) + '\n'


def main():
    index = GLBAnimationIndex(ARES_GLB)
    jab_meta = load_jab_metadata()
    clip_name = 'Jab'
    if clip_name not in index.animations:
        raise ValueError(f'Clip {clip_name!r} not found. Available: {sorted(index.animations)}')
    index_data = build_frame_records(index, clip_name, jab_meta)
    anchors = choose_anchor_frames(index_data, jab_meta)
    reduced = build_sprite_timing(index_data, jab_meta, anchors)
    critique = build_critique(index_data, reduced, jab_meta, anchors)

    index_payload = {
        'schema': 'pose-lab-jab-index-v1',
        'actorKey': 'ares',
        'actorLabel': 'Ares',
        'clipName': clip_name,
        'metadata': jab_meta,
        'analysis': index_data,
        'anchors': anchors,
    }
    poseclip = build_baked_poseclip(index, clip_name, reduced)
    OUT_INDEX.write_text(json.dumps(index_payload, indent=2) + '\n')
    OUT_REDUCED.write_text(json.dumps(reduced, indent=2) + '\n')
    OUT_CRITIQUE.write_text(critique)
    OUT_POSECLIP.write_text(json.dumps(poseclip, indent=2) + '\n')
    print(json.dumps({
        'index': str(OUT_INDEX),
        'reduction': str(OUT_REDUCED),
        'critique': str(OUT_CRITIQUE),
        'poseclip': str(OUT_POSECLIP),
        'keyed_frames': len(index_data['frames']),
        'duration': index_data['duration'],
        'combat_window_frames': reduced['combatWindowFrames60fps'],
        'anchors': anchors,
    }, indent=2))


if __name__ == '__main__':
    main()
