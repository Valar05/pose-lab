#!/usr/bin/env python3
"""Build or export the Blender-first Meshy saber authoring scene.

Run from Blender:

  blender --background --python authoring/meshy_saber/blender_build_meshy_ready_authoring.py -- --repo-root . --save-blend authoring/meshy_saber/meshy_ready_authoring.blend

This script does not tune Pose Lab runtime offsets. It creates a clean DCC
scene where a human can author the Meshy saber hold directly.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import bpy
from mathutils import Vector


MESHY_RIG = "assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb"
FPS_REFERENCE = "assets/models/FPSPlayer.glb"
MESHY_SABRE = "assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".", help="Pose Lab repo root.")
    parser.add_argument("--save-blend", default="", help="Optional .blend output path.")
    parser.add_argument("--export-json", default="", help="Optional transform contract JSON path.")
    parser.add_argument("--export-glb", default="", help="Optional GLB output path.")
    argv = []
    if "--" in __import__("sys").argv:
      argv = __import__("sys").argv[__import__("sys").argv.index("--") + 1 :]
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_glb(path: Path, collection_name: str) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    collection = bpy.data.collections.new(collection_name)
    bpy.context.scene.collection.children.link(collection)
    for obj in imported:
        for existing in obj.users_collection:
            existing.objects.unlink(obj)
        collection.objects.link(obj)
    return imported


def find_armature(objects: list[bpy.types.Object]) -> bpy.types.Object | None:
    for obj in objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def find_object(objects: list[bpy.types.Object], contains: str) -> bpy.types.Object | None:
    needle = contains.lower()
    for obj in objects:
        if needle in obj.name.lower():
            return obj
    return None


def ensure_weapon_grip(meshy_armature: bpy.types.Object) -> bpy.types.Object:
    grip = bpy.data.objects.get("WeaponGrip")
    if grip is None:
        grip = bpy.data.objects.new("WeaponGrip", None)
        grip.empty_display_type = "SPHERE"
        grip.empty_display_size = 0.08
        bpy.context.scene.collection.objects.link(grip)
    grip.parent = meshy_armature
    grip.parent_type = "BONE"
    grip.parent_bone = "RightHand"
    grip.location = Vector((0.095 - 0.11512, 0.035 + 0.00773, -0.01 - 0.01127))
    grip.rotation_euler = (0.0, 0.0, 0.0)
    grip["pose_lab_contract"] = "RightHand -> WeaponGrip"
    return grip


def parent_sabre_to_grip(sabre: bpy.types.Object, grip: bpy.types.Object) -> None:
    sabre.name = "Meshy French Revolution Sabre"
    sabre.parent = grip
    sabre.location = (0.0, 0.0, 0.0)
    sabre.rotation_euler = (1.57079632679, 0.0, -0.96245984079)
    sabre.scale = (0.47493, 0.47493, 0.47493)
    sabre["pose_lab_contract"] = "WeaponGrip -> sabre mesh"


def write_contract(path: Path, meshy_armature: bpy.types.Object, grip: bpy.types.Object, sabre: bpy.types.Object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "pose-lab-blender-meshy-saber-contract-v1",
        "status": "requires-human-visual-approval",
        "authority": "Blender viewport, not Pose Lab runtime metrics",
        "sourceAssets": {
            "meshyAnimatedRig": MESHY_RIG,
            "fpsReference": FPS_REFERENCE,
            "meshySabre": MESHY_SABRE,
        },
        "hierarchy": {
            "meshArmature": meshy_armature.name,
            "weaponGrip": grip.name,
            "weaponGripParentBone": grip.parent_bone,
            "sabre": sabre.name,
            "sabreParent": sabre.parent.name if sabre.parent else "",
        },
        "weaponGripLocal": {
            "position": [round(v, 6) for v in grip.location],
            "rotationEulerXYZ": [round(v, 6) for v in grip.rotation_euler],
            "scale": [round(v, 6) for v in grip.scale],
        },
        "sabreLocal": {
            "position": [round(v, 6) for v in sabre.location],
            "rotationEulerXYZ": [round(v, 6) for v in sabre.rotation_euler],
            "scale": [round(v, 6) for v in sabre.scale],
        },
        "promotionRequired": [
            "Human-approved T-pose screenshot",
            "Human-approved Ready screenshot",
            "Pose Lab import reproduces this hierarchy without retargeting or solving weapon placement",
        ],
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    repo = Path(args.repo_root).resolve()
    clear_scene()
    meshy_objects = import_glb(repo / MESHY_RIG, "Meshy Character Source")
    import_glb(repo / FPS_REFERENCE, "FPS Arms Reference")
    sabre_objects = import_glb(repo / MESHY_SABRE, "Meshy Sabre Source")

    meshy_armature = find_armature(meshy_objects)
    if meshy_armature is None:
        raise RuntimeError("Meshy armature not found")
    sabre = find_object(sabre_objects, "Meshy") or find_object(sabre_objects, "Sabre") or find_object(sabre_objects, "A_French") or sabre_objects[0]
    grip = ensure_weapon_grip(meshy_armature)
    parent_sabre_to_grip(sabre, grip)

    bpy.context.scene.frame_set(0)
    if args.export_json:
        write_contract(repo / args.export_json, meshy_armature, grip, sabre)
    if args.save_blend:
        (repo / args.save_blend).parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(repo / args.save_blend))
    if args.export_glb:
        (repo / args.export_glb).parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=str(repo / args.export_glb), export_format="GLB", export_animations=True)


if __name__ == "__main__":
    main()

