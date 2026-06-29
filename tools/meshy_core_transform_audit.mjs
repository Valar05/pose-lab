#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'core_transform_audit', 'meshy_swing1');

function parseArgs(argv) {
  const args = {
    source: 'assets/models/ruined_air/Scavenger_new.fbx',
    target: 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb',
    clip: 'Armature|Swing1',
    out: defaultOut,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const read = () => argv[++i];
    if (arg === '--source') args.source = read();
    else if (arg === '--target') args.target = read();
    else if (arg === '--clip') args.clip = read();
    else if (arg === '--out') args.out = read();
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node tools/meshy_core_transform_audit.mjs [--clip Armature|Swing1] [--out DIR]');
      process.exit(0);
    } else {
      throw new Error('unknown argument: ' + arg);
    }
  }
  return args;
}

function projectPath(value) { return path.isAbsolute(value) ? value : path.join(projectRoot, value); }
function round(value, digits = 4) { const n = Number(value || 0); const s = 10 ** digits; return Number.isFinite(n) ? Math.round(n * s) / s : 0; }
function point(v) { return [round(v.x), round(v.y), round(v.z)]; }
function quat(q) { return [round(q.x), round(q.y), round(q.z), round(q.w)]; }
function deg(rad) { return rad * 180 / Math.PI; }
function canon(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function sanitizeBoneName(name) { return String(name || '').replace(/[\[\]\.:/]/g, '_'); }

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= {
    createElementNS(ns, name) {
      const listeners = new Map();
      return {
        nodeName: name,
        style: {},
        width: 1,
        height: 1,
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
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js')) || !fs.existsSync(path.join(threeDir, 'examples', 'jsm', 'loaders', 'FBXLoader.js'))) {
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

function collectBones(root) {
  const out = [];
  root.traverse((node) => { if (node.isBone) out.push(node); });
  return out;
}

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
  return { selected: candidates[0] || null, candidates, skeletonBones };
}

function worldPosition(THREE, node) { const out = new THREE.Vector3(); node.getWorldPosition(out); return out; }
function worldQuaternion(THREE, node) { const out = new THREE.Quaternion(); node.getWorldQuaternion(out); return out.normalize(); }
function firstMeaningfulChild(node) { return meaningfulBoneChild(node) || node?.children?.find((child) => child.isBone) || null; }
function chainDirection(THREE, bone) {
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const child = firstMeaningfulChild(bone);
  if (child) { bone.getWorldPosition(start); child.getWorldPosition(end); }
  else if (bone?.parent?.isBone) { bone.parent.getWorldPosition(start); bone.getWorldPosition(end); }
  else return null;
  const dir = end.sub(start);
  return dir.lengthSq() > 1e-8 ? dir.normalize() : null;
}

function trackFor(clip, boneName) { return clip?.tracks?.find((track) => track.name === boneName + '.quaternion') || null; }
function sampleQuat(THREE, track, time) {
  const times = track.times;
  const values = track.values;
  let index = 0;
  while (index < times.length - 1 && times[index + 1] < time) index += 1;
  if (index >= times.length - 1) return new THREE.Quaternion(values[values.length - 4], values[values.length - 3], values[values.length - 2], values[values.length - 1]).normalize();
  const t0 = times[index];
  const t1 = times[index + 1];
  const alpha = Math.max(0, Math.min(1, (time - t0) / Math.max(1e-6, t1 - t0)));
  const q0 = new THREE.Quaternion(values[index * 4], values[index * 4 + 1], values[index * 4 + 2], values[index * 4 + 3]).normalize();
  const q1 = new THREE.Quaternion(values[(index + 1) * 4], values[(index + 1) * 4 + 1], values[(index + 1) * 4 + 2], values[(index + 1) * 4 + 3]).normalize();
  return q0.slerp(q1, alpha).normalize();
}

async function main() {
  const args = parseArgs(process.argv);
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { FBXLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/FBXLoader.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const sourcePath = projectPath(args.source);
  const targetPath = projectPath(args.target);
  const source = new FBXLoader().parse(arrayBuffer(sourcePath), path.dirname(sourcePath) + path.sep);
  const target = await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(targetPath), path.dirname(targetPath) + path.sep, (gltf) => resolve(gltf.scene), reject));
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  const sourceBones = collectBones(source);
  const targetBones = collectBones(target);
  const duplicateNames = Object.entries(sourceBones.reduce((acc, bone) => { acc[bone.name] = (acc[bone.name] || 0) + 1; return acc; }, {})).filter(([, count]) => count > 1).map(([name, count]) => ({ name, count }));
  const clip = source.animations.find((entry) => entry.name === args.clip);
  if (!clip) throw new Error('clip not found: ' + args.clip);
  const keyBones = ['Hips', 'Spine02', 'Spine01', 'Spine', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'];
  const phases = [0, 0.18, 0.487, 0.808, 1.0].map((phase) => Math.min(clip.duration, phase));
  const selectedBones = [];
  for (const name of keyBones) {
    const sourceResolved = findNamedBone(source, name);
    const targetResolved = findNamedBone(target, name);
    const sourceBone = sourceResolved.selected;
    const targetBone = targetResolved.selected;
    if (!sourceBone || !targetBone) {
      selectedBones.push({ name, missingSource: !sourceBone, missingTarget: !targetBone });
      continue;
    }
    const child = meaningfulBoneChild(sourceBone);
    const targetChild = meaningfulBoneChild(targetBone);
    const track = trackFor(clip, sourceBone.name);
    const sourceRest = sourceBone.quaternion.clone().normalize();
    selectedBones.push({
      name,
      sourceName: sourceBone.name,
      targetName: targetBone.name,
      sourceCandidateCount: sourceResolved.candidates.length,
      targetCandidateCount: targetResolved.candidates.length,
      sourceInSkin: sourceResolved.skeletonBones.has(sourceBone),
      targetInSkin: targetResolved.skeletonBones.has(targetBone),
      sourceParent: sourceBone.parent?.name || '',
      targetParent: targetBone.parent?.name || '',
      sourceMeaningfulChild: child?.name || '',
      targetMeaningfulChild: targetChild?.name || '',
      sourceChildSameName: Boolean(sourceBone.children?.some((entry) => entry.isBone && entry.name === sourceBone.name)),
      selectedChildSameName: child?.name === sourceBone.name,
      sourceWorld: point(worldPosition(THREE, sourceBone)),
      targetWorld: point(worldPosition(THREE, targetBone)),
      sourceTargetWorldRestAngle: round(deg(worldQuaternion(THREE, sourceBone).angleTo(worldQuaternion(THREE, targetBone))), 2),
      sourceChainDirection: chainDirection(THREE, sourceBone) ? point(chainDirection(THREE, sourceBone)) : null,
      targetChainDirection: chainDirection(THREE, targetBone) ? point(chainDirection(THREE, targetBone)) : null,
      sourceLocalQuaternion: quat(sourceBone.quaternion),
      targetLocalQuaternion: quat(targetBone.quaternion),
      clipTrackKeys: track?.times?.length || 0,
      sourceDeltaAngles: track ? phases.map((time) => {
        const current = sampleQuat(THREE, track, time);
        return { time: round(time, 4), angle: round(deg(sourceRest.angleTo(current)), 2) };
      }) : [],
    });
  }
  const outDir = projectPath(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'core_transform_audit.json');
  const manifest = {
    schema: 'pose-lab-core-transform-audit-v1',
    source: path.relative(projectRoot, sourcePath),
    target: path.relative(projectRoot, targetPath),
    clip: args.clip,
    sourceBoneCount: sourceBones.length,
    targetBoneCount: targetBones.length,
    duplicateNames,
    selectedBones,
    clipTracks: clip.tracks.map((track) => ({ name: track.name, type: track.ValueTypeName, keys: track.times.length })),
    conclusions: [
      'Scavenger_new.fbx contains duplicate same-name source bones and more bones than the 24-bone Meshy target.',
      'Retargeting must resolve driver bones from the skinned skeleton and ignore same-name wrapper/end children for chain basis.',
    ],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, manifest: path.relative(projectRoot, manifestPath), sourceBoneCount: manifest.sourceBoneCount, targetBoneCount: manifest.targetBoneCount }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
