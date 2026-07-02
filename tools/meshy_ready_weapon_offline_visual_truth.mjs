#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  applyWeaponAttachmentTruthTransform,
  buildReadyWeaponParityVerdict,
  classifyReadyWeaponTruth,
  classifyWeaponVisibility,
  measureReadyWeaponTruth,
  updateSyntheticWeaponSocketTransform,
} from '../src/ready-weapon-truth.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'offline_visual_truth', 'meshy_ready_weapon_fk_follow');
const defaultObserved = path.join(projectRoot, 'generated', 'visual_red_build', 'meshy_ready_weapon_fk_follow_observed_web_truth.json');

function parseArgs(argv) {
  const args = { out: defaultOut, observed: defaultObserved, weaponDebug: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--observed') args.observed = path.resolve(projectRoot, argv[++i] || args.observed);
    else if (arg.startsWith('--observed=')) args.observed = path.resolve(projectRoot, arg.slice('--observed='.length));
    else if (arg === '--weapon-debug' || arg === '--weaponDebug') args.weaponDebug = true;
  }
  return args;
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= {
    createElementNS() {
      const listeners = new Map();
      return {
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
  const loader = path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js');
  const skeletonUtils = path.join(threeDir, 'examples', 'jsm', 'utils', 'SkeletonUtils.js');
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js')) || !fs.existsSync(loader) || !fs.existsSync(skeletonUtils)) {
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
async function loadGlb(GLTFLoader, file) {
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + path.sep, resolve, reject));
}
function canon(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function find(root, name) {
  const wanted = canon(name);
  let found = null;
  root.traverse((node) => { if (!found && canon(node.name) === wanted) found = node; });
  return found;
}
function requireNode(root, name) {
  const node = find(root, name);
  if (!node) throw new Error(`missing node ${name}`);
  return node;
}
function round(value, digits = 5) { const scale = 10 ** digits; return Math.round(Number(value || 0) * scale) / scale; }
function point(v) { return [round(v.x), round(v.y), round(v.z)]; }
function quatPoint(q) { return [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)]; }
function capturePose(root) {
  const pose = [];
  root.traverse((node) => {
    if (!node.isObject3D) return;
    pose.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
  });
  return pose;
}
function restorePose(root, pose) {
  for (const entry of pose) {
    entry.node.position.copy(entry.position);
    entry.node.quaternion.copy(entry.quaternion);
    entry.node.scale.copy(entry.scale);
    entry.node.updateMatrix();
  }
  root.updateMatrixWorld(true);
}
function sampleClip(THREE, root, restPose, clip, time) {
  restorePose(root, restPose);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.enabled = true;
  action.weight = 1;
  action.reset().play();
  mixer.setTime(Math.max(0, Math.min(time, clip.duration || 0)));
  root.updateMatrixWorld(true);
  return mixer;
}
function projectBounds(states) {
  const pts = [];
  for (const state of states) pts.push(state.hilt, state.hand, state.tip);
  const min = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
  const max = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) };
  const span = Math.max(max.x - min.x, max.y - min.y, 0.001);
  return { cx: (min.x + max.x) / 2, cy: (min.y + max.y) / 2, scale: 220 / span };
}
function svgPoint(p, panel, bounds) {
  return [panel.x + panel.w / 2 + (p.x - bounds.cx) * bounds.scale, panel.y + panel.h / 2 - (p.y - bounds.cy) * bounds.scale];
}
function writeSheet(frames, file, observedWebTruth, offlineTruth, verdict) {
  const W = 1200;
  const H = 455;
  const panelW = W / frames.length;
  const bounds = projectBounds(frames.map((f) => f.state));
  const title = `Offline/web parity: observed=${observedWebTruth.visualClass} offline=${offlineTruth.visualClass} visibility=${offlineTruth.visibilityClass} verdict=${verdict.visualVerdict}`;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`, '<rect width="100%" height="100%" fill="#06090d"/>'];
  parts.push(`<text x="20" y="28" fill="#fff4c2" font-family="monospace" font-size="18">${title}</text>`);
  frames.forEach((frame, index) => {
    const panel = { x: index * panelW + 12, y: 50, w: panelW - 24, h: 330 };
    const h = svgPoint(frame.state.hilt, panel, bounds);
    const hand = svgPoint(frame.state.hand, panel, bounds);
    const tip = svgPoint(frame.state.tip, panel, bounds);
    const opacity = offlineTruth.visibility?.visible ? 1 : 0.35;
    parts.push(`<rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" fill="#0b1118" stroke="#344054"/>`);
    parts.push(`<text x="${panel.x + 8}" y="${panel.y + 22}" fill="#e5e7eb" font-family="monospace" font-size="13">${frame.label} t=${round(frame.time, 3)}</text>`);
    parts.push(`<line x1="${h[0]}" y1="${h[1]}" x2="${tip[0]}" y2="${tip[1]}" stroke="#facc15" stroke-width="5" opacity="${opacity}"/>`);
    parts.push(`<line x1="${h[0]}" y1="${h[1]}" x2="${hand[0]}" y2="${hand[1]}" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4 4"/>`);
    parts.push(`<circle cx="${hand[0]}" cy="${hand[1]}" r="7" fill="#22c55e"><title>RightHand</title></circle>`);
    parts.push(`<circle cx="${h[0]}" cy="${h[1]}" r="6" fill="#ef4444" opacity="${opacity}"><title>WeaponGrip/hilt</title></circle>`);
    parts.push(`<circle cx="${tip[0]}" cy="${tip[1]}" r="5" fill="#facc15" opacity="${opacity}"><title>Blade tip</title></circle>`);
    parts.push(`<text x="${panel.x + 8}" y="${panel.y + panel.h - 16}" fill="#cbd5e1" font-family="monospace" font-size="12">hilt-hand=${round(frame.state.hiltToHandDistance, 4)}</text>`);
  });
  parts.push('<text x="20" y="410" fill="#94a3b8" font-family="monospace" font-size="13">Green=RightHand, red=WeaponGrip/hilt, yellow=blade tip. Dim weapon means runtime visibility hides this clip.</text>');
  parts.push('<text x="20" y="432" fill="#fca5a5" font-family="monospace" font-size="13">Red is expected until observed web truth and offline runtime truth both agree on sword-follows-fk.</text>');
  parts.push('</svg>');
  fs.writeFileSync(file, parts.join('\n') + '\n');
}
function readRuntimeField(name) {
  const runtime = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  const match = runtime.match(new RegExp(`const\\s+${name}\\s*=\\s*['\"]([^'\"]+)['\"]`));
  return match?.[1] || '';
}
function validateObservedWebTruth(observed, { cacheToken, runtimeBuild, clipName }) {
  const errors = [];
  if (observed.schema !== 'pose-lab-ready-weapon-fk-observed-web-truth-v1') errors.push(`observed web truth schema ${observed.schema || 'missing'} is invalid`);
  if (observed.cacheToken !== cacheToken) errors.push(`observed cacheToken ${observed.cacheToken || 'missing'} != ${cacheToken}`);
  if (observed.runtimeBuild !== runtimeBuild) errors.push(`observed runtimeBuild ${observed.runtimeBuild || 'missing'} != ${runtimeBuild}`);
  if (observed.actorKey !== 'meshyCharacter') errors.push(`observed actor ${observed.actorKey || 'missing'} != meshyCharacter`);
  if (observed.clipName !== clipName) errors.push(`observed clip ${observed.clipName || 'missing'} != ${clipName}`);
  if (!['sword-rest-space', 'sword-follows-fk', 'sword-hidden'].includes(observed.visualClass)) errors.push(`observed visualClass ${observed.visualClass || 'missing'} is invalid`);
  if (observed.browserCaptureDeprecated !== true) errors.push('observed web truth must mark browser capture deprecated');
  if (!String(observed.visualRead || '').trim()) errors.push('observed visualRead is required');
  if (!Array.isArray(observed.capturePaths) || observed.capturePaths.length < 1) errors.push('observed capturePaths must list human evidence paths');
  const assertions = observed.visualAssertions || {};
  for (const key of ['tPoseWeaponPlacementAccepted', 'readyHandsCorrected', 'readySwordNotFollowingFinalFk', 'browserCaptureRejectedAsAcceptance', 'expectedReadySwordFollowsFinalFk']) {
    if (assertions[key] !== true) errors.push(`observed visual assertion must be true: ${key}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return observed;
}
async function main() {
  const args = parseArgs(process.argv);
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const { clone: cloneSkinnedObject } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'utils', 'SkeletonUtils.js')));
  const { buildMeshyFpsVisualIkReadyClip } = await import(pathToFileURL(path.join(projectRoot, 'src', 'meshy-ready-runtime.mjs')));
  const { RIG_PROFILES } = await import(pathToFileURL(path.join(projectRoot, 'src', 'rig-profiles.js')));
  const profile = RIG_PROFILES.meshyCharacter;
  const runtimeBuild = readRuntimeField('LAB_BUILD');
  const cacheToken = readRuntimeField('LAB_CACHE_TOKEN');
  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb'));
  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'meshy_character_sheet', 'animated', 'Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'));
  const sabre = await loadGlb(GLTFLoader, path.join(projectRoot, profile.weaponAttachment.url));
  const sourceRoot = fps.scene;
  const targetRoot = meshy.scene;
  sourceRoot.updateMatrixWorld(true);
  targetRoot.updateMatrixWorld(true);
  const built = buildMeshyFpsVisualIkReadyClip(THREE, cloneSkinnedObject, sourceRoot, targetRoot, fps.animations, {
    clipName: 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]',
    sourceClipName: 'OneHandReady',
    sourceRestClip: '0T-Pose',
    timeSourceBone: 'Hand.R',
    dropInitialRestKey: true,
    weaponAttachment: profile.weaponAttachment,
  });
  if (!built.clip) throw new Error(`failed to build Ready clip: ${built.reason}`);
  const observedWebTruth = validateObservedWebTruth(readJson(args.observed), { cacheToken, runtimeBuild, clipName: built.clip.name });
  const restPose = capturePose(targetRoot);
  const rightHand = requireNode(targetRoot, profile.weaponProxy.handBone || 'RightHand');
  const leftHand = profile.weaponProxy.leftHandBone ? find(targetRoot, profile.weaponProxy.leftHandBone) : null;
  const socket = new THREE.Object3D();
  socket.name = profile.weaponProxy.socketBone || profile.weaponAttachment.socketBone || 'WeaponGrip';
  targetRoot.add(socket);
  const weaponRoot = sabre.scene.clone(true);
  weaponRoot.name = profile.weaponAttachment.name || 'Meshy French Revolution Sabre';
  socket.add(weaponRoot);
  const tip = new THREE.Group();
  tip.name = profile.weaponAttachment.tipMarker || 'WeaponGrip_end';
  socket.add(tip);
  const updateTruth = () => {
    updateSyntheticWeaponSocketTransform(THREE, { model: targetRoot, root: socket, rightHand, leftHand, config: profile.weaponProxy, activeClipHasSocketRotation: false });
    applyWeaponAttachmentTruthTransform(THREE, { weaponRoot, tip, config: profile.weaponAttachment, fallbackTipOffset: profile.weaponProxy.tipOffset || [0, 0, 0.85] });
    targetRoot.updateMatrixWorld(true);
  };
  restorePose(targetRoot, restPose);
  updateTruth();
  const restState = measureReadyWeaponTruth(THREE, { socket, rightHand, weaponRoot, tip, attachmentConfig: profile.weaponAttachment });
  const sampleTimes = [0, built.clip.duration * 0.5, built.clip.duration].map((time) => Math.max(0, Math.min(built.clip.duration, time)));
  const frames = [];
  for (const [index, time] of sampleTimes.entries()) {
    sampleClip(THREE, targetRoot, restPose, built.clip, time);
    updateTruth();
    const state = measureReadyWeaponTruth(THREE, { socket, rightHand, weaponRoot, tip, attachmentConfig: profile.weaponAttachment });
    frames.push({ label: index === 0 ? 'ready-start' : (index === 1 ? 'ready-mid' : 'ready-end'), time, state });
  }
  restorePose(targetRoot, restPose);
  const restHand = rightHand.getWorldPosition(new THREE.Vector3());
  sampleClip(THREE, targetRoot, restPose, built.clip, 0);
  const readyHand = rightHand.getWorldPosition(new THREE.Vector3());
  const readyHandDisplacement = restHand.distanceTo(readyHand);
  const clipHasWeaponTracks = built.clip.tracks.some((track) => /WeaponGrip|Weapon\.R|WeaponR/.test(track.name));
  const visibility = classifyWeaponVisibility({ clipName: built.clip.name, clipUserData: built.clip.userData, config: profile.weaponProxy, weaponDebug: args.weaponDebug });
  const offlineTruth = classifyReadyWeaponTruth(THREE, { readyState: frames[1].state, restState, visibility });
  const parity = buildReadyWeaponParityVerdict({ observedWebClass: observedWebTruth.visualClass, offlineClass: offlineTruth.visualClass });
  const result = parity.visualVerdict;
  fs.mkdirSync(args.out, { recursive: true });
  const jsonPath = path.join(args.out, 'visual_truth.json');
  const sheetPath = path.join(args.out, 'visual_truth_sheet.svg');
  writeSheet(frames, sheetPath, observedWebTruth, offlineTruth, parity);
  const artifact = {
    schema: 'pose-lab-offline-web-truth-parity-ready-weapon-fk-v1',
    generatedAt: new Date().toISOString(),
    proofMode: 'offline-web-truth-parity',
    browserCaptureDeprecated: true,
    sourceActor: 'FPS Arms',
    targetActor: 'Meshy Character',
    actorKey: 'meshyCharacter',
    clipName: built.clip.name,
    runtimeBuild,
    cacheToken,
    sharedTruthModule: 'src/ready-weapon-truth.mjs',
    observedWebTruthPath: path.relative(projectRoot, args.observed),
    manualPlacementPolicy: 'locked literals; verifier reads rig profile and does not tune offsets',
    observedWebTruth,
    offlineTruth,
    parity,
    result,
    acceptance: {
      generatedReadyClipResolved: built.generatedClipResolved === true,
      readyClipSampled: built.clip.name.includes('OneHandReady') && built.clip.duration > 0,
      readyHandDisplacedFromRest: readyHandDisplacement > 0.18,
      noGeneratedWeaponTracks: clipHasWeaponTracks === false,
      runtimeVisibilityModeled: visibility.visibilityClass === 'weapon-visible' || visibility.visibilityClass === 'weapon-hidden',
      manualSaberPlacementPreserved: JSON.stringify(profile.weaponProxy.handLocalOffset) === JSON.stringify([0.095, 0.035, -0.01]) && JSON.stringify(profile.weaponProxy.modelLocalOffset) === JSON.stringify([-0.11512, 0.00773, -0.01127]) && JSON.stringify(profile.weaponAttachment.rotationDeg) === JSON.stringify([90, 0, -55.145]) && JSON.stringify(profile.weaponAttachment.gripLocalPosition) === JSON.stringify([0.6535, -0.02302, -0.07317]),
    },
    metrics: { readyHandDisplacement: round(readyHandDisplacement), readyDuration: round(built.clip.duration, 6), targetKeyCount: built.targetKeyCount, sourceKeyCount: built.sourceKeyCount, ...offlineTruth.metrics },
    samples: frames.map((frame) => ({ label: frame.label, time: round(frame.time, 6), hilt: point(frame.state.hilt), hand: point(frame.state.hand), tip: point(frame.state.tip), bladeAxis: point(frame.state.bladeAxis), socketForward: point(frame.state.socketForward), socketQuaternion: quatPoint(frame.state.socketQuaternion), handQuaternion: quatPoint(frame.state.handQuaternion), hiltToHandDistance: round(frame.state.hiltToHandDistance) })),
    sheet: path.relative(projectRoot, sheetPath),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(artifact, null, 2) + '\n');
  const gatePath = path.join(projectRoot, 'generated', 'visual_red_build', 'meshy_ready_weapon_fk_follow_latest.json');
  fs.mkdirSync(path.dirname(gatePath), { recursive: true });
  fs.writeFileSync(gatePath, JSON.stringify({ schema: 'pose-lab-ready-weapon-fk-offline-web-parity-gate-v1', generatedAt: artifact.generatedAt, currentFixCacheToken: artifact.cacheToken, cacheToken: artifact.cacheToken, runtimeBuild: artifact.runtimeBuild, actorKey: 'meshyCharacter', clipName: built.clip.name, readyClipName: built.clip.name, proofMode: artifact.proofMode, browserCaptureDeprecated: true, browserCapturePolicy: 'Browser screenshots, debug bridge state, Android screencap, and visual-QA browser capture are manual inspection aids only and cannot close this red build.', sharedTruthModule: artifact.sharedTruthModule, observedWebTruthPath: artifact.observedWebTruthPath, observedWebTruth, offlineTruth, parity: artifact.parity, offlineVisualTruth: { artifactPath: path.relative(projectRoot, jsonPath), sheetPath: path.relative(projectRoot, sheetPath), result: artifact.result, metrics: artifact.metrics, acceptance: artifact.acceptance } }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: result === 'fixed', result, observedWebClass: observedWebTruth.visualClass, offlineClass: offlineTruth.visualClass, transformClass: offlineTruth.transformClass, visibilityClass: offlineTruth.visibilityClass, parityFailure: parity.parityFailure, artifact: path.relative(projectRoot, jsonPath), sheet: path.relative(projectRoot, sheetPath), metrics: artifact.metrics }, null, 2));
}
main().catch((error) => { console.error(error?.stack || String(error)); process.exit(1); });
