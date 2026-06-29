#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(projectRoot, 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb');
const outPath = path.join(projectRoot, 'generated/fpv_camera_audit/meshy_bone_world.json');

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= {
    createElementNS(ns, name) {
      const listeners = new Map();
      return {
        nodeName: name,
        style: {}, width: 1, height: 1,
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
        set src(value) { this._src = value; setTimeout(() => listeners.get('load')?.({ type: 'load' }), 0); },
        get src() { return this._src || ''; },
      };
    },
  };
  globalThis.createImageBitmap ||= async () => ({ width: 1, height: 1, close() {} });
}

function ensureThreeSandbox() {
  const sandbox = path.join(os.tmpdir(), 'pose-lab-three-node');
  const threeDir = path.join(sandbox, 'node_modules', 'three');
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js')) || !fs.existsSync(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js'))) {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(threeDir), { recursive: true });
    execFileSync('cp', ['-R', path.join(projectRoot, 'vendor', 'three'), threeDir]);
  }
  return threeDir;
}

function arrayBuffer(file) {
  const buffer = fs.readFileSync(file);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
function round(value, digits = 4) { const s = 10 ** digits; return Math.round(Number(value || 0) * s) / s; }
function point(v) { return [round(v.x), round(v.y), round(v.z)]; }
function sanitizeBoneName(name) { return String(name || '').replace(/[\[\]\.:/]/g, '_'); }
function canon(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function collectSkinnedSkeletonBoneSet(root) {
  const set = new Set();
  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.skeleton?.bones) return;
    for (const bone of node.skeleton.bones) set.add(bone);
  });
  return set;
}
function meaningfulBoneChild(node) {
  const nodeName = canon(node?.name || '');
  return node?.children?.find((child) => {
    if (!child.isBone) return false;
    const childName = canon(child.name || '');
    if (!childName || childName === nodeName) return false;
    if (/end$/.test(childName) && node.children?.some((sibling) => sibling.isBone && canon(sibling.name || '') !== childName && canon(sibling.name || '') !== nodeName)) return false;
    return true;
  }) || null;
}
function scoreCandidate(node, skeletonBones) {
  let score = 0;
  if (skeletonBones.has(node)) score += 100;
  if (meaningfulBoneChild(node)) score += 30;
  if (node.parent?.isBone && canon(node.parent.name) === canon(node.name)) score -= 20;
  if (!meaningfulBoneChild(node) && node.parent?.isBone) score -= 8;
  return score;
}
function findNamedBone(root, name) {
  const sanitized = sanitizeBoneName(name);
  const requestedTail = String(name || '').split(':').pop().split('_').pop();
  const candidates = [];
  root.traverse((node) => {
    if (!node.isBone) return;
    const nodeName = node.name || '';
    if (nodeName === name || nodeName === sanitized || sanitizeBoneName(nodeName) === sanitized || nodeName.endsWith(requestedTail)) candidates.push(node);
  });
  const skeletonBones = collectSkinnedSkeletonBoneSet(root);
  candidates.sort((a, b) => scoreCandidate(b, skeletonBones) - scoreCandidate(a, skeletonBones));
  return candidates[0] || null;
}
function worldPosition(THREE, node) { const out = new THREE.Vector3(); node.getWorldPosition(out); return out; }
function fitToHeight(THREE, model, height) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = height / Math.max(0.001, size.y);
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  const fitBox = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  fitBox.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= fitBox.min.y;
  model.updateMatrixWorld(true);
}
function dirMetrics(THREE, head, box, bones, dir, offset = 0.36) {
  const headPos = worldPosition(THREE, head);
  const p = headPos.clone().add(dir.clone().multiplyScalar(offset)).add(new THREE.Vector3(0, 0.04, 0));
  const ray = new THREE.Ray(headPos.clone(), dir.clone().normalize());
  const hit = ray.intersectBox(box, new THREE.Vector3());
  const inside = box.containsPoint(p);
  const to = {};
  for (const [name, bone] of Object.entries(bones)) {
    if (!bone) continue;
    const rel = worldPosition(THREE, bone).sub(p);
    to[name] = { dotForward: round(rel.dot(dir)), rel: point(rel) };
  }
  return { camera: point(p), insideBounds: inside, exitDistanceFromHead: hit ? round(hit.distanceTo(headPos)) : null, to };
}

async function main() {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(targetPath), path.dirname(targetPath) + path.sep, resolve, reject));
  const model = gltf.scene;
  fitToHeight(THREE, model, 1.89);
  const bones = Object.fromEntries(['Hips','Spine','Spine01','Spine02','Neck','Head','RightShoulder','RightArm','RightForeArm','RightHand','LeftShoulder','LeftArm','LeftForeArm','LeftHand'].map((name) => [name, findNamedBone(model, name)]));
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  const positions = {};
  for (const [name, bone] of Object.entries(bones)) if (bone) positions[name] = point(worldPosition(THREE, bone));
  const vectors = {};
  function rel(a,b) { if (!bones[a] || !bones[b]) return null; return point(worldPosition(THREE,bones[b]).sub(worldPosition(THREE,bones[a]))); }
  vectors.headToSpine02 = rel('Head', 'Spine02');
  vectors.spine02ToHead = rel('Spine02', 'Head');
  vectors.spine02ToRightHand = rel('Spine02', 'RightHand');
  vectors.spine02ToLeftHand = rel('Spine02', 'LeftHand');
  vectors.leftHandToRightHand = rel('LeftHand', 'RightHand');
  const axes = {
    plusX: new THREE.Vector3(1,0,0), minusX: new THREE.Vector3(-1,0,0),
    plusZ: new THREE.Vector3(0,0,1), minusZ: new THREE.Vector3(0,0,-1),
  };
  const candidates = {};
  for (const [name, dir] of Object.entries(axes)) candidates[name] = dirMetrics(THREE, bones.Head, box, bones, dir, 0.36);
  const missing = Object.entries(bones).filter(([, bone]) => !bone).map(([name]) => name);
  const report = {
    schema: 'pose-lab-meshy-fpv-bone-world-audit-v1',
    source: path.relative(projectRoot, targetPath),
    targetHeight: 1.89,
    bounds: { min: point(box.min), max: point(box.max), center: point(center), size: point(size) },
    positions,
    missing,
    vectors,
    candidates,
    conclusion: 'Do not use a hardcoded world +/-Z camera until this report is checked against the active model orientation. Choose the candidate that is outsideBounds=false and has hands forward/in front, not just a named axis.',
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, report: path.relative(projectRoot, outPath), bounds: report.bounds, positions: report.positions, vectors: report.vectors, candidates: report.candidates }, null, 2));
}

main().catch((error) => { console.error(error.stack || String(error)); process.exit(1); });
