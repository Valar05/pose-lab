#!/usr/bin/env python3
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path('/storage/emulated/0/Documents/GodotProjects/pose-lab')
BASE_SCRIPT = ROOT / 'tools/index_gravity_fist_jab.py'
OUT_DIR = ROOT / 'assets/pose_indexes'
BATCH_MANIFEST = OUT_DIR / 'ares_sf2_attack_batch_manifest.json'
APPEAL_SCORING = 'source-burst-clean'

CLIP_ALIASES = {
    'LeftHook': 'Hook',
}

ATTACK_ORDER = [
    'Jab',
    'Cross',
    'LeftHook',
    'LeftUppercut',
    'RightUppercut',
    'Headbutt',
    'SupermanPunch',
    'LowBackKick',
    'FrontKick',
    'Backfist',
    'SpinningHighKick',
    'AxeKick',
    'AxleKick',
]

ARM_OVERLAY_BONES = [
    'mixamorig:LeftShoulder',
    'mixamorig:LeftArm',
    'mixamorig:LeftForeArm',
    'mixamorig:LeftHand',
    'mixamorig:RightShoulder',
    'mixamorig:RightArm',
    'mixamorig:RightForeArm',
    'mixamorig:RightHand',
]

AXE_KICK_CONTACT_EXAGGERATION = {
    'kind': 'axe-kick-authored-impact-overcommit',
    'reason': 'Make the AxeKick contact frame read as a crushing downward impact: hips drop, body drives through, torso compresses, and recovery rises out of a committed overextension.',
    'contactFrames': [22, 33],
    'hipOffset': [0.0, -10.0, 4.5],
    'torsoCompressionRadians': 0.18,
    'legCrashRadians': -0.08,
    'timeline': [
        {'spriteFrame': 19, 'strength': 0.0, 'tag': 'apexHold'},
        {'spriteFrame': 21, 'strength': 0.35, 'tag': 'snapLead'},
        {'spriteFrame': 22, 'strength': 1.0, 'tag': 'crushingContact'},
        {'spriteFrame': 33, 'strength': 1.0, 'tag': 'heldOvercommit'},
        {'spriteFrame': 36, 'strength': 0.25, 'tag': 'draggedRecoil'},
        {'spriteFrame': 38, 'strength': 0.05, 'tag': 'recoveryRise'},
        {'spriteFrame': 40, 'strength': 0.0, 'tag': 'settle'},
    ],
}


AXE_KICK_HEAD_DISCIPLINE = {
    'kind': 'sf2-head-discipline-observed-not-baked',
    'enabled': False,
    'reason': 'Do not procedurally counter-rotate Ares spine/head for AxeKick; prior head-discipline bakes visibly destroyed torso appeal and made the pose hunch away from center.',
    'rule': 'Preserve the source torso/head relationship. Critique head discipline from visual evidence, but do not bake synthetic spine/head offsets unless a future visual test proves the full pose improves.',
    'timeline': [],
}


AXE_KICK_HEAD_GAZE_STABILIZATION = {
    'kind': 'sf2-head-gaze-stabilization',
    'enabled': True,
    'mode': 'local-neck-head-gaze-lift',
    'reason': 'Prevent AxeKick contact from reading as a fighter looking down at the floor. Preserve hips/spine/source torso pose and correct only local Neck/Head gaze.',
    'faceAxis': 'mixamorig:Head local +Z',
    'minContactHeadForwardY': -0.42,
    'preferredContactHeadForwardY': -0.21,
    'allowedExtraDownDegrees': 10,
    'targetBones': ['mixamorig:Neck', 'mixamorig:Head'],
    'bonePitchRadians': {
        'mixamorig:Neck': -0.09,
        'mixamorig:Head': -0.34,
    },
    'timeline': [
        {'spriteFrame': 0, 'strength': 0.0, 'tag': 'neutralLook'},
        {'spriteFrame': 19, 'strength': 0.0, 'tag': 'preserveApex'},
        {'spriteFrame': 21, 'strength': 0.25, 'tag': 'snapLookLift'},
        {'spriteFrame': 22, 'strength': 1.0, 'tag': 'contactLookUp'},
        {'spriteFrame': 33, 'strength': 1.0, 'tag': 'heldContactLookUp'},
        {'spriteFrame': 36, 'strength': 0.35, 'tag': 'recoilLookSettle'},
        {'spriteFrame': 38, 'strength': 0.1, 'tag': 'guardLookSettle'},
        {'spriteFrame': 40, 'strength': 0.0, 'tag': 'neutralLook'},
    ],
}


HEADBUTT_GUARD_RULE_EXCEPTION = {
    'kind': 'sf2-guard-rule-exception',
    'enabled': True,
    'attackName': 'Headbutt',
    'reason': 'Headbutt is allowed to break ordinary hand guard rules because the arms sell the head-driven body commitment and recoil.',
    'rule': 'Do not apply generic contact/recovery guard stabilization to Headbutt unless a visual test proves the arms stop selling the motion.',
}


AXE_KICK_CONTACT_GUARD_STABILIZATION = {
    'kind': 'sf2-contact-guard-stabilization',
    'enabled': True,
    'mode': 'local-upperarm-contact-guard-lift',
    'reason': 'Counter the lifted-head/low-fist read at AxeKick contact by keeping fists near torso guard height. Preserve hips, spine, legs, neck, and head.',
    'targetBones': ['mixamorig:LeftArm', 'mixamorig:RightArm'],
    'boneYawRadians': {
        'mixamorig:LeftArm': 0.22,
        'mixamorig:RightArm': -0.22,
    },
    'maxHandBelowSpine2Y': 0.12,
    'timeline': [
        {'spriteFrame': 0, 'strength': 0.0, 'tag': 'neutralGuard'},
        {'spriteFrame': 19, 'strength': 0.0, 'tag': 'preserveApexArms'},
        {'spriteFrame': 21, 'strength': 0.12, 'tag': 'snapGuardLift'},
        {'spriteFrame': 22, 'strength': 0.24, 'tag': 'contactGuardLift'},
        {'spriteFrame': 33, 'strength': 0.24, 'tag': 'heldContactGuard'},
        {'spriteFrame': 36, 'strength': 0.32, 'tag': 'recoilGuardCarry'},
        {'spriteFrame': 38, 'strength': 0.18, 'tag': 'recoverGuard'},
        {'spriteFrame': 40, 'strength': 0.0, 'tag': 'neutralGuard'},
    ],
}

AXE_KICK_FINISHED_STRIKE_UPPER_BODY_CARRY = {
    'kind': 'sf2-finished-strike-upper-body-carry',
    'enabled': False,
    'sourceTime': 0.43333,
    'targetBones': ['mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2'],
    'timeline': [
        {'spriteFrame': 21, 'strength': 0.12, 'tag': 'snapLead'},
        {'spriteFrame': 22, 'strength': 1.0, 'tag': 'finishedCarry'},
        {'spriteFrame': 33, 'strength': 1.0, 'tag': 'heldCarry'},
        {'spriteFrame': 36, 'strength': 0.18, 'tag': 'releaseCarry'},
        {'spriteFrame': 38, 'strength': 0.0, 'tag': 'recovered'},
    ],
}


AXE_KICK_GROUNDED_FINISH_LOWER_BODY_CARRY = {
    'kind': 'sf2-grounded-finish-lower-body-carry',
    'enabled': True,
    'sourceTime': 0.46667,
    'translationBones': ['mixamorig:Hips'],
    'rotationBones': [
        'mixamorig:LeftUpLeg',
        'mixamorig:LeftLeg',
        'mixamorig:LeftFoot',
        'mixamorig:LeftToeBase',
        'mixamorig:RightUpLeg',
        'mixamorig:RightLeg',
        'mixamorig:RightFoot',
    ],
    'timeline': [
        {'spriteFrame': 21, 'strength': 0.3, 'tag': 'snapLead'},
        {'spriteFrame': 22, 'strength': 1.0, 'tag': 'groundedContact'},
        {'spriteFrame': 33, 'strength': 1.0, 'tag': 'heldGroundedContact'},
        {'spriteFrame': 36, 'strength': 0.14, 'tag': 'releaseGrounding'},
        {'spriteFrame': 38, 'strength': 0.0, 'tag': 'recovered'},
    ],
}



AXE_KICK_FINISH_GROUNDING = {
    'kind': 'sf2-axekick-finish-grounding',
    'enabled': True,
    'sourceTime': 0.43333,
    'hipOffset': [0.0, -5.5, 0.0],
    'translationBones': ['mixamorig:Hips'],
    'rotationBones': [
        'mixamorig:LeftUpLeg',
        'mixamorig:LeftLeg',
        'mixamorig:LeftFoot',
    ],
    'timeline': [
        {'spriteFrame': 36, 'strength': 1.0, 'tag': 'recoilGrounded'},
        {'spriteFrame': 38, 'strength': 1.0, 'tag': 'recoverySettleGrounded'},
        {'spriteFrame': 40, 'strength': 1.0, 'tag': 'settleGrounded'},
    ],
}


AXE_KICK_RECOVERY_FOOTLINE_GUARD = {
    'kind': 'sf2-axekick-recovery-footline-guard',
    'enabled': True,
    'reason': 'Ban the illegible both-feet-back tween. AxeKick recovery should keep the contact leg bend frozen at the held strike pose while only the foot and toe slide back toward idle.',
    'startFrame': 33,
    'endFrame': 39,
    'referenceStartFrame': 33,
    'referenceEndFrame': 40,
    'holdRotationBones': [
        'mixamorig:LeftUpLeg',
        'mixamorig:LeftLeg',
        'mixamorig:LeftFoot',
        'mixamorig:LeftToeBase',
    ],
    'translationTracks': [
        'mixamorig:LeftFoot.position',
        'mixamorig:LeftToeBase.position',
    ],
    'easing': 'easeOutCubic',
}


AXE_KICK_BAD_FRAME_RULES = {
    'kind': 'sf2-axekick-bad-frame-rules-v1',
    'enabled': True,
    'windows': [
        {
            'name': 'lateRecovery',
            'startFrame': 34,
            'endFrame': 39,
            'rules': [
                {
                    'id': 'no-both-feet-back',
                    'label': 'ban both-feet-back recovery stance',
                    'allOf': [
                        {'metric': 'leftFootMinusHipsForward', 'max': 0.02},
                        {'metric': 'rightFootMinusHipsForward', 'max': -0.08},
                    ],
                },
                {
                    'id': 'limit-striking-foot-height',
                    'label': 'striking foot cannot pop upward during late recovery',
                    'conditions': [
                        {'metric': 'leftFootHeight', 'max': 0.18},
                    ],
                },
                {
                    'id': 'limit-striking-foot-height-pop',
                    'label': 'striking foot vertical delta cannot pop between recovery frames',
                    'conditions': [
                        {'metric': 'leftFootHeight', 'max': 0.18},
                        {'metric': 'leftFootHeightDelta', 'maxAbs': 0.2},
                    ],
                },
                {
                    'id': 'limit-striking-foot-forward-delta',
                    'label': 'striking foot forward motion cannot jump between recovery frames',
                    'conditions': [
                        {'metric': 'leftFootMinusHipsForwardDelta', 'maxAbs': 0.24},
                    ],
                },
            ],
        },
    ],
}


