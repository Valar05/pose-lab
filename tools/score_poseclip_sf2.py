#!/usr/bin/env python3
import argparse
import json
from poseclip_workflow_lib import (
    clip_payload,
    distance,
    evidence_slots_for_poseclip,
    frame_by_tag,
    hold_frames,
    load_json,
    project_path,
    rel,
    sample_track_at_frame,
    sprite_frames,
    track_by_name,
    track_total_delta,
    write_json,
)

ARM_TRACKS = [
    'mixamorig:LeftShoulder.quaternion', 'mixamorig:LeftArm.quaternion', 'mixamorig:LeftForeArm.quaternion', 'mixamorig:LeftHand.quaternion',
    'mixamorig:RightShoulder.quaternion', 'mixamorig:RightArm.quaternion', 'mixamorig:RightForeArm.quaternion', 'mixamorig:RightHand.quaternion',
]


def score(poseclip_path):
    payload = load_json(poseclip_path)
    clip = clip_payload(payload)
    slots = evidence_slots_for_poseclip(poseclip_path)
    frames = sprite_frames(clip)
    tags = [frame.get('tag') for frame in frames]
    failures = []

    required = ['start', 'anticipation', 'contact', 'recoil', 'settle']
    for tag in required:
        if tag not in tags:
            failures.append(f'missing required phase {tag}')

    anticipation_frames = hold_frames(clip, 'start', 'anticipation')
    anticipation_hold_frames = hold_frames(clip, 'anticipation', 'anticipationHold')
    apex_hold_frames = hold_frames(clip, 'apex', 'apexHold')
    contact_hold_frames = hold_frames(clip, 'contact', 'contactHold')
    recovery_frames = hold_frames(clip, 'contactHold', 'settle') or hold_frames(clip, 'contact', 'settle')

    if anticipation_frames < 3:
        failures.append(f'anticipation begins too soon: {anticipation_frames} frames from start')
    if contact_hold_frames < 2:
        failures.append(f'contact hold too short: {contact_hold_frames} frames')
    if 'apex' in tags and 'contact' in tags and frame_by_tag(clip, 'apex')['spriteFrame'] >= frame_by_tag(clip, 'contact')['spriteFrame']:
        failures.append('apex must precede contact')

    hips = track_by_name(clip, 'mixamorig:Hips.position')
    hip_start_contact = 0.0
    hip_contact_recovery = 0.0
    if hips and frame_by_tag(clip, 'start') and frame_by_tag(clip, 'contact'):
        hip_start_contact = distance(sample_track_at_frame(hips, frame_by_tag(clip, 'start')['spriteFrame']), sample_track_at_frame(hips, frame_by_tag(clip, 'contact')['spriteFrame']))
    if hips and frame_by_tag(clip, 'contactHold') and frame_by_tag(clip, 'settle'):
        hip_contact_recovery = distance(sample_track_at_frame(hips, frame_by_tag(clip, 'contactHold')['spriteFrame']), sample_track_at_frame(hips, frame_by_tag(clip, 'settle')['spriteFrame']))
    if hip_start_contact < 1.0:
        failures.append(f'hips barely commit before contact: {hip_start_contact:.3f}')

    contact = frame_by_tag(clip, 'contact') or {}
    apex = frame_by_tag(clip, 'apex') or {}
    snap = frame_by_tag(clip, 'snap') or {}
    contact_ext = float(contact.get('effectorExtension', 0.0) or 0.0)
    apex_height = float(apex.get('effectorHeight', 0.0) or 0.0)
    snap_motion = float(snap.get('motionTotal', 0.0) or 0.0)
    contact_motion = float(contact.get('motionTotal', 0.0) or 0.0)
    arm_delta = track_total_delta(clip, ARM_TRACKS, 0, int(contact.get('spriteFrame', 0) or 0))

    scores = {
        'readability': min(10, 5 + len(set(tags) & {'anticipation', 'apex', 'contact', 'recoil', 'settle'})),
        'anticipation': min(10, 4 + anticipation_frames * 0.45 + anticipation_hold_frames * 0.2),
        'commitment': min(10, 4 + hip_start_contact * 0.12 + max(0.0, snap_motion) * 0.35),
        'contact': min(10, 4 + contact_hold_frames * 0.35 + contact_ext * 1.2 + contact_motion * 0.25),
        'recovery': min(10, 4 + recovery_frames * 0.18 + hip_contact_recovery * 0.08),
        'weight': min(10, 4 + hip_start_contact * 0.1 + hip_contact_recovery * 0.04),
        'silhouette': min(10, 5 + apex_height * 1.4 + contact_ext),
        'moveIdentity': min(10, 5 + (2 if 'apex' in tags else 0) + (2 if 'contactHold' in tags else 0)),
        'sf2Feel': min(10, 4 + contact_hold_frames * 0.25 + anticipation_frames * 0.18 + apex_hold_frames * 0.25),
    }
    scores = {key: round(value, 2) for key, value in scores.items()}
    overall = round(sum(scores.values()) / len(scores), 2)

    return {
        'schema': 'pose-lab-sf2-local-score-v1',
        'poseclip': rel(project_path(poseclip_path)),
        'actorKey': payload.get('actorKey'),
        'attackName': payload.get('attackName') or clip.get('userData', {}).get('attackName'),
        'clipName': clip.get('name'),
        'localFailures': failures,
        'phaseTags': tags,
        'phaseScores': {
            'anticipationFrames': anticipation_frames,
            'anticipationHoldFrames': anticipation_hold_frames,
            'apexHoldFrames': apex_hold_frames,
            'contactHoldFrames': contact_hold_frames,
            'recoveryFrames': recovery_frames,
            'hipTravelStartToContact': round(hip_start_contact, 5),
            'hipTravelContactHoldToSettle': round(hip_contact_recovery, 5),
            'apexEffectorHeight': round(apex_height, 5),
            'contactEffectorExtension': round(contact_ext, 5),
            'snapMotionTotal': round(snap_motion, 5),
            'contactMotionTotal': round(contact_motion, 5),
            'armDeltaStartToContact': arm_delta,
            'evidenceSlots': len(slots),
        },
        'scores': scores,
        'overallScore': overall,
        'needsVisionCritique': overall < 9.25 or bool(failures),
        'recommendedFrames': [f"f{int(frame.get('spriteFrame', 0)):03d}_{frame.get('tag')}" for frame in frames if frame.get('tag') in {'anticipation', 'anticipationHold', 'apex', 'snap', 'contact', 'contactHold', 'recoil'}],
    }


def main():
    parser = argparse.ArgumentParser(description='Score a baked poseclip against local SF2 readability contracts.')
    parser.add_argument('--poseclip', default='assets/pose_indexes/ares_axekick_sf2.poseclip.json')
    parser.add_argument('--out')
    parser.add_argument('--strict', action='store_true')
    args = parser.parse_args()
    report = score(args.poseclip)
    if args.out:
        write_json(args.out, report)
    print(json.dumps(report, indent=2))
    if args.strict and report['localFailures']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
