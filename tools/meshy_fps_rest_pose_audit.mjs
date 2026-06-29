#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= { createElementNS() { const listeners = new Map(); return { style: {}, width: 1, height: 1, addEventListener(t, f) { listeners.set(t, f); }, removeEventListener(t) { listeners.delete(t); }, set src(v) { this._src = v; setTimeout(() => listeners.get('load')?.({ type: 'load' }), 0); }, get src() { return this._src || ''; } }; } };
  globalThis.createImageBitmap ||= async () => ({ width: 1, height: 1, close() {} });
}
function ensureThreeSandbox() {
  const sandbox = path.join(os.tmpdir(), 'pose-lab-three-node');
  const threeDir = path.join(sandbox, 'node_modules', 'three');
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js'))) {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(threeDir), { recursive: true });
    execFileSync('cp', ['-R', path.join(projectRoot, 'vendor', 'three'), threeDir]);
  }
  return threeDir;
}
function arrayBuffer(file) { const b = fs.readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
function canon(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function find(root, name) { const wanted = canon(name); let out = null; root.traverse((node) => { if (!out && canon(node.name) === wanted) out = node; }); return out; }
function round(value, digits = 4) { const scale = 10 ** digits; return Math.round(Number(value || 0) * scale) / scale; }
function point(v) { return [round(v.x), round(v.y), round(v.z)]; }
function worldPosition(node) { const v = new THREE.Vector3(); node.getWorldPosition(v); return v; }
function worldQuaternion(node) { const q = new THREE.Quaternion(); node.getWorldQuaternion(q); return q; }
function relativePosition(frame, node) { return worldPosition(node).sub(worldPosition(frame)).applyQuaternion(worldQuaternion(frame).invert()); }
function distance(a, b) { return round(new THREE.Vector3().fromArray(a).distanceTo(new THREE.Vector3().fromArray(b)), 4); }
async function loadGlb(GLTFLoader, file) { return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + '/', resolve, reject)); }
function captureLocalPose(root) { const pose = new Map(); root.traverse((node) => { if (node.isBone) pose.set(node.uuid, { node, quaternion: node.quaternion.clone(), position: node.position.clone(), scale: node.scale.clone() }); }); return pose; }
function restoreLocalPose(pose) { for (const entry of pose.values()) { entry.node.position.copy(entry.position); entry.node.quaternion.copy(entry.quaternion); entry.node.scale.copy(entry.scale); entry.node.updateMatrix(); } }
function sampleTrack(track, time) { const result = track.createInterpolant(new Float32Array(4)).evaluate(time); return new THREE.Quaternion(result[0], result[1], result[2], result[3]).normalize(); }
function applyClipPose(root, clip, time) { for (const track of clip.tracks || []) { if (!track.name.endsWith('.quaternion')) continue; const name = track.name.replace(/\.quaternion$/, ''); const node = find(root, name); if (node) node.quaternion.copy(sampleTrack(track, time)); } root.updateMatrixWorld(true); }
function bindRestLocalMap(root) {
  const worldByBone = new Map();
  const out = new Map();
  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.skeleton?.bones) return;
    node.skeleton.bones.forEach((bone, index) => {
      const inverse = node.skeleton.boneInverses[index];
      if (bone && inverse && !worldByBone.has(bone)) worldByBone.set(bone, inverse.clone().invert());
    });
  });
  const p = new THREE.Vector3(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3();
  for (const [bone, world] of worldByBone.entries()) {
    const parentWorld = bone.parent?.isBone ? worldByBone.get(bone.parent) : null;
    const local = parentWorld ? parentWorld.clone().invert().multiply(world) : world.clone();
    local.decompose(p, q, sc);
    out.set(canon(bone.name), q.clone().normalize());
  }
  return out;
}
function applyBindRest(root, restMap) { root.traverse((node) => { const q = restMap.get(canon(node.name)); if (q) node.quaternion.copy(q); }); root.updateMatrixWorld(true); }

let THREE;
async function main() {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/FPSPlayer.glb'));
  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'));
  const fpsScene = fps.scene;
  const meshyScene = meshy.scene;
  const ready = fps.animations.find((clip) => clip.name === 'OneHandReady');
  const tpose = fps.animations.find((clip) => clip.name === '0T-Pose');
  if (!ready || !tpose) throw new Error('missing FPS OneHandReady or 0T-Pose');
  fpsScene.updateMatrixWorld(true);
  meshyScene.updateMatrixWorld(true);
  const fpsPose = captureLocalPose(fpsScene);
  const sourceFrame = find(fpsScene, 'ShoulderCenter');
  const sourceRight = find(fpsScene, 'Hand.R');
  const sourceLeft = find(fpsScene, 'Hand.L');
  const sourceWeapon = find(fpsScene, 'Weapon.R');
  const fpsModelRest = { right: point(relativePosition(sourceFrame, sourceRight)), left: point(relativePosition(sourceFrame, sourceLeft)), weapon: point(relativePosition(sourceFrame, sourceWeapon)) };
  restoreLocalPose(fpsPose); applyClipPose(fpsScene, tpose, 0);
  const fpsTPoseRest = { right: point(relativePosition(sourceFrame, sourceRight)), left: point(relativePosition(sourceFrame, sourceLeft)), weapon: point(relativePosition(sourceFrame, sourceWeapon)) };
  restoreLocalPose(fpsPose); applyClipPose(fpsScene, ready, 0.254);
  const fpsReady = { right: point(relativePosition(sourceFrame, sourceRight)), left: point(relativePosition(sourceFrame, sourceLeft)), weapon: point(relativePosition(sourceFrame, sourceWeapon)) };

  const targetFrame = find(meshyScene, 'Spine02');
  const targetRight = find(meshyScene, 'RightHand');
  const targetLeft = find(meshyScene, 'LeftHand');
  const meshyModelRest = { right: point(relativePosition(targetFrame, targetRight)), left: point(relativePosition(targetFrame, targetLeft)) };
  const bindMap = bindRestLocalMap(meshyScene);
  applyBindRest(meshyScene, bindMap);
  const meshyBindRest = { right: point(relativePosition(targetFrame, targetRight)), left: point(relativePosition(targetFrame, targetLeft)) };
  const payload = {
    schema: 'pose-lab-meshy-fps-rest-pose-audit-v1',
    source: 'assets/models/FPSPlayer.glb',
    target: 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb',
    sourceRestProvider: '0T-Pose',
    targetRestProvider: 'skin-bind',
    clip: 'OneHandReady',
    source: { modelRest: fpsModelRest, tPoseRest: fpsTPoseRest, ready: fpsReady },
    target: { modelRest: meshyModelRest, bindRest: meshyBindRest, bindRestBoneCount: bindMap.size },
    metrics: {
      fpsRightModelRestToReady: distance(fpsModelRest.right, fpsReady.right),
      fpsRightTPoseRestToReady: distance(fpsTPoseRest.right, fpsReady.right),
      fpsLeftModelRestToReady: distance(fpsModelRest.left, fpsReady.left),
      fpsLeftTPoseRestToReady: distance(fpsTPoseRest.left, fpsReady.left),
      meshyModelToBindRightDelta: distance(meshyModelRest.right, meshyBindRest.right),
      meshyModelToBindLeftDelta: distance(meshyModelRest.left, meshyBindRest.left),
    },
  };
  const out = path.join(projectRoot, 'generated/core_transform_audit/meshy_fps_rest_pose_audit.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, path: path.relative(projectRoot, out), metrics: payload.metrics }, null, 2));
}
main().catch((error) => { console.error(error?.stack || String(error)); process.exit(1); });
