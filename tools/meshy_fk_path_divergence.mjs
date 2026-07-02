#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyClipPoseAtTime, findRuntimeNode, fitModelToHeight } from '../src/pose-runtime-rules.mjs';
import {
  applyWeaponAttachmentRuntimeRules,
  applyWeaponSocketRuntimeRules,
  captureWeaponPinningRuntimeState,
  captureWeaponRuntimeLandmarks,
} from '../src/weapon-runtime-rules.mjs';
import { buildMeshyFpsVisualIkReadyClip } from '../src/meshy-ready-runtime.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READY_CLIP = 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]';
const TPOSE_CLIP = '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]';
const DEFAULT_OUT = path.join(projectRoot, 'generated', 'fk_path_divergence', 'latest');

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, samples: 3, assertShared: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--samples') args.samples = Math.max(2, Number(argv[++i] || args.samples));
    else if (arg.startsWith('--samples=')) args.samples = Math.max(2, Number(arg.slice('--samples='.length)));
    else if (arg === '--assert-shared') args.assertShared = true;
  }
  return args;
}

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= {
    createElementNS() {
      const listeners = new Map();
      return {
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
  const dir = path.join(sandbox, 'node_modules', 'three');
  if (!fs.existsSync(path.join(dir, 'build', 'three.module.js')) || !fs.existsSync(path.join(dir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js'))) {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    execFileSync('cp', ['-R', path.join(projectRoot, 'vendor', 'three'), dir]);
  }
  return dir;
}

function arrayBuffer(file) {
  const buffer = fs.readFileSync(file);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function loadGlb(GLTFLoader, file) {
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + path.sep, resolve, reject));
}

function profileBlock(name, nextName = '') {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
  const start = source.indexOf(`  ${name}:`);
  if (start < 0) throw new Error(`missing profile ${name}`);
  const end = nextName ? source.indexOf(`\n  ${nextName}:`, start) : -1;
  return source.slice(start, end > start ? end : undefined);
}

function objectBlock(source, key) {
  const start = source.indexOf(`${key}: {`);
  if (start < 0) throw new Error(`missing block ${key}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated block ${key}`);
}

function arrayFor(block, name, fallback) {
  const match = block.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`));
  return match ? match[1].split(',').map((value) => Number(value.trim())).filter(Number.isFinite) : fallback;
}

function numberFor(block, name, fallback) {
  const match = block.match(new RegExp(`${name}:\\s*(-?[0-9.]+)`));
  return match ? Number(match[1]) : fallback;
}

function stringFor(block, name, fallback) {
  const match = block.match(new RegExp(`${name}:\\s*'([^']*)'`));
  return match ? match[1] : fallback;
}

function parseMeshyConfig() {
  const block = profileBlock('meshyCharacter', 'meshyStatic');
  const proxy = objectBlock(block, 'weaponProxy');
  const attachment = objectBlock(block, 'weaponAttachment');
  return {
    actor: {
      url: stringFor(block, 'url', 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'),
      targetHeight: numberFor(block, 'targetHeight', 1.89),
    },
    proxy: {
      handBone: stringFor(proxy, 'handBone', 'RightHand'),
      leftHandBone: stringFor(proxy, 'leftHandBone', 'LeftHand'),
      socketBone: stringFor(proxy, 'socketBone', 'WeaponGrip'),
      syntheticSourceSocketBone: stringFor(proxy, 'syntheticSourceSocketBone', 'WeaponR'),
      parentMode: stringFor(proxy, 'parentMode', 'synthetic-source-socket'),
      positionMode: stringFor(proxy, 'positionMode', 'right-hand'),
      handLocalOffset: arrayFor(proxy, 'handLocalOffset', [0, 0, 0]),
      modelLocalOffset: arrayFor(proxy, 'modelLocalOffset', [0, 0, 0]),
      gripOffset: arrayFor(proxy, 'gripOffset', [0, 0, 0]),
      tipOffset: arrayFor(proxy, 'tipOffset', [0, 0, 0.85]),
      rotationDeg: arrayFor(proxy, 'rotationDeg', [0, 0, 0]),
      length: numberFor(proxy, 'length', 0.85),
      allowAnimatedSocketAnimation: /allowAnimatedSocketAnimation:\s*true/.test(proxy),
    },
    attachment: {
      url: stringFor(attachment, 'url', 'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb'),
      name: stringFor(attachment, 'name', 'Meshy French Revolution Sabre'),
      socketBone: stringFor(attachment, 'socketBone', 'WeaponGrip'),
      tipMarker: stringFor(attachment, 'tipMarker', 'WeaponGrip_end'),
      scale: numberFor(attachment, 'scale', 1),
      position: arrayFor(attachment, 'position', [0, 0, 0]),
      rotationDeg: arrayFor(attachment, 'rotationDeg', [0, 0, 0]),
      gripLocalPosition: arrayFor(attachment, 'gripLocalPosition', [0, 0, 0]),
      tipLocalPosition: arrayFor(attachment, 'tipLocalPosition', [0, 0.85, 0]),
    },
  };
}

function trackTargetName(trackName) {
  return String(trackName || '').replace(/^\.bones\[(.+?)\]\.(position|quaternion|scale)$/, '$1.$2').replace(/\.(position|quaternion|scale|morphTargetInfluences)$/, '');
}

function canon(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function clipTracksFor(clip, nodeName) {
  const wanted = canon(nodeName);
  return (clip?.tracks || [])
    .filter((track) => canon(trackTargetName(track.name)) === wanted)
    .map((track) => track.name);
}

function hasQuaternionTrack(clip, nodeName) {
  return clipTracksFor(clip, nodeName).some((name) => String(name).endsWith('.quaternion'));
}

function matrixArray(matrix) {
  return matrix.elements.map((value) => Number(value.toFixed(6)));
}

function matrixDelta(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
  return Math.max(...a.map((value, index) => Math.abs(value - b[index])));
}

function localMatrixToParent(THREE, parent, child) {
  parent.updateMatrixWorld(true);
  child.updateMatrixWorld(true);
  return parent.matrixWorld.clone().invert().multiply(child.matrixWorld);
}

function captureNodeMatrices(THREE, proxy) {
  const chain = [
    ['RightHand', proxy.rightHand],
    ['WeaponR', proxy.syntheticSourceSocket],
    ['WeaponGrip', proxy.root],
    ['displayRoot', proxy.displayRoot],
    ['weaponMesh', proxy.model],
  ];
  return Object.fromEntries(chain.map(([label, node], index) => {
    if (!node) return [label, null];
    const parent = index > 0 ? chain[index - 1][1] : node.parent;
    return [label, {
      name: node.name || label,
      parent: node.parent?.name || null,
      localMatrix: matrixArray(node.matrix),
      worldMatrix: matrixArray(node.matrixWorld),
      parentLocalMatrix: parent ? matrixArray(localMatrixToParent(THREE, parent, node)) : null,
    }];
  }));
}

function compareSampleDrift(samples, pathKey) {
  const first = samples[0]?.matrices?.[pathKey]?.parentLocalMatrix || null;
  return samples.map((sample) => matrixDelta(first, sample.matrices?.[pathKey]?.parentLocalMatrix));
}

function vectorArray(vector) {
  return vector ? [vector.x, vector.y, vector.z].map((value) => Number(value.toFixed(6))) : null;
}

function pointInNodeLocal(node, point) {
  if (!node || !point) return null;
  node.updateMatrixWorld(true);
  return vectorArray(node.worldToLocal(point.clone()));
}

function vectorDelta(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
  return Math.sqrt(a.reduce((sum, value, index) => sum + ((value - b[index]) ** 2), 0));
}

function compareVectorDrift(samples, groupKey, pointKey) {
  const first = samples[0]?.[groupKey]?.[pointKey] || null;
  return samples.map((sample) => vectorDelta(first, sample[groupKey]?.[pointKey]));
}

function maxFinite(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : null;
}

function createWeaponProxy(THREE, actorRoot, sabreRoot, config) {
  const rightHand = findRuntimeNode(actorRoot, config.proxy.handBone);
  const leftHand = findRuntimeNode(actorRoot, config.proxy.leftHandBone);
  if (!rightHand) throw new Error(`missing right hand ${config.proxy.handBone}`);
  const syntheticSourceSocket = new THREE.Bone();
  syntheticSourceSocket.name = config.proxy.syntheticSourceSocketBone || 'WeaponR';
  rightHand.add(syntheticSourceSocket);
  const root = new THREE.Bone();
  root.name = config.proxy.socketBone || 'WeaponGrip';
  syntheticSourceSocket.add(root);
  const displayRoot = new THREE.Group();
  displayRoot.name = root.name + '-display-root';
  root.add(displayRoot);
  const model = sabreRoot;
  model.name = config.attachment.name;
  displayRoot.add(model);
  const tipMarker = new THREE.Group();
  tipMarker.name = config.attachment.tipMarker;
  displayRoot.add(tipMarker);
  const proxy = {
    root,
    displayRoot,
    config: config.proxy,
    rightHand,
    leftHand,
    syntheticSourceSocket,
    model,
    tipMarker,
    attachmentConfig: config.attachment,
    fkPlacementSignature: '',
    fkLocalPosition: null,
    fkLocalQuaternion: null,
  };
  applyWeaponSocketRuntimeRules(THREE, { model: actorRoot, proxy, placementSignature: 'diagnostic-init', force: true });
  applyWeaponAttachmentRuntimeRules(THREE, { actorModel: actorRoot, proxy, config: config.attachment });
  return proxy;
}

function placementSignature(config = {}) {
  return JSON.stringify({
    parentMode: config.parentMode || '',
    positionMode: config.positionMode || '',
    handLocalOffset: config.handLocalOffset || null,
    modelLocalOffset: config.modelLocalOffset || null,
    gripOffset: config.gripOffset || null,
    rotationDeg: config.rotationDeg || null,
  });
}

function buildGeneratedClip(THREE, cloneSkinnedObject, fps, actor, config, clipName) {
  if (clipName === READY_CLIP) {
    return buildMeshyFpsVisualIkReadyClip(THREE, cloneSkinnedObject, fps.scene, actor.scene, fps.animations || [], { clipName });
  }
  if (clipName === TPOSE_CLIP) {
    return buildMeshyFpsVisualIkReadyClip(THREE, cloneSkinnedObject, fps.scene, actor.scene, fps.animations || [], {
      clipName,
      sourceClipName: '0T-Pose',
      sourceRestClip: '0T-Pose',
      timeSourceBone: 'Hand.R',
      dropInitialRestKey: false,
      weaponAttachment: config.attachment,
    });
  }
  return { clip: null, generatedClipResolved: false, reason: 'unsupported-clip' };
}

async function loadActorSet(THREE, GLTFLoader, config) {
  const actor = await loadGlb(GLTFLoader, path.join(projectRoot, config.actor.url));
  const weapon = await loadGlb(GLTFLoader, path.join(projectRoot, config.attachment.url));
  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb'));
  fitModelToHeight(THREE, actor.scene, config.actor.targetHeight);
  const proxy = createWeaponProxy(THREE, actor.scene, weapon.scene, config);
  return { actor, fps, proxy };
}

async function inspectClip(THREE, GLTFLoader, cloneSkinnedObject, config, clipName, sampleCount) {
  const { actor, fps, proxy } = await loadActorSet(THREE, GLTFLoader, config);
  const generated = buildGeneratedClip(THREE, cloneSkinnedObject, fps, actor, config, clipName);
  const clip = generated.clip;
  if (!clip) throw new Error(`could not build generated clip ${clipName}: ${generated.reason || 'unknown'}`);
  const duration = Math.max(0.001, Number(clip.duration || 0.001));
  const times = Array.from({ length: sampleCount }, (_, index) => duration * (index / Math.max(1, sampleCount - 1)));
  const trackSummary = {
    WeaponR: clipTracksFor(clip, 'WeaponR'),
    WeaponGrip: clipTracksFor(clip, 'WeaponGrip'),
    RightHand: clipTracksFor(clip, 'RightHand'),
    LeftHand: clipTracksFor(clip, 'LeftHand'),
  };
  const samples = [];
  for (const [index, time] of times.entries()) {
    applyClipPoseAtTime(THREE, actor.scene, clip, time);
    const animatedSourceSocketRotation = hasQuaternionTrack(clip, proxy.syntheticSourceSocket?.name || 'WeaponR');
    const animatedSocketRotation = hasQuaternionTrack(clip, proxy.root?.name || 'WeaponGrip');
    const force = index === 0;
    const signature = placementSignature(proxy.config);
    const result = applyWeaponSocketRuntimeRules(THREE, {
      model: actor.scene,
      proxy,
      animatedSourceSocketRotation,
      animatedSocketRotation,
      force,
      placementSignature: signature,
    });
    applyWeaponAttachmentRuntimeRules(THREE, { actorModel: actor.scene, proxy, config: config.attachment });
    actor.scene.updateMatrixWorld(true);
    const landmarks = captureWeaponRuntimeLandmarks(THREE, proxy);
    const pinning = captureWeaponPinningRuntimeState(THREE, proxy);
    samples.push({
      time: Number(time.toFixed(6)),
      force,
      placementSignature: signature,
      runtimeMode: result?.mode || null,
      runtimeHandled: result?.handled === true,
      animatedSourceSocketRotation,
      animatedSocketRotation,
      syntheticFkSignature: proxy.syntheticFkSignature || '',
      socketHandBaselineLocal: proxy.socketHandBaselineLocal ? [proxy.socketHandBaselineLocal.x, proxy.socketHandBaselineLocal.y, proxy.socketHandBaselineLocal.z].map((value) => Number(value.toFixed(6))) : null,
      matrices: captureNodeMatrices(THREE, proxy),
      landmarks: {
        rightHand: vectorArray(landmarks.rightHand),
        weaponR: vectorArray(landmarks.syntheticSourceSocket),
        weaponGrip: vectorArray(landmarks.socket),
        appliedHilt: vectorArray(landmarks.appliedHilt),
        visibleMeshHilt: vectorArray(landmarks.visibleMeshHilt),
      },
      handLocalLandmarks: {
        weaponR: pointInNodeLocal(proxy.rightHand, landmarks.syntheticSourceSocket),
        weaponGrip: pointInNodeLocal(proxy.rightHand, landmarks.socket),
        appliedHilt: pointInNodeLocal(proxy.rightHand, landmarks.appliedHilt),
        visibleMeshHilt: pointInNodeLocal(proxy.rightHand, landmarks.visibleMeshHilt),
      },
      pinningChecks: pinning.checks,
      pinningDistances: Object.fromEntries(Object.entries(pinning.distances || {}).map(([key, value]) => [key, Number.isFinite(value) ? Number(value.toFixed(6)) : null])),
    });
  }
  const drift = {
    WeaponR: compareSampleDrift(samples, 'WeaponR'),
    WeaponGrip: compareSampleDrift(samples, 'WeaponGrip'),
    displayRoot: compareSampleDrift(samples, 'displayRoot'),
    weaponMesh: compareSampleDrift(samples, 'weaponMesh'),
  };
  const handLocalDrift = {
    weaponR: compareVectorDrift(samples, 'handLocalLandmarks', 'weaponR'),
    weaponGrip: compareVectorDrift(samples, 'handLocalLandmarks', 'weaponGrip'),
    appliedHilt: compareVectorDrift(samples, 'handLocalLandmarks', 'appliedHilt'),
    visibleMeshHilt: compareVectorDrift(samples, 'handLocalLandmarks', 'visibleMeshHilt'),
  };
  return {
    clip: clipName,
    generatedClipResolved: generated.generatedClipResolved === true && clip.name === clipName,
    generatedReason: generated.reason || null,
    generatedStats: {
      sourceName: clip.userData?.sourceName || null,
      sourceKeyCount: generated.sourceKeyCount || null,
      targetKeyCount: generated.targetKeyCount || null,
      weaponTrackTarget: clip.userData?.keyConvert?.weaponTrackTarget || null,
      droppedInitialRestKey: clip.userData?.keyConvert?.droppedInitialRestKey ?? null,
      trimmedInitialRestTime: clip.userData?.keyConvert?.trimmedInitialRestTime ?? null,
      rightRollOffsetDeg: clip.userData?.keyConvert?.rightRollOffsetDeg ?? null,
      leftRollOffsetDeg: clip.userData?.keyConvert?.leftRollOffsetDeg ?? null,
    },
    trackSummary,
    samples,
    drift,
    handLocalDrift,
    maxParentLocalMatrixDrift: Object.fromEntries(Object.entries(drift).map(([key, values]) => [key, maxFinite(values)])),
    maxHandLocalLandmarkDrift: Object.fromEntries(Object.entries(handLocalDrift).map(([key, values]) => [key, maxFinite(values)])),
  };
}

function sameArray(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function compareReports(ready, tpose) {
  const blockers = [];
  if (ready.generatedClipResolved !== true || tpose.generatedClipResolved !== true) blockers.push('one-or-both-generated-clips-did-not-resolve');
  for (const node of ['WeaponR', 'WeaponGrip', 'RightHand', 'LeftHand']) {
    if (!sameArray(ready.trackSummary[node], tpose.trackSummary[node])) blockers.push(`track-summary-differs:${node}`);
  }
  for (const field of ['runtimeMode', 'animatedSourceSocketRotation', 'animatedSocketRotation', 'placementSignature']) {
    const readyValues = [...new Set(ready.samples.map((sample) => JSON.stringify(sample[field])))];
    const tposeValues = [...new Set(tpose.samples.map((sample) => JSON.stringify(sample[field])))];
    if (!sameArray(readyValues, tposeValues)) blockers.push(`runtime-field-differs:${field}`);
  }
  for (const child of ['WeaponGrip', 'displayRoot', 'weaponMesh']) {
    const readyStable = Number(ready.maxParentLocalMatrixDrift[child] || 0) <= 0.000001;
    const tposeStable = Number(tpose.maxParentLocalMatrixDrift[child] || 0) <= 0.000001;
    if (readyStable !== tposeStable) blockers.push(`local-matrix-stability-differs:${child}`);
  }
  const crossClipHandLocalDelta = {};
  for (const point of ['weaponR', 'weaponGrip', 'appliedHilt', 'visibleMeshHilt']) {
    const readyFirst = ready.samples[0]?.handLocalLandmarks?.[point] || null;
    const tposeFirst = tpose.samples[0]?.handLocalLandmarks?.[point] || null;
    const delta = vectorDelta(readyFirst, tposeFirst);
    crossClipHandLocalDelta[point] = Number.isFinite(delta) ? Number(delta.toFixed(6)) : null;
    if (Number.isFinite(delta) && delta > 0.001) blockers.push(`right-hand-local-landmark-differs:${point}:${delta.toFixed(6)}`);
  }
  for (const point of ['weaponGrip', 'appliedHilt', 'visibleMeshHilt']) {
    const readyStable = Number(ready.maxHandLocalLandmarkDrift?.[point] || 0) <= 0.001;
    const tposeStable = Number(tpose.maxHandLocalLandmarkDrift?.[point] || 0) <= 0.001;
    if (readyStable !== tposeStable) blockers.push(`right-hand-local-stability-differs:${point}`);
  }
  return {
    sameFkContract: blockers.length === 0,
    blockers,
    crossClipHandLocalDelta,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  ensureBrowserShim();
  fs.mkdirSync(args.out, { recursive: true });
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const { clone: cloneSkinnedObject } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'utils', 'SkeletonUtils.js')));
  const config = parseMeshyConfig();
  const ready = await inspectClip(THREE, GLTFLoader, cloneSkinnedObject, config, READY_CLIP, args.samples);
  const tpose = await inspectClip(THREE, GLTFLoader, cloneSkinnedObject, config, TPOSE_CLIP, args.samples);
  const comparison = compareReports(ready, tpose);
  const result = {
    schema: 'pose-lab-meshy-fk-path-divergence-v1',
    diagnosticOnly: true,
    productionBehaviorModified: false,
    acceptedAsFix: false,
    expectedSharedContract: 'Ready and T-pose must consume the same Meshy weapon FK path; differences should be authored offsets or source clip motion, not runtime ownership.',
    ok: comparison.sameFkContract,
    comparison,
    clips: { ready, tpose },
  };
  const outPath = path.join(args.out, 'meshy_fk_path_divergence.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    ok: result.ok,
    blockers: comparison.blockers,
    path: path.relative(projectRoot, outPath),
  }, null, 2));
  if (args.assertShared && !result.ok) throw new Error(`Meshy Ready and T-pose do not consume the same FK path: ${comparison.blockers.join(', ')}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