FOOT_PLANT_PROFILES = {
    'AxeKick': {
        'kind': 'stationary-support-foot-plant',
        'enabled': True,
        'rootBone': 'mixamorig:Hips',
        'windows': [
            {
                'footBone': 'mixamorig:RightFoot',
                'anchorFrame': 0,
                'startFrame': 0,
                'endFrame': 40,
                'reason': 'Stationary AxeKick should keep the support foot rock steady in world space while the body and striking leg move around that anchor.',
            },
        ],
    },
    'FrontKick': {
        'kind': 'stationary-support-foot-plant',
        'enabled': True,
        'rootBone': 'mixamorig:Hips',
        'windows': [
            {
                'footBone': 'mixamorig:RightFoot',
                'anchorFrame': 0,
                'startFrame': 0,
                'endFrame': 40,
                'reason': 'FrontKick is a stationary ballistic kick. The support foot should stay rock steady in world space while the striking leg snaps out and recoils.',
            },
        ],
    },
    'LowBackKick': {
        'kind': 'stationary-support-foot-plant',
        'enabled': True,
        'rootBone': 'mixamorig:Hips',
        'windows': [
            {
                'footBone': 'mixamorig:LeftFoot',
                'anchorFrame': 0,
                'startFrame': 0,
                'endFrame': 40,
                'reason': 'LowBackKick should keep one foot planted the whole time. The planted support leg carries the turn while the kicking leg reaches and retracts.',
            },
        ],
    },
    'AxleKick': {
        'kind': 'stationary-support-foot-plant',
        'enabled': True,
        'rootBone': 'mixamorig:Hips',
        'windows': [
            {
                'footBone': 'mixamorig:LeftFoot',
                'anchorFrame': 11,
                'startFrame': 11,
                'endFrame': 27,
                'reason': 'AxleKick can finish its chamber shift first, then the support foot must stay planted through the strike and immediate recoil before the loop recovery returns to idle.',
            },
        ],
    },
}


GENERIC_KICK_PRECONTACT_UPPER_BODY_CARRY = {
    'kind': 'sf2-kick-precontact-upper-body-carry',
    'enabled': True,
    'excludeAttacks': ['AxeKick'],
    'targetBones': ['mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head'],
    'sourceLeadSeconds': 0.03333,
    'timeline': [
        {'strength': 0.18, 'sourceTag': 'snap', 'tag': 'snapLead'},
        {'strength': 1.0, 'sourceTag': 'contact', 'tag': 'contactCarry'},
        {'strength': 1.0, 'sourceTag': 'contactHold', 'tag': 'heldContactCarry'},
        {'strength': 0.22, 'sourceTag': 'recoil', 'tag': 'recoilRelease'},
        {'strength': 0.0, 'sourceTag': 'settle', 'tag': 'settled'},
    ],
}


FRONTKICK_CONTACT_MASS_CARRY = {
    'kind': 'sf2-frontkick-contact-mass-carry',
    'enabled': True,
    'reason': 'FrontKick should keep ballistic snap but still read body mass at contact: hips drive a little farther through, body drops slightly into the support leg, and torso stays counterbalanced instead of becoming a pure leg-only strike.',
    'hipOffset': [0.0, -2.4, 3.2],
    'timeline': [
        {'spriteFrame': 13, 'strength': 0.0, 'tag': 'preload'},
        {'spriteFrame': 14, 'strength': 1.0, 'tag': 'contactDrive'},
        {'spriteFrame': 15, 'strength': 1.0, 'tag': 'heldDrive'},
        {'spriteFrame': 18, 'strength': 0.25, 'tag': 'recoilRelease'},
        {'spriteFrame': 22, 'strength': 0.0, 'tag': 'recovered'},
    ],
}


SQUASH_STRETCH_LAYERS = {
    'AxeKick': {
        'kind': 'smash-realistic-axekick-settle-cheat',
        'enabled': True,
        'reason': 'Use a restrained Smash-style squash/stretch settle on AxeKick so the held contact compresses into the recovery instead of reading as a hard pose cut to idle.',
        'timeline': [
            {'spriteFrame': 22, 'strength': 0.0, 'tag': 'contact'},
            {'spriteFrame': 33, 'strength': 0.45, 'tag': 'heldContact'},
            {'spriteFrame': 36, 'strength': 0.62, 'tag': 'releaseCarry'},
            {'spriteFrame': 38, 'strength': 0.24, 'tag': 'recoverySettle'},
            {'spriteFrame': 40, 'strength': 0.0, 'tag': 'settle'},
        ],
        'bones': {
            'mixamorig:Spine': [0.993, 0.985, 1.006],
            'mixamorig:Spine1': [0.989, 0.98, 1.01],
            'mixamorig:Spine2': [0.985, 0.972, 1.014],
        },
    },
    'FrontKick': {
        'kind': 'smash-realistic-frontkick-force-cheat',
        'enabled': True,
        'reason': 'Use restrained Smash-style force cheating on a realistic rig: slight directional extension through the striking line plus tiny impact compression so the kick feels faster and heavier without obvious rubber deformation.',
        'timeline': [
            {'spriteFrame': 9, 'strength': 0.0, 'tag': 'loaded'},
            {'spriteFrame': 14, 'strength': 1.0, 'tag': 'contactStretch'},
            {'spriteFrame': 15, 'strength': 1.0, 'tag': 'heldStretch'},
            {'spriteFrame': 18, 'strength': 0.35, 'tag': 'recoilRelease'},
            {'spriteFrame': 22, 'strength': 0.0, 'tag': 'recovered'},
        ],
        'bones': {
            'mixamorig:Spine': [0.992, 0.98, 1.03],
            'mixamorig:Spine1': [0.99, 0.975, 1.04],
            'mixamorig:Spine2': [0.985, 0.97, 1.05],
            'mixamorig:LeftUpLeg': [1.015, 1.045, 1.03],
            'mixamorig:LeftLeg': [0.985, 1.1, 1.07],
            'mixamorig:LeftFoot': [0.985, 1.04, 1.06],
            'mixamorig:RightUpLeg': [1.015, 0.98, 1.005],
            'mixamorig:RightLeg': [1.02, 0.95, 1.005],
        },
    },
}


SMASH_REALISTIC_STEERING = {
    'BallisticKick': {
        'family': 'ballistic-kick',
        'observationCharacter': 'Ganondorf',
        'observationGame': 'Super Smash Bros. Ultimate',
        'reason': 'Use Ganondorf as the realistic-body-cheat benchmark for ballistic kicks: preserve snap and recoil while letting torso compression, support-leg load, and slight directional extension make the strike feel heavier.',
        'do': [
            'preserve foot velocity over contact posing',
            'let hips and torso contribute before the limb fully arrives',
            'keep the head disciplined behind the striking line',
            'use subtle directional extension and impact compression only',
        ],
        'avoid': [
            'long contact display holds',
            'visible rubber scaling',
            'head-leading power generation',
        ],
        'referenceMoves': ['Forward aerial', "Wizard's Foot"],
    },
    'HeavyKick': {
        'family': 'heavy-kick',
        'observationCharacter': 'Ganondorf',
        'observationGame': 'Super Smash Bros. Ultimate',
        'reason': 'Use Ganondorf as the realistic-body-cheat benchmark for heavy kicks: big silhouette change, hips-first commitment, and chest/shoulder compression before release without turning the body into rubber.',
        'do': [
            'compress before release',
            'lead power from hips through torso into the limb',
            'hold a screenshot-worthy contact or apex read when the move identity needs it',
            'favor silhouette expansion over obvious bone scaling',
        ],
        'avoid': [
            'floating leg-only motion',
            'cartoon stretch',
            'face-first commitment',
        ],
        'referenceMoves': ['Forward smash', 'Up tilt', 'Down smash'],
    },
}



ARM_OVERLAY_SOURCE = {
    'AxeKick': {
        'sourceClipName': 'Headbutt',
        'targetBones': ARM_OVERLAY_BONES,
        'path': 'rotation',
        'mode': 'phase-blend-local-arm-rotations',
        'reason': 'AxeKick keeps its source leg/root pose while Headbutt contributes phase-shaped upper-limb energy: guarded chamber, counterbalance through apex, braced pull at contact.',
        'boneStrength': {
            'mixamorig:LeftShoulder': 0.08,
            'mixamorig:LeftArm': 0.74,
            'mixamorig:LeftForeArm': 0.84,
            'mixamorig:LeftHand': 0.48,
            'mixamorig:RightShoulder': 0.08,
            'mixamorig:RightArm': 0.74,
            'mixamorig:RightForeArm': 0.84,
            'mixamorig:RightHand': 0.48,
        },
        'timeline': [
            {'spriteFrame': 0, 'sourceTime': 0.03333, 'strength': 0.06, 'tag': 'guard', 'easing': 'easeOutSine'},
            {'spriteFrame': 6, 'sourceTime': 0.06667, 'strength': 0.14, 'tag': 'guardedChamber', 'easing': 'movingHold'},
            {'spriteFrame': 11, 'sourceTime': 0.06667, 'strength': 0.18, 'tag': 'chamberHold', 'easing': 'holdThenSnap'},
            {'spriteFrame': 14, 'sourceTime': 0.13333, 'strength': 0.34, 'tag': 'counterwind', 'easing': 'easeOutExpo'},
            {'spriteFrame': 19, 'sourceTime': 0.26667, 'strength': 0.70, 'tag': 'whipLead', 'easing': 'easeOutExpo'},
            {'spriteFrame': 21, 'sourceTime': 0.30000, 'strength': 0.86, 'tag': 'snapBrace', 'easing': 'holdExact'},
            {'spriteFrame': 22, 'sourceTime': 0.30000, 'strength': 0.86, 'tag': 'contactCarry', 'easing': 'holdExact'},
            {'spriteFrame': 33, 'sourceTime': 0.30000, 'strength': 0.86, 'tag': 'heldBracedPull', 'easing': 'stepHold'},
            {'spriteFrame': 36, 'sourceTime': 0.33333, 'strength': 0.34, 'tag': 'recoil', 'easing': 'dampedRecover'},
            {'spriteFrame': 40, 'sourceTime': 0.76667, 'strength': 0.10, 'tag': 'settle'},
        ],
    },
}


