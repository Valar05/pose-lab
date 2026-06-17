#!/usr/bin/env python3
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path('/storage/emulated/0/Documents/GodotProjects/pose-lab')
RENDERER = ROOT / 'tools/render_poseclip_stickframes.py'


def load_renderer():
    spec = importlib.util.spec_from_file_location('poseclip_renderer', RENDERER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def project_path(value):
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def node_world(base, index, world, bone):
    idx = index.name_to_index.get(base.canonical(bone))
    if idx is None:
        raise KeyError(bone)
    return world[idx]


def pos_for(base, index, world, bone):
    return node_world(base, index, world, bone)[0]


def metric_frame(base, index, renderer, bindings, slot, view):
    world = renderer.sample_poseclip_world(base, index, bindings, float(slot.get('poseclipTime', int(slot.get('spriteFrame', 0)) / 60)))
    hips = pos_for(base, index, world, 'mixamorig:Hips')
    spine2 = pos_for(base, index, world, 'mixamorig:Spine2')
    head_world = node_world(base, index, world, 'mixamorig:Head')
    head = head_world[0]
    head_forward = base.quat_rotate(head_world[1], [0.0, 0.0, 1.0])
    left_leg = pos_for(base, index, world, 'mixamorig:LeftLeg')
    left_foot = pos_for(base, index, world, 'mixamorig:LeftFoot')
    right_foot = pos_for(base, index, world, 'mixamorig:RightFoot')
    left_hand = pos_for(base, index, world, 'mixamorig:LeftHand')
    right_hand = pos_for(base, index, world, 'mixamorig:RightHand')
    left_shoulder = pos_for(base, index, world, 'mixamorig:LeftShoulder')
    right_shoulder = pos_for(base, index, world, 'mixamorig:RightShoulder')
    shoulder_mid = [(left_shoulder[i] + right_shoulder[i]) * 0.5 for i in range(3)]
    forward_axis = 2 if view == 'xz' else 0
    return {
        'tag': slot.get('tag'),
        'spriteFrame': int(slot.get('spriteFrame', 0)),
        'poseclipTime': slot.get('poseclipTime'),
        'headDiscipline': slot.get('headDiscipline', []),
        'contactModifiers': slot.get('contactModifiers', []),
        'positions': {
            'hips': [round(v, 6) for v in hips],
            'spine2': [round(v, 6) for v in spine2],
            'head': [round(v, 6) for v in head],
            'leftLeg': [round(v, 6) for v in left_leg],
            'leftFoot': [round(v, 6) for v in left_foot],
            'rightFoot': [round(v, 6) for v in right_foot],
            'leftHand': [round(v, 6) for v in left_hand],
            'rightHand': [round(v, 6) for v in right_hand],
            'leftShoulder': [round(v, 6) for v in left_shoulder],
            'rightShoulder': [round(v, 6) for v in right_shoulder],
        },
        'xz': {
            'spine2MinusHipsForward': round(spine2[forward_axis] - hips[forward_axis], 6),
            'headMinusSpine2Forward': round(head[forward_axis] - spine2[forward_axis], 6),
            'headMinusHipsForward': round(head[forward_axis] - hips[forward_axis], 6),
            'leftFootMinusHeadForward': round(left_foot[forward_axis] - head[forward_axis], 6),
            'headMinusLeftLegForward': round(head[forward_axis] - left_leg[forward_axis], 6),
            'leftFootMinusSpine2Forward': round(left_foot[forward_axis] - spine2[forward_axis], 6),
        },
        'orientation': {
            'headForwardAxis': 'mixamorig:Head local +Z',
            'headForward': [round(v, 6) for v in head_forward],
            'headForwardY': round(head_forward[1], 6),
        },
        'guard': {
            'leftHandBelowHeadY': round(head[1] - left_hand[1], 6),
            'rightHandBelowHeadY': round(head[1] - right_hand[1], 6),
            'leftHandBelowSpine2Y': round(spine2[1] - left_hand[1], 6),
            'rightHandBelowSpine2Y': round(spine2[1] - right_hand[1], 6),
        },
        'posture': {
            'shoulderForwardFromSpine2Z': round(shoulder_mid[2] - spine2[2], 6),
            'shoulderUpFromSpine2Y': round(shoulder_mid[1] - spine2[1], 6),
        },
    }


def measure(args):
    renderer = load_renderer()
    base = renderer.load_base()
    poseclip_path = project_path(args.poseclip)
    evidence_path = renderer.infer_evidence_path(poseclip_path)
    payload = json.loads(poseclip_path.read_text())
    clip = payload.get('clip', payload)
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else None
    model = project_path(args.model)
    index = base.GLBAnimationIndex(model)
    bindings = renderer.build_track_bindings(base, index, clip.get('tracks', []))
    slots = renderer.evidence_slots(evidence, clip, args.fps, args.frames)
    return {
        'schema': 'pose-lab-world-metrics-v1',
        'poseclip': str(poseclip_path.relative_to(ROOT)),
        'evidence': str(evidence_path.relative_to(ROOT)) if evidence_path.exists() else None,
        'view': args.view,
        'frames': [metric_frame(base, index, renderer, bindings, slot, args.view) for slot in slots],
    }


def main():
    parser = argparse.ArgumentParser(description='Measure world-space skeleton relationships for rendered poseclip evidence slots.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_axekick_sf2.poseclip.json')
    parser.add_argument('--model', default='assets/models/gravity_fist/Ares.glb')
    parser.add_argument('--frames', choices=['read', 'all'], default='read')
    parser.add_argument('--fps', type=int, default=60)
    parser.add_argument('--view', choices=['xy', 'xz', 'zy'], default='xz')
    args = parser.parse_args()
    print(json.dumps(measure(args), indent=2))


if __name__ == '__main__':
    main()
