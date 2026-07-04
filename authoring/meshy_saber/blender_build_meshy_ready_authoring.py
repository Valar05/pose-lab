#!/usr/bin/env python3
"""Build, render, or export the Blender-first Meshy saber authoring scene.

Run from Blender:

  blender --background --python authoring/meshy_saber/blender_build_meshy_ready_authoring.py -- --repo-root . --render-dir authoring/meshy_saber/exports/headless_review

This script does not tune Pose Lab runtime offsets. It creates a clean DCC
scene where an agent can generate local Blender evidence and a human can review
the authored Meshy saber hold before Pose Lab imports it.
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
    parser.add_argument("--render-dir", default="", help="Optional directory for T-pose/Ready PNG renders and contact sheet.")
    parser.add_argument("--tpose-frame", type=int, default=0, help="Frame to use for the T-pose/rest canary render.")
    parser.add_argument("--ready-frame", type=int, default=24, help="Frame to use for the Ready review render.")
    parser.add_argument("--resolution", type=int, default=960, help="Square render resolution in pixels.")
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


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_review_scene(meshy_armature: bpy.types.Object, grip: bpy.types.Object, sabre: bpy.types.Object, resolution: int) -> None:
    try:
        bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.render.resolution_x = resolution
    bpy.context.scene.render.resolution_y = resolution
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.view_settings.exposure = 0
    bpy.context.scene.view_settings.gamma = 1

    camera = bpy.data.objects.get("PoseLabReviewCamera")
    if camera is None:
        camera_data = bpy.data.cameras.new("PoseLabReviewCamera")
        camera = bpy.data.objects.new("PoseLabReviewCamera", camera_data)
        bpy.context.scene.collection.objects.link(camera)
    camera.location = (2.2, -4.0, 1.65)
    camera.data.lens = 42
    look_at(camera, Vector((0.0, 0.0, 1.05)))
    bpy.context.scene.camera = camera

    light = bpy.data.objects.get("PoseLabReviewKeyLight")
    if light is None:
        light_data = bpy.data.lights.new("PoseLabReviewKeyLight", "AREA")
        light = bpy.data.objects.new("PoseLabReviewKeyLight", light_data)
        bpy.context.scene.collection.objects.link(light)
    light.location = (2.5, -3.0, 4.0)
    light.data.energy = 550
    light.data.size = 4

    fill = bpy.data.objects.get("PoseLabReviewFillLight")
    if fill is None:
        fill_data = bpy.data.lights.new("PoseLabReviewFillLight", "POINT")
        fill = bpy.data.objects.new("PoseLabReviewFillLight", fill_data)
        bpy.context.scene.collection.objects.link(fill)
    fill.location = (-2.0, 2.5, 2.0)
    fill.data.energy = 90

    for obj in (meshy_armature, grip, sabre):
        obj.hide_viewport = False
        obj.hide_render = False


def render_review_frame(path: Path, frame: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.frame_set(frame)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def write_contact_sheet(path: Path, tpose_png: Path, ready_png: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join([
            "<!doctype html>",
            "<meta charset=\"utf-8\">",
            "<title>Pose Lab Meshy Saber Headless Blender Review</title>",
            "<style>body{margin:0;background:#111;color:#eee;font:16px sans-serif}main{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}figure{margin:0}img{width:100%;display:block;background:#222}figcaption{padding:8px 0}</style>",
            "<main>",
            f"<figure><img src=\"{tpose_png.name}\" alt=\"Meshy saber T-pose\"><figcaption>T-pose/rest canary</figcaption></figure>",
            f"<figure><img src=\"{ready_png.name}\" alt=\"Meshy saber Ready\"><figcaption>Ready review</figcaption></figure>",
            "</main>",
        ]) + "\n",
        encoding="utf-8",
    )


def write_contract(path: Path, meshy_armature: bpy.types.Object, grip: bpy.types.Object, sabre: bpy.types.Object, render_artifacts: dict[str, str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "pose-lab-blender-meshy-saber-contract-v1",
        "status": "requires-human-visual-approval",
        "authority": "local headless Blender review artifacts plus human approval, not Pose Lab runtime metrics",
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
        "reviewArtifacts": render_artifacts or {},
        "promotionRequired": [
            "Human-approved T-pose render",
            "Human-approved Ready render",
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
    render_artifacts = {}
    if args.render_dir:
        render_dir = repo / args.render_dir
        tpose_png = render_dir / "meshy_saber_tpose.png"
        ready_png = render_dir / "meshy_saber_ready.png"
        contact_sheet = render_dir / "meshy_saber_contact_sheet.html"
        setup_review_scene(meshy_armature, grip, sabre, args.resolution)
        render_review_frame(tpose_png, args.tpose_frame)
        render_review_frame(ready_png, args.ready_frame)
        write_contact_sheet(contact_sheet, tpose_png, ready_png)
        render_artifacts = {
            "tposePng": str(tpose_png.relative_to(repo)),
            "readyPng": str(ready_png.relative_to(repo)),
            "contactSheet": str(contact_sheet.relative_to(repo)),
            "tposeFrame": args.tpose_frame,
            "readyFrame": args.ready_frame,
        }
    if args.export_json:
        write_contract(repo / args.export_json, meshy_armature, grip, sabre, render_artifacts)
    if args.save_blend:
        (repo / args.save_blend).parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(repo / args.save_blend))
    if args.export_glb:
        (repo / args.export_glb).parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=str(repo / args.export_glb), export_format="GLB", export_animations=True)


if __name__ == "__main__":
    main()