def load_base():
    spec = importlib.util.spec_from_file_location('gravity_fist_jab_indexer', BASE_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def safe_stem(name):
    out = []
    for char in name:
        if char.isalnum():
            out.append(char.lower())
        elif out and out[-1] != '_':
            out.append('_')
    return ''.join(out).strip('_') or 'attack'


def load_attack_metadata(base):
    payload = json.loads(base.ATTACKS_JSON.read_text())
    entries = []
    for family in ('standard', 'special'):
        for entry in payload.get(family, []):
            next_entry = dict(entry)
            next_entry['family'] = family
            entries.append(next_entry)
    by_name = {entry['name']: entry for entry in entries}
    return [by_name[name] for name in ATTACK_ORDER if name in by_name]


def smash_realistic_steering_profile(attack_name, attack_style):
    if attack_name == 'FrontKick':
        profile = dict(SMASH_REALISTIC_STEERING['BallisticKick'])
        profile['attackName'] = attack_name
        profile['appliedLayerKind'] = SQUASH_STRETCH_LAYERS.get(attack_name, {}).get('kind')
        profile['timingBias'] = 'ballistic-snap'
        return profile
    if attack_style == 'kick' and attack_name in ('AxeKick', 'AxleKick', 'LowBackKick', 'SpinningHighKick', 'Backfist'):
        profile = dict(SMASH_REALISTIC_STEERING['HeavyKick'])
        profile['attackName'] = attack_name
        profile['appliedLayerKind'] = SQUASH_STRETCH_LAYERS.get(attack_name, {}).get('kind')
        profile['timingBias'] = 'heavy-commitment'
        return profile
    return None



def attack_style(attack_name):
    if attack_name == 'Headbutt':
        return 'headbutt'
    if 'Kick' in attack_name:
        return 'kick'
    return 'punch'


def describe_appeal_frame(frame, style):
    motion = frame['motionTotal']
    reach = frame['strikeReach']
    height = frame.get('effectorHeight', 0.0)
    extension = frame.get('effectorExtension', abs(reach))
    if style == 'kick':
        if extension > 1.25 or reach > 0.65:
            reach_label = 'full leg extension'
        elif extension > 0.95 or reach > 0.35:
            reach_label = 'extended leg'
        elif extension > 0.7:
            reach_label = 'loaded leg'
        else:
            reach_label = 'chambered leg'
        height_label = 'high foot' if height > 0.25 else 'mid foot' if height > -0.15 else 'low foot'
    elif style == 'headbutt':
        if reach > 0.35:
            reach_label = 'committed head drive'
        elif reach > 0.16:
            reach_label = 'forward head drive'
        else:
            reach_label = 'coiled head guard'
        height_label = 'dipped head' if frame.get('headDrop', 0.0) > 0.18 else 'level head'
    else:
        if reach > 0.55:
            reach_label = 'full extension'
        elif reach > 0.32:
            reach_label = 'extended'
        elif reach > 0.18:
            reach_label = 'half extension'
        else:
            reach_label = 'guarded'
        guard = max(frame['leftGuard'], frame['rightGuard'])
        height_label = 'high hands' if guard > 0.5 else 'mid guard' if guard > 0.25 else 'low hands'
    if motion > 1.2:
        motion_label = 'snappy transition'
    elif motion > 0.45:
        motion_label = 'readable shift'
    else:
        motion_label = 'held pose'
    return f"{frame['semanticTag']} {reach_label}, {height_label}, {motion_label}"


def annotate_attack_frames(base, index_data, attack_name):
    style = attack_style(attack_name)
    frames = index_data['frames']
    forward = index_data['forwardAxis']
    up = index_data['upAxis']
    start = frames[0]
    start_head_height = base.vec_dot(base.vec_sub(start['points']['head']['position'], start['points']['hips']['position']), up)
    for frame in frames:
        hips = frame['points']['hips']['position']
        head = frame['points']['head']['position']
        left_foot = frame['points']['left_foot']['position']
        right_foot = frame['points']['right_foot']['position']
        left_hand = frame['points']['left_hand']['position']
        right_hand = frame['points']['right_hand']['position']
        frame['leftFootReach'] = base.round_value(base.vec_dot(base.vec_sub(left_foot, hips), forward), 5)
        frame['rightFootReach'] = base.round_value(base.vec_dot(base.vec_sub(right_foot, hips), forward), 5)
        frame['leftFootHeight'] = base.round_value(base.vec_dot(base.vec_sub(left_foot, hips), up), 5)
        frame['rightFootHeight'] = base.round_value(base.vec_dot(base.vec_sub(right_foot, hips), up), 5)
        frame['leftFootExtension'] = base.round_value(base.vec_length(base.vec_sub(left_foot, hips)), 5)
        frame['rightFootExtension'] = base.round_value(base.vec_length(base.vec_sub(right_foot, hips)), 5)
        frame['headReach'] = base.round_value(base.vec_dot(base.vec_sub(head, hips), forward), 5)
        head_height = base.vec_dot(base.vec_sub(head, hips), up)
        frame['headDrop'] = base.round_value(start_head_height - head_height, 5)
        frame['leftHandExtension'] = base.round_value(base.vec_length(base.vec_sub(left_hand, hips)), 5)
        frame['rightHandExtension'] = base.round_value(base.vec_length(base.vec_sub(right_hand, hips)), 5)

    if style == 'kick':
        peak = max(frames, key=lambda f: max(
            abs(f['leftFootReach']) + f['leftFootExtension'] * 0.35 + max(0.0, f['leftFootHeight']) * 0.25,
            abs(f['rightFootReach']) + f['rightFootExtension'] * 0.35 + max(0.0, f['rightFootHeight']) * 0.25,
        ))
        left_score = abs(peak['leftFootReach']) + peak['leftFootExtension'] * 0.35 + max(0.0, peak['leftFootHeight']) * 0.25
        right_score = abs(peak['rightFootReach']) + peak['rightFootExtension'] * 0.35 + max(0.0, peak['rightFootHeight']) * 0.25
        side = 'right' if right_score >= left_score else 'left'
        raw_peak = peak['rightFootReach'] if side == 'right' else peak['leftFootReach']
    elif style == 'headbutt':
        side = 'head'
        peak = max(frames, key=lambda f: abs(f['headReach']) + max(0.0, f['headDrop']) * 0.4 + f['motionTotal'] * 0.1)
        raw_peak = peak['headReach']
    else:
        peak = max(frames, key=lambda f: max(abs(f['leftReach']), abs(f['rightReach'])))
        side = 'right' if abs(peak['rightReach']) >= abs(peak['leftReach']) else 'left'
        raw_peak = peak['rightReach'] if side == 'right' else peak['leftReach']
    sign = 1.0 if raw_peak >= 0 else -1.0

    for frame in frames:
        if style == 'kick':
            raw = frame['rightFootReach'] if side == 'right' else frame['leftFootReach']
            frame['effectorHeight'] = frame['rightFootHeight'] if side == 'right' else frame['leftFootHeight']
            frame['effectorExtension'] = frame['rightFootExtension'] if side == 'right' else frame['leftFootExtension']
        elif style == 'headbutt':
            raw = frame['headReach']
            frame['effectorHeight'] = -frame['headDrop']
            frame['effectorExtension'] = abs(frame['headReach']) + max(0.0, frame['headDrop'])
        else:
            raw = frame['rightReach'] if side == 'right' else frame['leftReach']
            frame['effectorHeight'] = frame['rightGuard'] if side == 'right' else frame['leftGuard']
            frame['effectorExtension'] = frame['rightHandExtension'] if side == 'right' else frame['leftHandExtension']
        frame['attackStyle'] = style
        frame['strikeSide'] = side
        frame['strikeReach'] = base.round_value(raw * sign, 5)
        frame['description'] = describe_appeal_frame(frame, style)
    index_data['attackStyle'] = style
    index_data['strikeSide'] = side
    index_data['appealScoring'] = APPEAL_SCORING
    return index_data


def choose_appeal_anchor_frames(base, index_data, metadata):
    frames = index_data['frames']
    style = index_data.get('attackStyle', 'punch')
    attack_name = index_data.get('attackName', '')
    dash_start = float(metadata.get('dash_start', 0.15))
    attack_end = float(metadata.get('attack_end', 0.25))

    def candidates_between(low, high):
        return [frame for frame in frames if low <= frame['time'] <= high]

    def best(candidates, score_fn, fallback):
        if not candidates:
            return fallback
        return max(candidates, key=score_fn)

    def contact_score(frame):
        if style == 'kick':
            if attack_name == 'AxeKick':
                progress = frame['time'] / max(attack_end, 0.0001)
                downward_bonus = max(0.0, 0.25 - frame.get('effectorHeight', 0.0))
                return frame.get('effectorExtension', 0.0) * 0.62 + frame['motionTotal'] * 0.18 + progress * 0.35 + downward_bonus * 0.28
            height_bonus = max(0.0, frame.get('effectorHeight', 0.0)) * 0.35
            return frame['strikeReach'] * 1.18 + frame.get('effectorExtension', 0.0) * 0.46 + height_bonus + frame['motionTotal'] * 0.05
        if style == 'headbutt':
            return frame['strikeReach'] * 1.1 + max(0.0, frame.get('headDrop', 0.0)) * 0.55 + frame['motionTotal'] * 0.18
        return frame['strikeReach'] + frame['motionTotal'] * 0.2

    start = frames[0]
    contact_candidates = candidates_between(dash_start * 0.7, max(attack_end + 0.08, dash_start + 0.05))
    contact = best(contact_candidates, contact_score, start)

    anticipation_high = min(dash_start, max(0.00001, contact['time'] - 0.00001))
    anticipation_candidates = candidates_between(0.00001, anticipation_high)
    if not anticipation_candidates:
        anticipation_candidates = [frame for frame in frames if 0.00001 < frame['time'] < contact['time']]

    def anticipation_score(frame):
        if style == 'kick':
            extension_gap = max(0.0, contact.get('effectorExtension', 0.0) - frame.get('effectorExtension', 0.0))
            reach_gap = max(0.0, contact['strikeReach'] - frame['strikeReach'])
            if attack_name == 'AxeKick':
                # Axe kick anticipation should be the raised-prep read; contact is the downward chop.
                height_drop = max(0.0, frame.get('effectorHeight', 0.0) - contact.get('effectorHeight', 0.0))
                return height_drop * 1.8 + max(0.0, frame.get('effectorHeight', 0.0)) * 0.65 + frame['motionTotal'] * 0.16 - max(0.0, frame['strikeReach'] - contact['strikeReach']) * 0.15
            return extension_gap * 1.25 + reach_gap * 0.85 + frame['motionTotal'] * 0.18 - max(0.0, frame.get('effectorExtension', 0.0) - contact.get('effectorExtension', 0.0)) * 0.9
        if style == 'headbutt':
            recoil_room = max(0.0, contact['strikeReach'] - frame['strikeReach'])
            return recoil_room * 1.2 + frame['motionTotal'] * 0.22 + max(0.0, frame.get('headDrop', 0.0)) * 0.15
        recoil_room = max(0.0, contact['strikeReach'] - frame['strikeReach'])
        return recoil_room * 1.05 + frame['motionTotal'] * 0.25 + max(0.0, -frame['strikeReach']) * 0.35

    anticipation = best(anticipation_candidates, anticipation_score, start)
    if anticipation['time'] >= contact['time']:
        anticipation = start

    recoil = best(
        [f for f in frames if f['time'] > contact['time'] and f['time'] <= min(index_data['duration'], attack_end + 0.14)],
        lambda f: ((contact['strikeReach'] - f['strikeReach']) * 1.15) + f['motionTotal'] * 0.35 + max(0.0, contact.get('effectorHeight', 0.0) - f.get('effectorHeight', 0.0)) * (0.25 if style == 'kick' else 0.0),
        frames[min(len(frames) - 1, contact['frameIndex'] + 1)],
    )
    settle = best(
        [f for f in frames if f['time'] >= attack_end],
        lambda f: -abs(f['strikeReach'] - start['strikeReach']) - abs(f.get('effectorHeight', 0.0) - start.get('effectorHeight', 0.0)) * 0.25 - f['motionTotal'] * 0.3,
        frames[-1],
    )
    anchors = []
    for tag, frame in [('start', start), ('anticipation', anticipation), ('contact', contact), ('recoil', recoil), ('settle', settle)]:
        anchors.append({
            'tag': tag,
            'frameIndex': frame['frameIndex'],
            'time': frame['time'],
            'description': frame['description'],
            'strikeSide': index_data['strikeSide'],
            'attackStyle': style,
            'reach': frame['strikeReach'],
            'effectorHeight': base.round_value(frame.get('effectorHeight', 0.0), 5),
            'effectorExtension': base.round_value(frame.get('effectorExtension', 0.0), 5),
            'motionTotal': frame['motionTotal'],
        })
    anchors.sort(key=lambda entry: (entry['time'], ['start', 'anticipation', 'contact', 'recoil', 'settle'].index(entry['tag'])))
    return anchors


def attack_easing_options(tag):
    if tag == 'start':
        return ['holdThenSnap', 'hold', 'easeOutCubic']
    if tag in ('anticipation', 'anticipationHold', 'lift', 'apex', 'apexHold'):
        return ['holdThenSnap', 'snapLunge', 'easeOutExpo']
    if tag == 'contact':
        return ['stepHold', 'ballisticRecoil', 'criticalDampReturn']
    if tag == 'recoil':
        return ['dampedRecover', 'microOvershoot', 'easeOutCubic']
    return ['hold', 'springLow', 'easeOutSine']


def attack_segment_easing(from_tag, to_tag, attack_name=''):
    if from_tag == 'start' and to_tag == 'anticipation':
        return 'holdThenSnap'
    if from_tag == 'anticipation' and to_tag == 'anticipationHold':
        return 'movingHold'
    if from_tag in ('anticipation', 'anticipationHold') and to_tag == 'lift':
        return 'easeOutCubic'
    if from_tag == 'lift' and to_tag == 'apex':
        return 'easeOutExpo'
    if from_tag == 'apex' and to_tag == 'apexHold':
        return 'holdExact'
    if from_tag == 'apexHold' and to_tag == 'snap':
        return 'easeOutExpo'
    if from_tag in ('windup', 'apex') and to_tag == 'anticipation':
        return 'easeOutExpo'
    if from_tag in ('anticipation', 'apex') and to_tag == 'snap':
        return 'easeOutExpo'
    if from_tag == 'snap' and to_tag in ('snap', 'contact'):
        return 'easeOutExpo'
    if from_tag == 'anticipation' and to_tag == 'contact':
        return 'holdThenSnap'
    if from_tag == 'contact' and to_tag == 'contactHold':
        return 'holdExact'
    if attack_name == 'AxeKick' and from_tag == 'contactHold' and to_tag == 'recoil':
        return 'movingHold'
    if attack_name == 'AxeKick' and from_tag == 'recoil' and to_tag == 'recoverySettle':
        return 'movingHold'
    if from_tag in ('contact', 'contactHold') and to_tag == 'recoil':
        return 'stepHold'
    if from_tag == 'recoil' and to_tag == 'settle':
        return 'dampedRecover'
    return 'easeOutCubic'


def attack_easing_value(base, name, t):
    if name == 'holdExact':
        return 0.0
    if name == 'movingHold':
        return 1.0 - ((1.0 - t) ** 3)
    return base.easing_value(name, t)


def build_appeal_sprite_timing(base, index_data, metadata, anchors):
    attack_end = float(metadata.get('attack_end', 0.25))
    style = index_data.get('attackStyle', 'punch')
    attack_name = index_data.get('attackName', '')
    total_frames = max(8, round(attack_end * 60))
    anchor_map = {entry['tag']: entry for entry in anchors}
    source_frames = index_data['frames']

    def pick_anchor(*tags):
        for tag in tags:
            if tag in anchor_map:
                return anchor_map[tag]
        return anchors[-1]

    def source_at(time_value):
        return min(source_frames, key=lambda frame: abs(frame['time'] - time_value))

    def anchor_from_source(tag, source_frame):
        return {
            'tag': tag,
            'frameIndex': source_frame['frameIndex'],
            'time': source_frame['time'],
            'description': source_frame['description'],
            'attackStyle': source_frame.get('attackStyle', style),
            'reach': source_frame.get('strikeReach', 0.0),
            'effectorHeight': base.round_value(source_frame.get('effectorHeight', 0.0), 5),
            'effectorExtension': base.round_value(source_frame.get('effectorExtension', 0.0), 5),
            'motionTotal': source_frame.get('motionTotal', 0.0),
        }

    def emit_schedule(desired):
        schedule = []
        last = -1
        for tag, frame_no, anchor in desired:
            frame_no = max(last + 1, frame_no)
            schedule.append({
                'tag': tag,
                'spriteFrame': frame_no,
                'sourceFrameIndex': anchor['frameIndex'],
                'sourceTime': anchor['time'],
                'description': anchor['description'],
                'attackStyle': anchor.get('attackStyle', style),
                'reach': anchor.get('reach', 0.0),
                'effectorHeight': anchor.get('effectorHeight', 0.0),
                'effectorExtension': anchor.get('effectorExtension', 0.0),
                'motionTotal': anchor.get('motionTotal', 0.0),
                'easingOptions': attack_easing_options(tag),
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
        return schedule, holds

    if attack_name == 'AxeKick':
        desired = [
            ('start', 0, anchor_from_source('start', source_at(0.0))),
            ('anticipation', 6, anchor_from_source('anticipation', source_at(0.16667))),
            ('anticipationHold', 11, anchor_from_source('anticipationHold', source_at(0.2))),
            ('lift', 14, anchor_from_source('lift', source_at(0.26667))),
            ('apex', 17, anchor_from_source('apex', source_at(0.36667))),
            ('apexHold', 19, anchor_from_source('apexHold', source_at(0.36667))),
            ('snap', 21, anchor_from_source('snap', source_at(0.4))),
            ('contact', 22, anchor_from_source('contact', source_at(0.43333))),
            ('contactHold', 28, anchor_from_source('contactHold', source_at(0.43333))),
            ('recoil', 31, anchor_from_source('recoil', source_at(0.53333))),
            ('recoverySettle', 35, anchor_from_source('recoverySettle', source_at(0.66667))),
            ('settle', total_frames, anchor_from_source('settle', source_at(0.0))),
        ]
        schedule, holds = emit_schedule(desired)
    elif attack_name == 'AxleKick':
        desired = [
            ('start', 0, anchor_from_source('start', source_at(0.03333))),
            ('windup', 6, anchor_from_source('windup', source_at(0.23333))),
            ('anticipation', 11, anchor_from_source('anticipation', source_at(0.3))),
            ('snap', 14, anchor_from_source('snap', source_at(0.4))),
            ('contact', 18, anchor_from_source('contact', source_at(0.46667))),
            ('contactHold', 23, anchor_from_source('contactHold', source_at(0.46667))),
            ('recoil', 27, anchor_from_source('recoil', source_at(0.66667))),
            ('settle', total_frames, anchor_from_source('settle', source_at(0.0))),
        ]
        schedule, holds = emit_schedule(desired)
    elif attack_name == 'LowBackKick':
        desired = [
            ('start', 0, anchor_from_source('start', source_at(0.0))),
            ('windup', 5, anchor_from_source('windup', source_at(0.16667))),
            ('anticipation', 10, anchor_from_source('anticipation', source_at(0.23333))),
            ('anticipationHold', 13, anchor_from_source('anticipationHold', source_at(0.26667))),
            ('contact', 18, anchor_from_source('contact', source_at(0.33333))),
            ('contactHold', 23, anchor_from_source('contactHold', source_at(0.33333))),
            ('recoil', 27, anchor_from_source('recoil', source_at(0.8))),
            ('settle', total_frames, anchor_from_source('settle', source_at(0.0))),
        ]
        schedule, holds = emit_schedule(desired)
    elif attack_name == 'FrontKick':
        desired = [
            ('start', 0, anchor_from_source('start', source_at(0.03333))),
            ('anticipation', 9, anchor_from_source('anticipation', source_at(0.2))),
            ('contact', 14, anchor_from_source('contact', source_at(0.36667))),
            ('contactHold', 15, anchor_from_source('contactHold', source_at(0.36667))),
            ('recoil', 18, anchor_from_source('recoil', source_at(0.5))),
            ('recoilSettle', 22, anchor_from_source('recoilSettle', source_at(0.56667))),
            ('settle', total_frames, anchor_from_source('settle', source_at(0.03333))),
        ]
        schedule, holds = emit_schedule(desired)
    else:
        anticipation_frame = max(3, round(total_frames * (0.20 if style == 'kick' else 0.18)))
        snap_gap = 8 if style == 'kick' else 4
        contact_room = 9 if style == 'kick' else 4
        contact_frame = min(total_frames - contact_room, anticipation_frame + snap_gap)
        if style == 'kick':
            contact_hold_frame = min(total_frames - 4, contact_frame + 5)
            recoil_frame = min(total_frames - 2, contact_hold_frame + 3)
            desired = [
                ('start', 0, pick_anchor('start', 'anticipation', 'contact')),
                ('anticipation', anticipation_frame, pick_anchor('anticipation', 'contact', 'start')),
                ('contact', contact_frame, pick_anchor('contact', 'anticipation', 'recoil')),
                ('contactHold', contact_hold_frame, pick_anchor('contact', 'anticipation', 'recoil')),
                ('recoil', recoil_frame, pick_anchor('recoil', 'contact', 'settle')),
                ('settle', total_frames, pick_anchor('start', 'anticipation', 'contact')),
            ]
        else:
            recoil_frame = min(total_frames - 2, contact_frame + 3)
            desired = [
                ('start', 0, pick_anchor('start', 'anticipation', 'contact')),
                ('anticipation', anticipation_frame, pick_anchor('anticipation', 'contact', 'start')),
                ('contact', contact_frame, pick_anchor('contact', 'anticipation', 'recoil')),
                ('recoil', recoil_frame, pick_anchor('recoil', 'contact', 'settle')),
                ('settle', total_frames, pick_anchor('start', 'anticipation', 'contact')),
            ]
        schedule, holds = emit_schedule(desired)

    return {
        'schema': 'pose-lab-sf2-reduction-v1',
        'actorKey': 'ares',
        'clipName': index_data['clipName'],
        'goal': 'Street Fighter 2 style discrete read poses with procedural 3D easing between anchors.',
        'timingPolicy': 'preserve source keyframe burst around snap, then hold contact before recovery',
        'combatWindowSeconds': attack_end,
        'combatWindowFrames60fps': total_frames,
        'discardedTailSeconds': base.round_value(max(0.0, index_data['duration'] - attack_end), 5),
        'spriteFrames': schedule,
        'segments': holds,
    }

def authored_contact_strength(base, attack_name, output_time):
    if attack_name != 'AxeKick':
        return 0.0
    timeline = AXE_KICK_CONTACT_EXAGGERATION['timeline']
    frame = round(output_time * 60.0, 3)
    if frame < timeline[0]['spriteFrame'] - 0.001:
        return 0.0
    if frame <= timeline[0]['spriteFrame'] + 0.001:
        return timeline[0]['strength']
    for left, right in zip(timeline, timeline[1:]):
        if frame <= right['spriteFrame'] + 0.001:
            span = max(1e-6, right['spriteFrame'] - left['spriteFrame'])
            alpha = (frame - left['spriteFrame']) / span
            eased = base.easing_value('easeOutCubic', alpha)
            return base.lerp(left['strength'], right['strength'], eased)
    return timeline[-1]['strength']


def authored_contact_sample(base, attack_name, node_name, path_name, sample, output_time):
    strength = authored_contact_strength(base, attack_name, output_time)
    if strength <= 0.00001 or attack_name != 'AxeKick':
        return sample
    if path_name == 'translation' and node_name == 'mixamorig:Hips':
        offset = AXE_KICK_CONTACT_EXAGGERATION['hipOffset']
        return [sample[i] + (offset[i] * strength) for i in range(3)]
    if path_name == 'rotation' and node_name in ('mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2'):
        bone_scale = {'mixamorig:Spine': 0.48, 'mixamorig:Spine1': 0.72, 'mixamorig:Spine2': 1.0}[node_name]
        angle = AXE_KICK_CONTACT_EXAGGERATION['torsoCompressionRadians'] * bone_scale * strength
        delta = [math.sin(angle * 0.5), 0.0, 0.0, math.cos(angle * 0.5)]
        return base.quat_normalize(base.quat_mul(sample, delta))
    if path_name == 'rotation' and node_name in ('mixamorig:LeftLeg', 'mixamorig:LeftFoot'):
        bone_scale = 1.0 if node_name == 'mixamorig:LeftLeg' else 0.55
        angle = AXE_KICK_CONTACT_EXAGGERATION['legCrashRadians'] * bone_scale * strength
        delta = [math.sin(angle * 0.5), 0.0, 0.0, math.cos(angle * 0.5)]
        return base.quat_normalize(base.quat_mul(sample, delta))
    return sample



def quat_to_euler_xyz(q):
    x, y, z, w = q
    sinr_cosp = 2.0 * (w * x + y * z)
    cosr_cosp = 1.0 - 2.0 * (x * x + y * y)
    roll_x = math.atan2(sinr_cosp, cosr_cosp)

    sinp = 2.0 * (w * y - z * x)
    if abs(sinp) >= 1.0:
        pitch_y = math.copysign(math.pi / 2.0, sinp)
    else:
        pitch_y = math.asin(sinp)

    siny_cosp = 2.0 * (w * z + x * y)
    cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
    yaw_z = math.atan2(siny_cosp, cosy_cosp)
    return [roll_x, pitch_y, yaw_z]


def quat_from_euler_xyz(roll_x, pitch_y, yaw_z):
    cx = math.cos(roll_x * 0.5)
    sx = math.sin(roll_x * 0.5)
    cy = math.cos(pitch_y * 0.5)
    sy = math.sin(pitch_y * 0.5)
    cz = math.cos(yaw_z * 0.5)
    sz = math.sin(yaw_z * 0.5)
    return [
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz,
        cx * cy * cz - sx * sy * sz,
    ]


def clamp_quat_x_to_reference(base, sample, reference):
    sample_euler = quat_to_euler_xyz(sample)
    reference_euler = quat_to_euler_xyz(reference)
    if abs(sample_euler[0]) > abs(reference_euler[0]):
        sample_euler[0] = reference_euler[0]
        return base.quat_normalize(quat_from_euler_xyz(sample_euler[0], sample_euler[1], sample_euler[2]))
    return sample


def timeline_strength(base, timeline, output_time, easing='easeOutCubic'):
    frame = round(output_time * 60.0, 3)
    if frame < timeline[0]['spriteFrame'] - 0.001:
        return 0.0
    if frame <= timeline[0]['spriteFrame'] + 0.001:
        return timeline[0]['strength']
    for left, right in zip(timeline, timeline[1:]):
        if frame <= right['spriteFrame'] + 0.001:
            span = max(1e-6, right['spriteFrame'] - left['spriteFrame'])
            alpha = (frame - left['spriteFrame']) / span
            eased = base.easing_value(easing, alpha)
            return base.lerp(left['strength'], right['strength'], eased)
    return timeline[-1]['strength']


def squash_stretch_strength(base, attack_name, output_time):
    layer = SQUASH_STRETCH_LAYERS.get(attack_name)
    if not layer or not layer.get('enabled'):
        return 0.0
    return timeline_strength(base, layer['timeline'], output_time)


def squash_stretch_sample(base, attack_name, node_name, path_name, sample, output_time):
    if path_name != 'scale' or not isinstance(sample, list):
        return sample
    layer = SQUASH_STRETCH_LAYERS.get(attack_name)
    if not layer or not layer.get('enabled'):
        return sample
    target = layer.get('bones', {}).get(node_name)
    if not target:
        return sample
    strength = squash_stretch_strength(base, attack_name, output_time)
    if strength <= 0.00001:
        return sample
    out = []
    for idx in range(min(len(sample), len(target))):
        scale_mult = base.lerp(1.0, float(target[idx]), strength)
        out.append(sample[idx] * scale_mult)
    return out


def frontkick_contact_mass_strength(base, attack_name, output_time):
    if attack_name != 'FrontKick' or not FRONTKICK_CONTACT_MASS_CARRY.get('enabled'):
        return 0.0
    return timeline_strength(base, FRONTKICK_CONTACT_MASS_CARRY['timeline'], output_time)


def frontkick_contact_mass_sample(base, attack_name, node_name, path_name, sample, output_time):
    strength = frontkick_contact_mass_strength(base, attack_name, output_time)
    if strength <= 0.00001 or attack_name != 'FrontKick':
        return sample
    if path_name == 'translation' and node_name == 'mixamorig:Hips':
        offset = FRONTKICK_CONTACT_MASS_CARRY['hipOffset']
        return [sample[i] + (offset[i] * strength) for i in range(3)]
    return sample


def authored_head_discipline_strength(base, attack_name, output_time):
    if attack_name != 'AxeKick' or not AXE_KICK_HEAD_DISCIPLINE.get('enabled'):
        return 0.0
    timeline = AXE_KICK_HEAD_DISCIPLINE['timeline']
    frame = round(output_time * 60.0, 3)
    if frame < timeline[0]['spriteFrame'] - 0.001:
        return 0.0
    if frame <= timeline[0]['spriteFrame'] + 0.001:
        return timeline[0]['strength']
    for left, right in zip(timeline, timeline[1:]):
        if frame <= right['spriteFrame'] + 0.001:
            span = max(1e-6, right['spriteFrame'] - left['spriteFrame'])
            alpha = (frame - left['spriteFrame']) / span
            eased = base.easing_value('easeOutCubic', alpha)
            return base.lerp(left['strength'], right['strength'], eased)
    return timeline[-1]['strength']


def authored_head_discipline_sample(base, attack_name, node_name, path_name, sample, output_time):
    strength = authored_head_discipline_strength(base, attack_name, output_time)
    if strength <= 0.00001 or attack_name != 'AxeKick' or path_name != 'rotation':
        return sample
    if node_name == 'mixamorig:Spine2':
        angle = AXE_KICK_HEAD_DISCIPLINE['spine2CounterRadians'] * strength
    elif node_name == 'mixamorig:Spine1':
        angle = AXE_KICK_HEAD_DISCIPLINE['spine1CounterRadians'] * strength
    else:
        return sample
    delta = [0.0, 0.0, math.sin(angle * 0.5), math.cos(angle * 0.5)]
    return base.quat_normalize(base.quat_mul(sample, delta))


def authored_head_gaze_strength(base, attack_name, output_time):
    if attack_name != 'AxeKick' or not AXE_KICK_HEAD_GAZE_STABILIZATION.get('enabled'):
        return 0.0
    timeline = AXE_KICK_HEAD_GAZE_STABILIZATION['timeline']
    frame = round(output_time * 60.0, 3)
    if frame < timeline[0]['spriteFrame'] - 0.001:
        return 0.0
    if frame <= timeline[0]['spriteFrame'] + 0.001:
        return timeline[0]['strength']
    for left, right in zip(timeline, timeline[1:]):
        if frame <= right['spriteFrame'] + 0.001:
            span = max(1e-6, right['spriteFrame'] - left['spriteFrame'])
            alpha = (frame - left['spriteFrame']) / span
            eased = base.easing_value('easeOutCubic', alpha)
            return base.lerp(left['strength'], right['strength'], eased)
    return timeline[-1]['strength']


def authored_head_gaze_sample(base, attack_name, node_name, path_name, sample, output_time):
    strength = authored_head_gaze_strength(base, attack_name, output_time)
    if strength <= 0.00001 or attack_name != 'AxeKick' or path_name != 'rotation':
        return sample
    angle = AXE_KICK_HEAD_GAZE_STABILIZATION['bonePitchRadians'].get(node_name)
    if angle is None:
        return sample
    scaled = angle * strength
    delta = [math.sin(scaled * 0.5), 0.0, 0.0, math.cos(scaled * 0.5)]
    return base.quat_normalize(base.quat_mul(sample, delta))


def authored_contact_guard_strength(base, attack_name, output_time):
    if attack_name != 'AxeKick' or not AXE_KICK_CONTACT_GUARD_STABILIZATION.get('enabled'):
        return 0.0
    timeline = AXE_KICK_CONTACT_GUARD_STABILIZATION['timeline']
    frame = round(output_time * 60.0, 3)
    if frame <= timeline[0]['spriteFrame'] + 0.001:
        return timeline[0]['strength']
    for left, right in zip(timeline, timeline[1:]):
        if frame <= right['spriteFrame'] + 0.001:
            span = max(1e-6, right['spriteFrame'] - left['spriteFrame'])
            alpha = (frame - left['spriteFrame']) / span
            eased = base.easing_value('easeOutCubic', alpha)
            return base.lerp(left['strength'], right['strength'], eased)
    return timeline[-1]['strength']


def authored_contact_guard_sample(base, attack_name, node_name, path_name, sample, output_time):
    strength = authored_contact_guard_strength(base, attack_name, output_time)
    if strength <= 0.00001 or attack_name != 'AxeKick' or path_name != 'rotation':
        return sample
    angle = AXE_KICK_CONTACT_GUARD_STABILIZATION['boneYawRadians'].get(node_name)
    if angle is None:
        return sample
    scaled = angle * strength
    delta = [0.0, math.sin(scaled * 0.5), 0.0, math.cos(scaled * 0.5)]
    return base.quat_normalize(base.quat_mul(sample, delta))


def axe_finished_strike_upper_body_strength(base, attack_name, output_time):
    if attack_name != 'AxeKick' or not AXE_KICK_FINISHED_STRIKE_UPPER_BODY_CARRY.get('enabled'):
        return 0.0
    timeline = AXE_KICK_FINISHED_STRIKE_UPPER_BODY_CARRY['timeline']
    frame = round(output_time * 60.0, 3)
    if frame <= timeline[0]['spriteFrame'] + 0.001:
        return timeline[0]['strength']
    for left, right in zip(timeline, timeline[1:]):
        if frame <= right['spriteFrame'] + 0.001:
            span = max(1e-6, right['spriteFrame'] - left['spriteFrame'])
            alpha = (frame - left['spriteFrame']) / span
            eased = base.easing_value('easeOutCubic', alpha)
            return base.lerp(left['strength'], right['strength'], eased)
    return timeline[-1]['strength']

def axe_grounded_finish_lower_body_strength(base, attack_name, output_time):
    if attack_name != 'AxeKick' or not AXE_KICK_GROUNDED_FINISH_LOWER_BODY_CARRY.get('enabled'):
        return 0.0
    timeline = AXE_KICK_GROUNDED_FINISH_LOWER_BODY_CARRY['timeline']
    frame = round(output_time * 60.0, 3)
    if frame <= timeline[0]['spriteFrame'] + 0.001:
        return timeline[0]['strength']
    for left, right in zip(timeline, timeline[1:]):
        if frame <= right['spriteFrame'] + 0.001:
            span = max(1e-6, right['spriteFrame'] - left['spriteFrame'])
            alpha = (frame - left['spriteFrame']) / span
            eased = base.easing_value('easeOutCubic', alpha)
            return base.lerp(left['strength'], right['strength'], eased)
    return timeline[-1]['strength']

def axe_finish_grounding_strength(base, attack_name, output_time):
    if attack_name != 'AxeKick' or not AXE_KICK_FINISH_GROUNDING.get('enabled'):
        return 0.0
    return timeline_strength(base, AXE_KICK_FINISH_GROUNDING['timeline'], output_time)



def clamp_baked_quaternion_track_x_against_contact(base, values, contact_frame, clamp_from_frame):
    stride = 4
    if len(values) < (contact_frame + 1) * stride:
        return values
    reference = values[contact_frame * stride:(contact_frame + 1) * stride]
    out = list(values)
    for frame in range(clamp_from_frame, len(values) // stride):
        start = frame * stride
        sample = out[start:start + stride]
        clamped = clamp_quat_x_to_reference(base, sample, reference)
        out[start:start + stride] = [base.round_value(v, 6) for v in clamped]
    return out



def generic_kick_precontact_carry_profile(reduced_data, attack_name):
    if not GENERIC_KICK_PRECONTACT_UPPER_BODY_CARRY.get('enabled'):
        return None
    if attack_name in GENERIC_KICK_PRECONTACT_UPPER_BODY_CARRY.get('excludeAttacks', []):
        return None
    if reduced_data.get('attackStyle') != 'kick':
        return None
    tags = {frame['tag']: frame for frame in reduced_data.get('spriteFrames', [])}
    contact = tags.get('contact')
    if not contact:
        return None
    source_time = max(0.0, round(float(contact['sourceTime']) - GENERIC_KICK_PRECONTACT_UPPER_BODY_CARRY['sourceLeadSeconds'], 5))
    timeline = []
    for phase in GENERIC_KICK_PRECONTACT_UPPER_BODY_CARRY['timeline']:
        frame = tags.get(phase['sourceTag'])
        if not frame:
            continue
        timeline.append({
            'spriteFrame': int(frame['spriteFrame']),
            'strength': phase['strength'],
            'tag': phase['tag'],
        })
    if not timeline:
        return None
    return {
        'kind': GENERIC_KICK_PRECONTACT_UPPER_BODY_CARRY['kind'],
        'enabled': True,
        'sourceTime': source_time,
        'targetBones': list(GENERIC_KICK_PRECONTACT_UPPER_BODY_CARRY['targetBones']),
        'timeline': timeline,
    }


def generic_kick_precontact_carry_strength(base, carry_profile, output_time):
    if not carry_profile or not carry_profile.get('enabled'):
        return 0.0
    timeline = carry_profile['timeline']
    frame = round(output_time * 60.0, 3)
    if frame <= timeline[0]['spriteFrame'] + 0.001:
        return timeline[0]['strength']
    for left, right in zip(timeline, timeline[1:]):
        if frame <= right['spriteFrame'] + 0.001:
            span = max(1e-6, right['spriteFrame'] - left['spriteFrame'])
            alpha = (frame - left['spriteFrame']) / span
            eased = base.easing_value('easeOutCubic', alpha)
            return base.lerp(left['strength'], right['strength'], eased)
    return timeline[-1]['strength']


def world_pose_from_baked_tracks(base, index, local_tracks_by_node, frame_index):
    local = {}
    for node_index, node in enumerate(index.nodes):
        local[node_index] = {
            'translation': list(node.get('translation', [0.0, 0.0, 0.0])),
            'rotation': list(node.get('rotation', [0.0, 0.0, 0.0, 1.0])),
            'scale': list(node.get('scale', [1.0, 1.0, 1.0])),
        }
    for node_name, entries in local_tracks_by_node.items():
        node_index = index.name_to_index.get(base.canonical(node_name))
        if node_index is None:
            continue
        for path_name, track in entries.items():
            stride = 4 if path_name == 'rotation' else 3 if path_name in ('translation', 'scale') else 1
            values = track['values']
            sample = values[frame_index * stride:(frame_index + 1) * stride]
            local[node_index][path_name] = list(sample) if stride > 1 else sample[0]
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


def apply_support_foot_plant(base, index, tracks, attack_name, total_frames):
    profile = FOOT_PLANT_PROFILES.get(attack_name)
    if not profile or not profile.get('enabled'):
        return tracks
    tracks_by_name = {track['name']: track for track in tracks}
    local_tracks_by_node = {}
    for track in tracks:
        if '.' not in track['name']:
            continue
        node_name, suffix = track['name'].rsplit('.', 1)
        path_name = 'rotation' if suffix == 'quaternion' else 'translation' if suffix == 'position' else suffix
        local_tracks_by_node.setdefault(node_name, {})[path_name] = track
    windows = profile.get('windows') or [profile]
    for window in windows:
        root_bone = window.get('rootBone', profile.get('rootBone'))
        root_track = tracks_by_name.get(root_bone + '.position')
        if not root_track:
            continue
        foot_index = index.name_to_index.get(base.canonical(window['footBone']))
        root_index = index.name_to_index.get(base.canonical(root_bone))
        if foot_index is None or root_index is None:
            continue
        anchor_world = world_pose_from_baked_tracks(base, index, local_tracks_by_node, window['anchorFrame'])[foot_index][0]
        values = list(root_track['values'])
        for frame_index in range(window['startFrame'], min(window['endFrame'], total_frames) + 1):
            world = world_pose_from_baked_tracks(base, index, local_tracks_by_node, frame_index)
            current = world[foot_index][0]
            delta_world = [anchor_world[i] - current[i] for i in range(3)]
            parent_index = index.parents.get(root_index)
            if parent_index is None:
                delta_local = delta_world
            else:
                parent_pos, parent_rot, parent_scale = world[parent_index]
                inv_parent_rot = base.quat_conjugate(parent_rot)
                rotated = base.quat_rotate(inv_parent_rot, delta_world)
                delta_local = [rotated[i] / parent_scale[i] if abs(parent_scale[i]) > 1e-8 else 0.0 for i in range(3)]
            offset = frame_index * 3
            values[offset:offset + 3] = [base.round_value(values[offset + i] + delta_local[i], 6) for i in range(3)]
            local_tracks_by_node[root_bone]['translation']['values'] = values
        root_track['values'] = values
    return tracks



def apply_axekick_recovery_footline_guard(base, tracks, attack_name, total_frames):
    if attack_name != 'AxeKick' or not AXE_KICK_RECOVERY_FOOTLINE_GUARD.get('enabled'):
        return tracks
    tracks_by_name = {track['name']: track for track in tracks}
    start_frame = AXE_KICK_RECOVERY_FOOTLINE_GUARD['startFrame']
    end_frame = min(AXE_KICK_RECOVERY_FOOTLINE_GUARD['endFrame'], total_frames - 1)
    ref_start = AXE_KICK_RECOVERY_FOOTLINE_GUARD['referenceStartFrame']
    ref_end = AXE_KICK_RECOVERY_FOOTLINE_GUARD['referenceEndFrame']
    span = max(1, ref_end - ref_start)
    for track_name in AXE_KICK_RECOVERY_FOOTLINE_GUARD.get('translationTracks', []):
        track = tracks_by_name.get(track_name)
        if not track:
            continue
        values = list(track['values'])
        stride = 3
        start_sample = values[ref_start * stride:(ref_start + 1) * stride]
        end_sample = values[ref_end * stride:(ref_end + 1) * stride]
        for frame_index in range(start_frame, end_frame + 1):
            alpha = max(0.0, min(1.0, (frame_index - ref_start) / span))
            eased = base.easing_value(AXE_KICK_RECOVERY_FOOTLINE_GUARD['easing'], alpha)
            sample = [base.lerp(start_sample[i], end_sample[i], eased) for i in range(stride)]
            offset = frame_index * stride
            values[offset:offset + stride] = [base.round_value(v, 6) for v in sample]
        track['values'] = values
    for node_name in AXE_KICK_RECOVERY_FOOTLINE_GUARD.get('holdRotationBones', []):
        track = tracks_by_name.get(node_name + '.quaternion')
        if not track:
            continue
        values = list(track['values'])
        start_sample = values[ref_start * 4:(ref_start + 1) * 4]
        for frame_index in range(start_frame, end_frame + 1):
            offset = frame_index * 4
            values[offset:offset + 4] = [base.round_value(v, 6) for v in start_sample]
        track['values'] = values
    return tracks



def build_baked_poseclip(base, index, clip_name, attack_name, reduced_data):
    animation = index.animations[clip_name]
    sprite_frames = reduced_data['spriteFrames']
    duration = base.round_value(reduced_data['combatWindowFrames60fps'] / 60.0, 5)
    source_duration = max((animation.get('key_times') or [0.0])[-1], 0.00001)
    output_times = [base.round_value(frame / 60.0, 5) for frame in range(reduced_data['combatWindowFrames60fps'] + 1)]
    segments = []
    for left, right in zip(sprite_frames, sprite_frames[1:]):
        segments.append({
            'startFrame': left['spriteFrame'],
            'endFrame': right['spriteFrame'],
            'startTime': left['sourceTime'],
            'endTime': right['sourceTime'],
            'easing': attack_segment_easing(left['tag'], right['tag'], attack_name),
            'fromTag': left['tag'],
            'toTag': right['tag'],
        })

    def mapped_source_time(output_time):
        frame = output_time * 60.0
        if frame <= segments[0]['startFrame']:
            return segments[0]['startTime']
        for seg in segments:
            if frame <= seg['endFrame']:
                if abs(frame - seg['startFrame']) < 0.001:
                    return seg['startTime']
                if abs(frame - seg['endFrame']) < 0.001:
                    return seg['endTime']
                span = max(1e-6, seg['endFrame'] - seg['startFrame'])
                alpha = (frame - seg['startFrame']) / span
                eased = attack_easing_value(base, seg['easing'], alpha)
                start_time = seg['startTime']
                end_time = seg['endTime']
                if end_time + 1e-6 < start_time:
                    wrapped = base.lerp(start_time, end_time + source_duration, eased)
                    return wrapped % source_duration
                return base.lerp(start_time, end_time, eased)
        return segments[-1]['endTime']

    overlay_config = ARM_OVERLAY_SOURCE.get(attack_name)
    kick_precontact_carry = generic_kick_precontact_carry_profile(reduced_data, attack_name)
    overlay_animation = None
    overlay_channels_by_name = {}
    overlay_track_names = set()
    if overlay_config:
        overlay_clip = overlay_config['sourceClipName']
        if overlay_clip not in index.animations:
            raise ValueError(f'Arm overlay source clip missing: {overlay_clip}')
        overlay_animation = index.animations[overlay_clip]
        for overlay_node_index, overlay_node_channels in overlay_animation['channels'].items():
            overlay_node_name = index.nodes[overlay_node_index].get('name') or f'node_{overlay_node_index}'
            overlay_channels_by_name[overlay_node_name] = overlay_node_channels

    def overlay_phase(output_time):
        timeline = overlay_config['timeline']
        frame = output_time * 60.0
        if frame <= timeline[0]['spriteFrame']:
            return timeline[0]['sourceTime'], timeline[0].get('strength', 1.0)
        for left, right in zip(timeline, timeline[1:]):
            if frame <= right['spriteFrame'] + 0.001:
                if abs(frame - left['spriteFrame']) < 0.001:
                    return left['sourceTime'], left.get('strength', 1.0)
                if abs(frame - right['spriteFrame']) < 0.001:
                    return right['sourceTime'], right.get('strength', 1.0)
                span = max(1e-6, right['spriteFrame'] - left['spriteFrame'])
                alpha = (frame - left['spriteFrame']) / span
                easing = left.get('easing') or attack_segment_easing(left['tag'], right['tag'], attack_name)
                eased = attack_easing_value(base, easing, alpha)
                return (
                    base.lerp(left['sourceTime'], right['sourceTime'], eased),
                    base.lerp(left.get('strength', 1.0), right.get('strength', 1.0), eased),
                )
        return timeline[-1]['sourceTime'], timeline[-1].get('strength', 1.0)

    tracks = []
    for node_index, node_channels in animation['channels'].items():
        node_name = index.nodes[node_index].get('name') or f'node_{node_index}'
        for path_name, channel in node_channels.items():
            suffix = 'quaternion' if path_name == 'rotation' else 'position' if path_name == 'translation' else path_name
            track_name = node_name + '.' + suffix
            overlay_channel = None
            if overlay_config and path_name == overlay_config['path'] and node_name in overlay_config['targetBones']:
                overlay_channel = overlay_channels_by_name.get(node_name, {}).get(path_name)
                if overlay_channel:
                    overlay_track_names.add(track_name)
            values = []
            for output_time in output_times:
                base_sample = index._sample_channel(channel, mapped_source_time(output_time))
                if attack_name == 'AxeKick' and path_name == 'rotation' and node_name in AXE_KICK_FINISHED_STRIKE_UPPER_BODY_CARRY['targetBones']:
                    carry_strength = axe_finished_strike_upper_body_strength(base, attack_name, output_time)
                    if carry_strength > 0.00001:
                        carry_sample = index._sample_channel(channel, AXE_KICK_FINISHED_STRIKE_UPPER_BODY_CARRY['sourceTime'])
                        base_sample = base.quat_slerp(base_sample, carry_sample, carry_strength)
                if attack_name == 'AxeKick':
                    lower_body_strength = axe_grounded_finish_lower_body_strength(base, attack_name, output_time)
                    if lower_body_strength > 0.00001:
                        if path_name == 'translation' and node_name in AXE_KICK_GROUNDED_FINISH_LOWER_BODY_CARRY['translationBones']:
                            carry_sample = index._sample_channel(channel, AXE_KICK_GROUNDED_FINISH_LOWER_BODY_CARRY['sourceTime'])
                            base_sample = [base.lerp(base_sample[i], carry_sample[i], lower_body_strength) for i in range(len(base_sample))]
                        elif path_name == 'rotation' and node_name in AXE_KICK_GROUNDED_FINISH_LOWER_BODY_CARRY['rotationBones']:
                            carry_sample = index._sample_channel(channel, AXE_KICK_GROUNDED_FINISH_LOWER_BODY_CARRY['sourceTime'])
                            base_sample = base.quat_slerp(base_sample, carry_sample, lower_body_strength)
                if kick_precontact_carry and path_name == 'rotation' and node_name in kick_precontact_carry['targetBones']:
                    carry_strength = generic_kick_precontact_carry_strength(base, kick_precontact_carry, output_time)
                    if carry_strength > 0.00001:
                        carry_sample = index._sample_channel(channel, kick_precontact_carry['sourceTime'])
                        base_sample = base.quat_slerp(base_sample, carry_sample, carry_strength)
                if attack_name == 'AxeKick':
                    finish_grounding_strength = axe_finish_grounding_strength(base, attack_name, output_time)
                    if finish_grounding_strength > 0.00001:
                        if path_name == 'translation' and node_name in AXE_KICK_FINISH_GROUNDING.get('translationBones', []):
                            offset = AXE_KICK_FINISH_GROUNDING['hipOffset']
                            base_sample = [base_sample[i] + (offset[i] * finish_grounding_strength) for i in range(len(base_sample))]
                        elif path_name == 'rotation' and node_name in AXE_KICK_FINISH_GROUNDING['rotationBones']:
                            contact_sample = index._sample_channel(channel, AXE_KICK_FINISH_GROUNDING['sourceTime'])
                            clamped = clamp_quat_x_to_reference(base, base_sample, contact_sample)
                            base_sample = base.quat_slerp(base_sample, clamped, finish_grounding_strength)
                if overlay_channel:
                    overlay_time, phase_strength = overlay_phase(output_time)
                    overlay_sample = index._sample_channel(overlay_channel, overlay_time)
                    bone_strength = overlay_config.get('boneStrength', {}).get(node_name, 1.0)
                    blend = max(0.0, min(1.0, phase_strength * bone_strength))
                    sample = base.quat_slerp(base_sample, overlay_sample, blend)
                else:
                    sample = base_sample
                sample = authored_contact_sample(base, attack_name, node_name, path_name, sample, output_time)
                sample = frontkick_contact_mass_sample(base, attack_name, node_name, path_name, sample, output_time)
                sample = squash_stretch_sample(base, attack_name, node_name, path_name, sample, output_time)
                sample = authored_head_discipline_sample(base, attack_name, node_name, path_name, sample, output_time)
                sample = authored_head_gaze_sample(base, attack_name, node_name, path_name, sample, output_time)
                sample = authored_contact_guard_sample(base, attack_name, node_name, path_name, sample, output_time)
                if isinstance(sample, list):
                    values.extend(base.round_value(v, 6) for v in sample)
                else:
                    values.append(base.round_value(sample, 6))
            if attack_name == 'AxeKick' and path_name == 'rotation' and node_name in AXE_KICK_FINISH_GROUNDING['rotationBones']:
                values = clamp_baked_quaternion_track_x_against_contact(base, values, 22, 29)
            stride = 4 if path_name == 'rotation' else 3 if path_name in ('translation', 'scale') else 1
            if len(values) >= stride * 2:
                values[-stride:] = values[:stride]
            tracks.append({
                'name': track_name,
                'type': 'quaternion' if path_name == 'rotation' else 'vector' if path_name in ('translation', 'scale') else 'number',
                'times': output_times,
                'values': values,
            })

    tracks = apply_axekick_recovery_footline_guard(base, tracks, attack_name, int(reduced_data['combatWindowFrames60fps']))
    tracks = apply_support_foot_plant(base, index, tracks, attack_name, int(reduced_data['combatWindowFrames60fps']))

    stem = safe_stem(attack_name)
    user_data = {
        'origin': f'cleanup:ares:sf2-{stem}',
        'cleanup': True,
        'cleanupOp': 'sf2-attack-bake',
        'mode': 'sf2 reduced attack baked from source-time remap',
        'attackName': attack_name,
        'sourceName': attack_name,
        'sourceClipName': clip_name,
        'sourceDuration': reduced_data['combatWindowSeconds'],
        'sourceReduction': reduced_data,
        'segmentEasing': segments,
    }
    if attack_name == 'AxeKick':
        user_data['contactExaggeration'] = AXE_KICK_CONTACT_EXAGGERATION
        user_data['headDiscipline'] = AXE_KICK_HEAD_DISCIPLINE
        user_data['headGazeStabilization'] = AXE_KICK_HEAD_GAZE_STABILIZATION
        user_data['contactGuardStabilization'] = AXE_KICK_CONTACT_GUARD_STABILIZATION
        user_data['groundedFinishLowerBodyCarry'] = AXE_KICK_GROUNDED_FINISH_LOWER_BODY_CARRY
        user_data['finishGrounding'] = AXE_KICK_FINISH_GROUNDING
        user_data['badFrameRules'] = AXE_KICK_BAD_FRAME_RULES
    if attack_name in FOOT_PLANT_PROFILES:
        user_data['footPlantProfile'] = FOOT_PLANT_PROFILES[attack_name]
    if kick_precontact_carry:
        user_data['kickPrecontactUpperBodyCarry'] = kick_precontact_carry
    steering_profile = smash_realistic_steering_profile(attack_name, reduced_data.get('attackStyle', 'punch'))
    if steering_profile:
        user_data['smashRealisticSteering'] = steering_profile
    squash_stretch = SQUASH_STRETCH_LAYERS.get(attack_name)
    if squash_stretch and squash_stretch.get('enabled'):
        user_data['squashStretchLayer'] = squash_stretch
    if attack_name == 'Headbutt':
        user_data['guardRuleException'] = HEADBUTT_GUARD_RULE_EXCEPTION
    if overlay_config:
        user_data['sourceOverlays'] = [{
            'kind': 'upper-limb-rotation-overlay',
            'sourceClipName': overlay_config['sourceClipName'],
            'mode': overlay_config['mode'],
            'reason': overlay_config['reason'],
            'targetBones': overlay_config['targetBones'],
            'targetPath': overlay_config['path'],
            'boneStrength': overlay_config.get('boneStrength', {}),
            'timeline': overlay_config['timeline'],
            'trackCount': len(overlay_track_names),
            'tracks': sorted(overlay_track_names),
        }]

    return {
        'exportedAt': 'offline-script',
        'actorKey': 'ares',
        'actorLabel': 'Ares',
        'attackName': attack_name,
        'sourceClipName': clip_name,
        'clip': {
            'schema': 'pose-lab-animation-clip-v1',
            'name': f'{attack_name} [sf2-eased]',
            'duration': duration,
            'userData': user_data,
            'tracks': tracks,
        },
    }


def build_visual_evidence(base, attack_name, clip_name, reduced_data, poseclip, index_path, reduced_path, critique_path, poseclip_path, evidence_path):
    stem = safe_stem(attack_name)
    existing_by_key = {}
    if evidence_path.exists():
        try:
            existing = json.loads(evidence_path.read_text())
            for slot in existing.get('captureSlots', []):
                existing_by_key[slot.get('evidenceKey')] = slot
        except json.JSONDecodeError:
            existing_by_key = {}

    user_data = poseclip.get('clip', {}).get('userData', {})
    overlays = user_data.get('sourceOverlays', [])
    contact_exaggeration = user_data.get('contactExaggeration')
    head_discipline = user_data.get('headDiscipline')
    head_gaze = user_data.get('headGazeStabilization')
    contact_guard = user_data.get('contactGuardStabilization')
    kick_precontact_carry = user_data.get('kickPrecontactUpperBodyCarry')
    guard_rule_exception = user_data.get('guardRuleException')
    smash_realistic_steering = user_data.get('smashRealisticSteering')
    contact_modifiers_by_frame = {}
    if contact_exaggeration:
        for phase in contact_exaggeration.get('timeline', []):
            contact_modifiers_by_frame.setdefault(int(phase['spriteFrame']), []).append({
                'kind': contact_exaggeration.get('kind'),
                'tag': phase.get('tag'),
                'strength': phase.get('strength'),
                'reason': contact_exaggeration.get('reason'),
                'hipOffset': contact_exaggeration.get('hipOffset'),
                'torsoCompressionRadians': contact_exaggeration.get('torsoCompressionRadians'),
                'legCrashRadians': contact_exaggeration.get('legCrashRadians'),
            })
    head_discipline_by_frame = {}
    if head_discipline:
        for phase in head_discipline.get('timeline', []):
            head_discipline_by_frame.setdefault(int(phase['spriteFrame']), []).append({
                'kind': head_discipline.get('kind'),
                'tag': phase.get('tag'),
                'strength': phase.get('strength'),
                'reason': head_discipline.get('reason'),
                'rule': head_discipline.get('rule'),
                'torsoMinAheadOfHipsXZ': head_discipline.get('torsoMinAheadOfHipsXZ'),
                'headMinAheadOfSpine2XZ': head_discipline.get('headMinAheadOfSpine2XZ'),
                'headMaxAheadOfSpine2XZ': head_discipline.get('headMaxAheadOfSpine2XZ'),
                'headMinAheadOfHipsXZ': head_discipline.get('headMinAheadOfHipsXZ'),
                'headMaxAheadOfHipsXZ': head_discipline.get('headMaxAheadOfHipsXZ'),
                'footMinAheadOfHeadXZ': head_discipline.get('footMinAheadOfHeadXZ'),
                'spine2CounterRadians': head_discipline.get('spine2CounterRadians'),
                'spine1CounterRadians': head_discipline.get('spine1CounterRadians'),
            })
    head_gaze_by_frame = {}
    if head_gaze:
        for phase in head_gaze.get('timeline', []):
            head_gaze_by_frame.setdefault(int(phase['spriteFrame']), []).append({
                'kind': head_gaze.get('kind'),
                'mode': head_gaze.get('mode'),
                'tag': phase.get('tag'),
                'strength': phase.get('strength'),
                'reason': head_gaze.get('reason'),
                'faceAxis': head_gaze.get('faceAxis'),
                'targetBones': head_gaze.get('targetBones'),
                'bonePitchRadians': head_gaze.get('bonePitchRadians'),
                'minContactHeadForwardY': head_gaze.get('minContactHeadForwardY'),
            })
    contact_guard_by_frame = {}
    if contact_guard:
        for phase in contact_guard.get('timeline', []):
            contact_guard_by_frame.setdefault(int(phase['spriteFrame']), []).append({
                'kind': contact_guard.get('kind'),
                'mode': contact_guard.get('mode'),
                'tag': phase.get('tag'),
                'strength': phase.get('strength'),
                'reason': contact_guard.get('reason'),
                'targetBones': contact_guard.get('targetBones'),
                'boneYawRadians': contact_guard.get('boneYawRadians'),
                'maxHandBelowSpine2Y': contact_guard.get('maxHandBelowSpine2Y'),
            })
    kick_precontact_by_frame = {}
    if kick_precontact_carry:
        for phase in kick_precontact_carry.get('timeline', []):
            kick_precontact_by_frame.setdefault(int(phase['spriteFrame']), []).append({
                'kind': kick_precontact_carry.get('kind'),
                'tag': phase.get('tag'),
                'strength': phase.get('strength'),
                'sourceTime': kick_precontact_carry.get('sourceTime'),
                'targetBones': kick_precontact_carry.get('targetBones'),
            })
    overlay_phases_by_frame = {}
    for overlay in overlays:
        for phase in overlay.get('timeline', []):
            overlay_phases_by_frame.setdefault(int(phase['spriteFrame']), []).append({
                'kind': overlay.get('kind'),
                'sourceClipName': overlay.get('sourceClipName'),
                'mode': overlay.get('mode'),
                'tag': phase.get('tag'),
                'sourceTime': phase.get('sourceTime'),
                'strength': phase.get('strength'),
                'easing': phase.get('easing'),
                'targetPath': overlay.get('targetPath'),
                'trackCount': overlay.get('trackCount'),
            })

    slots = []
    for frame in reduced_data['spriteFrames']:
        sprite_frame = int(frame['spriteFrame'])
        tag = frame['tag']
        evidence_key = f'ares:{stem}:sf2:f{sprite_frame:03d}:{tag}'
        expected_path = f'assets/pose_evidence/ares/{stem}/sf2/f{sprite_frame:03d}_{tag}.png'
        existing_slot = existing_by_key.get(evidence_key, {})
        screenshot = existing_slot.get('screenshot') or {
            'linked': False,
            'expectedPath': expected_path,
        }
        screenshot.setdefault('expectedPath', expected_path)
        screenshot.setdefault('linked', bool(screenshot.get('path')))
        slots.append({
            'evidenceKey': evidence_key,
            'tag': tag,
            'spriteFrame': sprite_frame,
            'poseclipTime': base.round_value(sprite_frame / 60.0, 5),
            'sourceClipName': clip_name,
            'sourceFrameIndex': frame.get('sourceFrameIndex'),
            'sourceTime': frame.get('sourceTime'),
            'description': frame.get('description'),
            'attackStyle': frame.get('attackStyle'),
            'reach': frame.get('reach'),
            'effectorHeight': frame.get('effectorHeight'),
            'effectorExtension': frame.get('effectorExtension'),
            'motionTotal': frame.get('motionTotal'),
            'overlayPhases': overlay_phases_by_frame.get(sprite_frame, []),
            'contactModifiers': contact_modifiers_by_frame.get(sprite_frame, []),
            'headDiscipline': head_discipline_by_frame.get(sprite_frame, []),
            'headGazeStabilization': head_gaze_by_frame.get(sprite_frame, []),
            'contactGuardStabilization': contact_guard_by_frame.get(sprite_frame, []),
            'kickPrecontactUpperBodyCarry': kick_precontact_by_frame.get(sprite_frame, []),
            'screenshot': screenshot,
            'notes': existing_slot.get('notes', []),
        })

    return {
        'schema': 'pose-lab-visual-evidence-v1',
        'actorKey': 'ares',
        'actorLabel': 'Ares',
        'attackName': attack_name,
        'sourceClipName': clip_name,
        'poseclip': str(poseclip_path.relative_to(ROOT)),
        'index': str(index_path.relative_to(ROOT)),
        'reduction': str(reduced_path.relative_to(ROOT)),
        'critique': str(critique_path.relative_to(ROOT)),
        'goal': 'Link screenshots or video captures to exact generated pose data for visual critique and regression review.',
        'capturePolicy': 'Attach screenshots to captureSlots by evidenceKey; do not edit generated poseclip tracks to store screenshot data.',
        'sourceOverlays': overlays,
        'contactExaggeration': contact_exaggeration,
        'headDiscipline': head_discipline,
        'headGazeStabilization': head_gaze,
        'contactGuardStabilization': contact_guard,
        'kickPrecontactUpperBodyCarry': kick_precontact_carry,
        'guardRuleException': guard_rule_exception,
        'smashRealisticSteering': smash_realistic_steering,
        'captureSlots': slots,
    }

def build_critique(base, index_data, reduced_data, metadata, anchors, attack_name, clip_name):
    frames = index_data['frames']
    attack_end = float(metadata.get('attack_end', 0.25))
    tail = max(0.0, index_data['duration'] - attack_end)
    strike_peak = max(frames, key=lambda frame: abs(frame['strikeReach']))
    readable = [frame for frame in frames if frame['time'] <= attack_end + 0.05]
    lines = []
    lines.append(f'# Ares {attack_name} SF2 Reduction Critique')
    lines.append('')
    lines.append('## Source Read')
    lines.append(f'- Source clip: `{clip_name}`')
    lines.append(f'- Runtime attack name: `{attack_name}`')
    lines.append(f'- Original keyed frames: `{len(frames)}` over `{index_data["duration"]:.3f}s`')
    lines.append(f'- Gameplay attack end from metadata: `{attack_end:.3f}s`')
    lines.append(f'- Tail beyond gameplay window: `{tail:.3f}s`')
    lines.append(f'- Peak {index_data["strikeSide"]}-side reach occurs at frame `{strike_peak["frameIndex"]}` time `{strike_peak["time"]:.3f}s`')
    lines.append('')
    lines.append('## Reduction Verdict')
    lines.append(f'- Reduced schedule keeps `{len(reduced_data["spriteFrames"])}` read poses across `{reduced_data["combatWindowFrames60fps"]}` 60fps gameplay frames.')
    lines.append(f'- `{len(readable)}` keyed source frames land in or near the useful gameplay window.')
    lines.append('- Treat these as authored read poses; let the 3D easing carry the in-between motion.')
    lines.append('')
    lines.append('## Anchor Frames')
    for anchor in anchors:
        lines.append(f'- `{anchor["tag"]}` at `{anchor["time"]:.3f}s`: {anchor["description"]}')
    lines.append('')
    lines.append('## Runtime Policy')
    lines.append('- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.')
    lines.append('- Keep hit activation tied to metadata; late source tail frames are presentation only.')
    lines.append('- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.')
    return '\n'.join(lines) + '\n'


def main():
    base = load_base()
    index = base.GLBAnimationIndex(base.ARES_GLB)
    attacks = load_attack_metadata(base)
    results = []
    failures = []
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for metadata in attacks:
        attack_name = metadata['name']
        clip_name = CLIP_ALIASES.get(attack_name, attack_name)
        if clip_name not in index.animations:
            failures.append({'attackName': attack_name, 'clipName': clip_name, 'reason': 'clip missing from Ares.glb'})
            continue
        try:
            index_data = base.build_frame_records(index, clip_name, metadata)
            index_data['attackName'] = attack_name
            index_data['sourceClipName'] = clip_name
            index_data = annotate_attack_frames(base, index_data, attack_name)
            anchors = choose_appeal_anchor_frames(base, index_data, metadata)
            reduced = build_appeal_sprite_timing(base, index_data, metadata, anchors)
            reduced['attackName'] = attack_name
            reduced['sourceClipName'] = clip_name
            reduced['attackStyle'] = index_data.get('attackStyle', 'punch')
            reduced['appealScoring'] = index_data.get('appealScoring', 'generic')
            poseclip = build_baked_poseclip(base, index, clip_name, attack_name, reduced)
            critique = build_critique(base, index_data, reduced, metadata, anchors, attack_name, clip_name)
            stem = safe_stem(attack_name)
            index_path = OUT_DIR / f'ares_{stem}_index.json'
            reduced_path = OUT_DIR / f'ares_{stem}_sf2_reduction.json'
            critique_path = OUT_DIR / f'ares_{stem}_sf2_critique.md'
            poseclip_path = OUT_DIR / f'ares_{stem}_sf2.poseclip.json'
            evidence_path = OUT_DIR / f'ares_{stem}_sf2_visual_evidence.json'
            index_payload = {
                'schema': 'pose-lab-attack-index-v1',
                'actorKey': 'ares',
                'actorLabel': 'Ares',
                'attackName': attack_name,
                'clipName': clip_name,
                'metadata': metadata,
                'analysis': index_data,
                'anchors': anchors,
            }
            index_path.write_text(json.dumps(index_payload, indent=2) + '\n')
            reduced_path.write_text(json.dumps(reduced, indent=2) + '\n')
            critique_path.write_text(critique)
            visual_evidence = build_visual_evidence(base, attack_name, clip_name, reduced, poseclip, index_path, reduced_path, critique_path, poseclip_path, evidence_path)
            poseclip_path.write_text(json.dumps(poseclip, indent=2) + '\n')
            evidence_path.write_text(json.dumps(visual_evidence, indent=2) + '\n')
            steering_profile = smash_realistic_steering_profile(attack_name, index_data.get('attackStyle', 'punch'))
            results.append({
                'attackName': attack_name,
                'clipName': clip_name,
                'poseclip': str(poseclip_path.relative_to(ROOT)),
                'index': str(index_path.relative_to(ROOT)),
                'reduction': str(reduced_path.relative_to(ROOT)),
                'critique': str(critique_path.relative_to(ROOT)),
                'visualEvidence': str(evidence_path.relative_to(ROOT)),
                'attackStyle': index_data.get('attackStyle', 'punch'),
                'appealScoring': index_data.get('appealScoring', 'generic'),
                'smashRealisticSteering': steering_profile,
                'keyedFrames': len(index_data['frames']),
                'sourceDuration': index_data['duration'],
                'combatWindowFrames60fps': reduced['combatWindowFrames60fps'],
                'anchors': anchors,
            })
        except Exception as exc:
            failures.append({'attackName': attack_name, 'clipName': clip_name, 'reason': str(exc)})

    manifest = {
        'schema': 'pose-lab-sf2-attack-batch-v1',
        'actorKey': 'ares',
        'actorLabel': 'Ares',
        'sourceModel': str(base.ARES_GLB.relative_to(ROOT)),
        'sourceMetadata': str(base.ATTACKS_JSON.relative_to(ROOT)),
        'clipAliases': CLIP_ALIASES,
        'generatedCount': len(results),
        'failureCount': len(failures),
        'appealScoring': APPEAL_SCORING,
        'attacks': results,
        'failures': failures,
    }
    BATCH_MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
