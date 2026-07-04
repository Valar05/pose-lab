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
import numpy  # noqa: F401 - preload for Blender's GLTF importer inside Debian proot.
from mathutils import Matrix, Vector


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


def find_mesh(objects: list[bpy.types.Object], name: str) -> bpy.types.Object | None:
    for obj in objects:
        if obj.type == "MESH" and obj.name == name:
            return obj
    return None


def hide_from_review(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        obj.hide_viewport = True
        obj.hide_render = True


def isolate_meshy_character(meshy_objects: list[bpy.types.Object]) -> bpy.types.Object:
    char_mesh = find_mesh(meshy_objects, "char1")
    if char_mesh is None:
        raise RuntimeError("Meshy visible skinned mesh char1 not found")
    for obj in meshy_objects:
        obj.hide_viewport = obj not in {char_mesh}
        obj.hide_render = obj not in {char_mesh}
    return char_mesh


def isolate_sabre_mesh(sabre_objects: list[bpy.types.Object]) -> bpy.types.Object:
    sabre_mesh = find_mesh(sabre_objects, "Mesh_0")
    if sabre_mesh is None:
        meshes = [obj for obj in sabre_objects if obj.type == "MESH"]
        if not meshes:
            raise RuntimeError("Meshy sabre visible mesh not found")
        sabre_mesh = max(meshes, key=lambda obj: obj.dimensions.length)
    for obj in sabre_objects:
        obj.hide_viewport = obj is not sabre_mesh
        obj.hide_render = obj is not sabre_mesh
    return sabre_mesh


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
    bpy.context.view_layer.update()
    hand_bone = meshy_armature.data.bones.get("RightHand")
    if hand_bone is None:
        raise RuntimeError("RightHand bone not found")
    hand_offset_world = Vector((0.095 - 0.11512, 0.035 + 0.00773, -0.01 - 0.01127))
    hand_world = meshy_armature.matrix_world @ hand_bone.head_local
    grip.matrix_world = Matrix.Translation(hand_world + hand_offset_world)
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


def setup_review_scene(meshy_armature: bpy.types.Object, grip: bpy.types.Object, sabre: bpy.types.Object, resolution: int) -> bpy.types.Object:
    try:
        bpy.context.scene.render.engine = "CYCLES"
        bpy.context.scene.cycles.device = "CPU"
        bpy.context.scene.cycles.samples = 32
        bpy.context.scene.cycles.use_denoising = False
    except (AttributeError, TypeError):
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
    return camera


def bone_world_position(armature: bpy.types.Object, bone_name: str) -> Vector:
    bone = armature.data.bones.get(bone_name)
    if bone is None:
        raise RuntimeError(f"Missing bone {bone_name}")
    return armature.matrix_world @ bone.head_local


def object_world_bounds(obj: bpy.types.Object) -> dict[str, list[float]]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    min_v = [min(corner[i] for corner in corners) for i in range(3)]
    max_v = [max(corner[i] for corner in corners) for i in range(3)]
    return {
        "min": [round(v, 6) for v in min_v],
        "max": [round(v, 6) for v in max_v],
        "size": [round(max_v[i] - min_v[i], 6) for i in range(3)],
    }


def render_review_frame(path: Path, frame: int, meshy_armature: bpy.types.Object, rest_pose: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    meshy_armature.data.pose_position = "REST" if rest_pose else "POSE"
    bpy.context.scene.frame_set(frame)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def aim_camera_at_right_hand(camera: bpy.types.Object, meshy_armature: bpy.types.Object) -> None:
    target = bone_world_position(meshy_armature, "RightHand")
    camera.location = target + Vector((0.65, -1.05, 0.25))
    camera.data.lens = 90
    look_at(camera, target)


def write_contact_sheet(path: Path, tpose_png: Path, ready_png: Path, close_png: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join([
            "<!doctype html>",
            "<meta charset=\"utf-8\">",
            "<title>Pose Lab Meshy Saber Headless Blender Review</title>",
            "<style>body{margin:0;background:#111;color:#eee;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px}figure{margin:0}img{width:100%;display:block;background:#222}figcaption{padding:8px 0}@media(max-width:900px){main{grid-template-columns:1fr}}</style>",
            "<main>",
            f"<figure><img src=\"{tpose_png.name}\" alt=\"Meshy saber T-pose\"><figcaption>T-pose/rest canary</figcaption></figure>",
            f"<figure><img src=\"{ready_png.name}\" alt=\"Meshy saber rest duplicate\"><figcaption>Rest duplicate; no authored Ready source yet</figcaption></figure>",
            f"<figure><img src=\"{close_png.name}\" alt=\"Meshy saber right hand close-up\"><figcaption>Right hand / sabre close-up</figcaption></figure>",
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
        "worldBounds": {
            "rightHand": [round(v, 6) for v in bone_world_position(meshy_armature, "RightHand")],
            "sabre": object_world_bounds(sabre),
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
    fps_objects = import_glb(repo / FPS_REFERENCE, "FPS Arms Reference")
    sabre_objects = import_glb(repo / MESHY_SABRE, "Meshy Sabre Source")
    hide_from_review(fps_objects)
    isolate_meshy_character(meshy_objects)

    meshy_armature = find_armature(meshy_objects)
    if meshy_armature is None:
        raise RuntimeError("Meshy armature not found")
    sabre = isolate_sabre_mesh(sabre_objects)
    grip = ensure_weapon_grip(meshy_armature)
    parent_sabre_to_grip(sabre, grip)

    bpy.context.scene.frame_set(0)
    render_artifacts = {}
    if args.render_dir:
        render_dir = repo / args.render_dir
        tpose_png = render_dir / "meshy_saber_tpose.png"
        ready_png = render_dir / "meshy_saber_ready.png"
        close_png = render_dir / "meshy_saber_right_hand_close.png"
        contact_sheet = render_dir / "meshy_saber_contact_sheet.html"
        camera = setup_review_scene(meshy_armature, grip, sabre, args.resolution)
        render_review_frame(tpose_png, args.tpose_frame, meshy_armature, True)
        render_review_frame(ready_png, args.ready_frame, meshy_armature, True)
        aim_camera_at_right_hand(camera, meshy_armature)
        render_review_frame(close_png, args.tpose_frame, meshy_armature, True)
        write_contact_sheet(contact_sheet, tpose_png, ready_png, close_png)
        render_artifacts = {
            "tposePng": str(tpose_png.relative_to(repo)),
            "readyPng": str(ready_png.relative_to(repo)),
            "rightHandClosePng": str(close_png.relative_to(repo)),
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
