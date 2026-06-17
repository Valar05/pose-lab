import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinnedObject, retargetClip } from 'three/addons/utils/SkeletonUtils.js';
import { applyGodotRestPose } from './godot-rest-poses.js?v=visual-qa-read-frames';
import { RIG_PROFILES, actorTransform, clipOptions } from './rig-profiles.js?v=visual-qa-read-frames';
import { preferSavedClipForActor } from './startup-policy.js?v=visual-qa-read-frames';
import { clipLabel, defaultClipEntries, isSf2PoseClip, searchableClipEntries, searchClipEntries } from './clip-search.js?v=visual-qa-read-frames';

const LAB_BUILD = 'clean-sf2';

const ACTORS = RIG_PROFILES;
const STORAGE_KEY = 'pose-lab:last-state:v1';
const CLEANUP_DRAFTS_KEY = 'pose-lab:cleanup-drafts:v1';
const textureLoader = new THREE.TextureLoader();


function visualQaConfig() {
  const params = new URLSearchParams(window.location.search || '');
  const enabled = params.get('beacon') === '1' || params.get('capture') === '1';
  return {
    enabled,
    beacon: params.get('beacon') === '1',
    capture: params.get('capture') === '1',
    frames: Math.max(1, Math.min(24, Number(params.get('captureFrames') || 12))),
    intervalMs: Math.max(50, Number(params.get('captureIntervalMs') || 500)),
    build: LAB_BUILD,
    actor: params.get('qaActor') || params.get('actor') || '',
    clip: params.get('qaClip') || params.get('clip') || '',
    frameMode: params.get('qaFrameMode') || '',
  };
}

function postVisualQaBeacon(stage, meta = {}) {
  const params = new URLSearchParams({ stage, build: LAB_BUILD, ...meta });
  fetch('/__visual_qa_smoke?' + params.toString()).catch(() => {});
}

function postVisualQaCapture(canvas, meta = {}) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const params = new URLSearchParams({ build: LAB_BUILD, ...meta });
    fetch('/__visual_qa_capture?' + params.toString(), {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: blob,
    }).catch(() => {});
  }, 'image/png');
}

const UI = {
  canvas: document.getElementById('labCanvas'),
  loadState: document.getElementById('loadState'),
  status: document.getElementById('labStatus'),
  clipButtons: document.getElementById('clipButtons'),
  clipSearch: document.getElementById('clipSearch'),
  clipHint: document.getElementById('clipHint'),
  cleanupClipName: document.getElementById('cleanupClipName'),
  openAssetFilesButton: document.getElementById('openAssetFilesButton'),
  openAssetFiles: document.getElementById('openAssetFiles'),
  clearOpenedAssets: document.getElementById('clearOpenedAssets'),
  cleanupTimelineCanvas: document.getElementById('cleanupTimelineCanvas'),
  cleanupScrub: document.getElementById('cleanupScrub'),
  cleanupTime: document.getElementById('cleanupTime'),
  cleanupPlayPause: document.getElementById('cleanupPlayPause'),
  cleanupSetStart: document.getElementById('cleanupSetStart'),
  cleanupSetEnd: document.getElementById('cleanupSetEnd'),
  cleanupStart: document.getElementById('cleanupStart'),
  cleanupEnd: document.getElementById('cleanupEnd'),
  cleanupUseTranslate: document.getElementById('cleanupUseTranslate'),
  cleanupUseRotate: document.getElementById('cleanupUseRotate'),
  cleanupUseScale: document.getElementById('cleanupUseScale'),
  cleanupSmoothStrength: document.getElementById('cleanupSmoothStrength'),
  cleanupSmoothStrengthValue: document.getElementById('cleanupSmoothStrengthValue'),
  cleanupSmoothPasses: document.getElementById('cleanupSmoothPasses'),
  cleanupFps: document.getElementById('cleanupFps'),
  cleanupEditMode: document.getElementById('cleanupEditMode'),
  cleanupApplyEdit: document.getElementById('cleanupApplyEdit'),
  cleanupBlendStart: document.getElementById('cleanupBlendStart'),
  cleanupBlendEnd: document.getElementById('cleanupBlendEnd'),
  cleanupBlendHint: document.getElementById('cleanupBlendHint'),
  cleanupMergeSource: document.getElementById('cleanupMergeSource'),
  cleanupMergeTarget: document.getElementById('cleanupMergeTarget'),
  cleanupMergeTimelineCanvas: document.getElementById('cleanupMergeTimelineCanvas'),
  cleanupMergeStart: document.getElementById('cleanupMergeStart'),
  cleanupMergeEnd: document.getElementById('cleanupMergeEnd'),
  cleanupMergeName: document.getElementById('cleanupMergeName'),
  cleanupMergeTrimAfterBlend: document.getElementById('cleanupMergeTrimAfterBlend'),
  cleanupUseActiveAsMergeSource: document.getElementById('cleanupUseActiveAsMergeSource'),
  cleanupBuildMerge: document.getElementById('cleanupBuildMerge'),
  cleanupMergeHint: document.getElementById('cleanupMergeHint'),
  cleanupSaveDraft: document.getElementById('cleanupSaveDraft'),
  cleanupExportClip: document.getElementById('cleanupExportClip'),
  cleanupClearDrafts: document.getElementById('cleanupClearDrafts'),
  cleanupSaveStatus: document.getElementById('cleanupSaveStatus'),
  poseIndexClip: document.getElementById('poseIndexClip'),
  poseIndexActor: document.getElementById('poseIndexActor'),
  poseExportIndex: document.getElementById('poseExportIndex'),
  poseIndexStatus: document.getElementById('poseIndexStatus'),
  poseIndexList: document.getElementById('poseIndexList'),
  cleanupDeleteRange: document.getElementById('cleanupDeleteRange'),
  cleanupTrimRange: document.getElementById('cleanupTrimRange'),
  cleanupSmoothRange: document.getElementById('cleanupSmoothRange'),
  cleanupSmoothAll: document.getElementById('cleanupSmoothAll'),
  cleanupStabilize: document.getElementById('cleanupStabilize'),
  cleanupResample: document.getElementById('cleanupResample'),
  cleanupReset: document.getElementById('cleanupReset'),
  cleanupStop: document.getElementById('cleanupStop'),
  cleanupStatus: document.getElementById('cleanupStatus'),
  readout: document.getElementById('readoutText'),
  diagnostic: document.getElementById('diagnosticText'),
  tabs: [...document.querySelectorAll('#actorTabs button')],
  panelButtons: [...document.querySelectorAll('#panelTabs button')],
  viewButtons: [...document.querySelectorAll('#viewTabs button')],
  panels: {
    clips: document.getElementById('clipPanel'),
    cleanup: document.getElementById('cleanupPanel'),
    bones: document.getElementById('bonePanel'),
    retarget: document.getElementById('retargetPanel'),
    transform: document.getElementById('transformPanel'),
    info: document.getElementById('labReadout'),
  },
  boneSelect: document.getElementById('boneSelect'),
  showBoneOverlay: document.getElementById('showBoneOverlay'),
  boneUseTranslate: document.getElementById('boneUseTranslate'),
  boneUseRotate: document.getElementById('boneUseRotate'),
  boneUseScale: document.getElementById('boneUseScale'),
  bonePosX: document.getElementById('bonePosX'),
  bonePosY: document.getElementById('bonePosY'),
  bonePosZ: document.getElementById('bonePosZ'),
  boneRotX: document.getElementById('boneRotX'),
  boneRotY: document.getElementById('boneRotY'),
  boneRotZ: document.getElementById('boneRotZ'),
  boneScale: document.getElementById('boneScale'),
  bonePosXValue: document.getElementById('bonePosXValue'),
  bonePosYValue: document.getElementById('bonePosYValue'),
  bonePosZValue: document.getElementById('bonePosZValue'),
  boneRotXValue: document.getElementById('boneRotXValue'),
  boneRotYValue: document.getElementById('boneRotYValue'),
  boneRotZValue: document.getElementById('boneRotZValue'),
  boneScaleValue: document.getElementById('boneScaleValue'),
  resetBoneEdit: document.getElementById('resetBoneEdit'),
  resetAllBoneEdits: document.getElementById('resetAllBoneEdits'),
  boneStatus: document.getElementById('boneStatus'),
  sourceActor: document.getElementById('sourceActor'),
  targetActor: document.getElementById('targetActor'),
  useTranslate: document.getElementById('useTranslate'),
  useRotate: document.getElementById('useRotate'),
  useScale: document.getElementById('useScale'),
  positionPolicy: document.getElementById('positionPolicy'),
  torsoToHips: document.getElementById('torsoToHips'),
  buildRetarget: document.getElementById('buildRetarget'),
  swapRetarget: document.getElementById('swapRetarget'),
  retargetStatus: document.getElementById('retargetStatus'),
  posX: document.getElementById('posX'),
  posY: document.getElementById('posY'),
  posZ: document.getElementById('posZ'),
  rotX: document.getElementById('rotX'),
  rotY: document.getElementById('rotY'),
  rotZ: document.getElementById('rotZ'),
  scale: document.getElementById('scale'),
  rotXValue: document.getElementById('rotXValue'),
  rotYValue: document.getElementById('rotYValue'),
  rotZValue: document.getElementById('rotZValue'),
  scaleValue: document.getElementById('scaleValue'),
  posXValue: document.getElementById('posXValue'),
  posYValue: document.getElementById('posYValue'),
  posZValue: document.getElementById('posZValue'),
  resetTransform: document.getElementById('resetTransform'),
  modelRest: document.getElementById('modelRest'),
  godotRest: document.getElementById('godotRest'),
  godotTitan: document.getElementById('godotTitan'),
  titanZero: document.getElementById('titanZero'),
  titanPlus: document.getElementById('titanPlus'),
  basisX: document.getElementById('basisX'),
  basisY: document.getElementById('basisY'),
  basisZ: document.getElementById('basisZ'),
  basisXValue: document.getElementById('basisXValue'),
  basisYValue: document.getElementById('basisYValue'),
  basisZValue: document.getElementById('basisZValue'),
  basisXNeg: document.getElementById('basisXNeg'),
  basisXPos: document.getElementById('basisXPos'),
  basisReset: document.getElementById('basisReset'),
};


function collectNodeNames(root) {
  return new Set(collectNodeNameMap(root).keys());
}

function threeSanitizeNodeName(name) {
  return String(name || '').replace(/\s/g, '_').replace(/[\[\]\.:/]/g, '');
}

function collectNodeNameMap(root) {
  const names = new Map();
  root.traverse((node) => {
    const runtimeName = node.name || '';
    if (!runtimeName) return;
    if (!names.has(runtimeName)) names.set(runtimeName, runtimeName);
    const originalName = node.userData?.name || '';
    if (originalName && !names.has(originalName)) names.set(originalName, runtimeName);
    const sanitizedOriginal = threeSanitizeNodeName(originalName || runtimeName);
    if (sanitizedOriginal && !names.has(sanitizedOriginal)) names.set(sanitizedOriginal, runtimeName);
  });
  return names;
}

function normalizeTrackName(trackName) {
  const boneMatch = trackName.match(/^\.bones\[(.+?)\]\.(position|quaternion|scale)$/);
  return boneMatch ? boneMatch[1] + '.' + boneMatch[2] : trackName;
}

function remapTrackName(trackName, targetNameMap) {
  const normalized = normalizeTrackName(trackName);
  const match = normalized.match(/^(.*)\.(position|quaternion|scale|morphTargetInfluences)$/);
  if (!match) return normalized;
  const mappedTarget = targetNameMap.get(match[1]) || targetNameMap.get(threeSanitizeNodeName(match[1]));
  return mappedTarget ? mappedTarget + '.' + match[2] : normalized;
}

function sanitizeBoneName(name) {
  return String(name || '').replace(/[\[\]\.:/]/g, '_');
}

function findNamedBone(root, name) {
  if (!name) return null;
  const sanitized = sanitizeBoneName(name);
  let found = root.getObjectByName(name) || root.getObjectByName(sanitized);
  if (found) return found;
  root.traverse((node) => {
    if (found || !node.isBone) return;
    const nodeName = node.name || '';
    if (nodeName === name || nodeName === sanitized || sanitizeBoneName(nodeName) === sanitized || nodeName.endsWith(name.split(':').pop()) || nodeName.endsWith(name.split('_').pop())) found = node;
  });
  return found;
}

function collectBones(root) {
  const bones = [];
  root.traverse((node) => {
    if (node.isBone) bones.push(node);
  });
  return bones;
}

function normalizeRigNodeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findMatchingRigBone(root, name) {
  const target = normalizeRigNodeName(name);
  if (!target) return null;
  const bones = collectBones(root);
  for (const bone of bones) {
    if (normalizeRigNodeName(bone.name) === target) return bone;
  }
  for (const bone of bones) {
    const candidate = normalizeRigNodeName(bone.name);
    if (candidate.endsWith(target) || target.endsWith(candidate)) return bone;
  }
  for (const bone of bones) {
    if (normalizeRigNodeName(bone.name).includes(target)) return bone;
  }
  return null;
}

async function loadVisualOverlayTextureSet(config = {}) {
  const textureUrls = config?.textures || {};
  const entries = await Promise.all(Object.entries(textureUrls).map(async ([key, url]) => {
    if (!url) return [key, null];
    try {
      const texture = await textureLoader.loadAsync(url);
      if (key === 'baseColor' || key === 'emission') texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return [key, texture];
    } catch (err) {
      console.warn('visual overlay texture failed', url, err);
      return [key, null];
    }
  }));
  return Object.fromEntries(entries);
}

function buildVisualOverlayMaterial(existing, textureSet = {}, options = {}) {
  return new THREE.MeshStandardMaterial({
    name: existing?.name || 'visual-overlay',
    color: existing?.color?.clone?.() || new THREE.Color(0xffffff),
    map: textureSet.baseColor || null,
    normalMap: textureSet.normal || null,
    roughnessMap: textureSet.roughness || null,
    metalnessMap: textureSet.metallic || null,
    emissiveMap: textureSet.emission || null,
    emissive: textureSet.emission ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
    emissiveIntensity: textureSet.emission ? Number(options.emissiveIntensity ?? 0.65) : 0,
    roughness: Number(options.roughness ?? (textureSet.roughness ? 1 : 0.92)),
    metalness: Number(options.metalness ?? (textureSet.metallic ? 1 : 0.04)),
    transparent: Boolean(existing?.transparent),
    opacity: existing?.opacity ?? 1,
    side: existing?.side ?? THREE.FrontSide,
  });
}

function applyVisualOverlayMaterials(root, textureSet = {}, options = {}) {
  root?.traverse?.((node) => {
    if (!node?.isMesh && !node?.isSkinnedMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const upgraded = materials.map((material) => buildVisualOverlayMaterial(material, textureSet, options));
    node.material = Array.isArray(node.material) ? upgraded : upgraded[0];
    node.frustumCulled = false;
    node.castShadow = false;
    node.receiveShadow = false;
  });
}

function rebindVisualOverlayToRig(visualRoot, rigRoot) {
  const meshes = [];
  visualRoot?.traverse?.((node) => {
    if (node?.isSkinnedMesh && node.skeleton?.bones?.length) meshes.push(node);
  });
  let matchedBones = 0;
  let totalBones = 0;
  let reboundMeshes = 0;
  for (const mesh of meshes) {
    const bones = mesh.skeleton?.bones || [];
    totalBones += bones.length;
    let meshHits = 0;
    const mapped = bones.map((bone) => {
      const target = findMatchingRigBone(rigRoot, bone.name);
      if (target) {
        meshHits += 1;
        matchedBones += 1;
      }
      return target || bone;
    });
    if (meshHits < Math.max(3, Math.floor(bones.length * 0.35))) continue;
    mesh.bind(new THREE.Skeleton(mapped, mesh.skeleton.boneInverses), mesh.bindMatrix.clone());
    mesh.normalizeSkinWeights?.();
    reboundMeshes += 1;
  }
  return { reboundMeshes, matchedBones, totalBones };
}

function shortBoneName(name) {
  return String(name || '').split(':').pop().replace(/^mixamorig_?/, '') || 'Bone';
}

function vectorToCm(vector) {
  return {
    x: Math.round(vector.x * 100),
    y: Math.round(vector.y * 100),
    z: Math.round(vector.z * 100),
  };
}

function eulerToDeg(euler) {
  return {
    x: radToDeg(euler.x),
    y: radToDeg(euler.y),
    z: radToDeg(euler.z),
  };
}

function captureBonePose(root) {
  const pose = new Map();
  root.traverse((node) => {
    if (!node.isBone) return;
    pose.set(node.uuid, {
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
    });
  });
  return pose;
}

function restoreBonePose(root, pose) {
  if (!pose) return;
  root.traverse((node) => {
    if (!node.isBone) return;
    const transform = pose.get(node.uuid);
    if (!transform) return;
    node.position.copy(transform.position);
    node.quaternion.copy(transform.quaternion);
    node.scale.copy(transform.scale);
    node.updateMatrix();
  });
  root.updateMatrixWorld(true);
}

function applyClipFirstFramePose(root, clips, clipLabel) {
  if (!clipLabel) return '';
  const clip = (clips || []).find((item) => item.name === clipLabel) || (clips || []).find((item) => item.name.toLowerCase().includes(String(clipLabel).toLowerCase()));
  if (!clip) return '';
  for (const track of clip.tracks || []) {
    const normalizedName = normalizeTrackName(track.name);
    const nodeName = trackTargetName(normalizedName);
    if (isRigRootTarget(nodeName)) continue;
    const bone = findNamedBone(root, nodeName);
    if (!bone) continue;
    const values = track.values;
    if (!values || values.length === 0) continue;
    if (normalizedName.endsWith('.position') && values.length >= 3) bone.position.set(values[0], values[1], values[2]);
    else if (normalizedName.endsWith('.quaternion') && values.length >= 4) bone.quaternion.set(values[0], values[1], values[2], values[3]).normalize();
    else if (normalizedName.endsWith('.scale') && values.length >= 3) bone.scale.set(values[0], values[1], values[2]);
    bone.updateMatrix();
  }
  root.updateMatrixWorld(true);
  return clip.name;
}

function stabilizeQuaternionTrack(track) {
  const values = track.values;
  let flips = 0;
  if (!track.name.endsWith('.quaternion') || !values || values.length < 8) return flips;
  for (let i = 4; i < values.length; i += 4) {
    const dot = values[i - 4] * values[i] + values[i - 3] * values[i + 1] + values[i - 2] * values[i + 2] + values[i - 1] * values[i + 3];
    if (dot < 0) {
      values[i] *= -1;
      values[i + 1] *= -1;
      values[i + 2] *= -1;
      values[i + 3] *= -1;
      flips += 1;
    }
  }
  return flips;
}

function trackTargetName(trackName) {
  const normalized = normalizeTrackName(trackName);
  const match = normalized.match(/^(.*)\.(position|quaternion|scale|morphTargetInfluences)$/);
  return match ? match[1] : '';
}

function trackChannel(trackName) {
  const normalized = normalizeTrackName(trackName);
  if (normalized.endsWith('.position')) return 'translate';
  if (normalized.endsWith('.quaternion')) return 'rotate';
  if (normalized.endsWith('.scale')) return 'scale';
  return 'other';
}

function isRigRootTarget(name) {
  return name === 'Root' || name === 'Armature' || name === 'Armature.001';
}

function isHipTarget(name) {
  return /Hips$/i.test(name || '');
}

function channelSuffix(channels) {
  const parts = [];
  if (channels.translate) parts.push('T');
  if (channels.rotate) parts.push('R');
  if (channels.scale) parts.push('S');
  return parts.join('') || 'none';
}

function scalePositionTrackDelta(track, scale) {
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.0001 || !track?.values || !track.name.endsWith('.position')) return 0;
  const values = track.values;
  if (values.length < 6) return 0;
  const baseX = values[0];
  const baseY = values[1];
  const baseZ = values[2];
  for (let i = 3; i + 2 < values.length; i += 3) {
    values[i] = baseX + (values[i] - baseX) * scale;
    values[i + 1] = baseY + (values[i + 1] - baseY) * scale;
    values[i + 2] = baseZ + (values[i + 2] - baseZ) * scale;
  }
  return Math.max(0, Math.floor(values.length / 3) - 1);
}

function getSkinnedMesh(root) {
  let skinned = null;
  root.traverse((node) => {
    if (!skinned && node.isSkinnedMesh) skinned = node;
  });
  return skinned;
}

function hasRenderableModel(root) {
  let found = false;
  root?.traverse?.((node) => {
    if (node.isMesh || node.isSkinnedMesh) found = true;
  });
  return found;
}

function prepareProfileVisuals(root, info = {}) {
  const hide = new Set(info.hideNodes || []);
  root.traverse((node) => {
    if (hide.has(node.name)) node.visible = false;
  });
}

function mirroredLocalPoint(root, worldPoint, axis = 'x', target = new THREE.Vector3()) {
  target.copy(worldPoint);
  root.worldToLocal(target);
  if (axis === 'y') target.y *= -1;
  else if (axis === 'z') target.z *= -1;
  else target.x *= -1;
  return target;
}

function findHipBoneName(skinned) {
  const bones = skinned?.skeleton?.bones || [];
  const exact = bones.find((bone) => /Hips$/i.test(bone.name || ''));
  if (exact) return exact.name;
  const loose = bones.find((bone) => /hip|pelvis/i.test(bone.name || ''));
  return loose?.name || '';
}

function filterClipChannels(clip, channels, options = {}) {
  const positionPolicy = options.positionPolicy ?? 'hips';
  const keepRootRotation = options.keepRootRotation ?? false;
  const targetNameMap = options.targetRoot ? collectNodeNameMap(options.targetRoot) : null;
  const targetNames = targetNameMap ? new Set(targetNameMap.keys()) : null;
  const tracks = [];
  for (const sourceTrack of clip.tracks) {
    const normalizedName = normalizeTrackName(sourceTrack.name);
    const nodeName = trackTargetName(normalizedName);
    if (targetNames && nodeName && !targetNames.has(nodeName)) continue;
    const channel = trackChannel(normalizedName);
    if (channel === 'translate') {
      if (!channels.translate) continue;
      if (isRigRootTarget(nodeName)) continue;
      if (positionPolicy === 'none') continue;
      if (positionPolicy === 'hips' && !isHipTarget(nodeName)) continue;
    } else if (channel === 'rotate') {
      if (!channels.rotate) continue;
      if (isRigRootTarget(nodeName) && !keepRootRotation) continue;
    } else if (channel === 'scale') {
      if (!channels.scale) continue;
      if (isRigRootTarget(nodeName)) continue;
    }
    const nextTrack = sourceTrack.clone();
    nextTrack.name = targetNameMap ? remapTrackName(normalizedName, targetNameMap) : normalizedName;
    tracks.push(nextTrack);
  }
  const filtered = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  filtered.optimize();
  filtered.userData = { ...(clip.userData || {}) };
  return filtered;
}

function prepareGroundedClips(clips, targetRoot, origin = 'own', options = {}) {
  const targetNameMap = collectNodeNameMap(targetRoot);
  const targetNames = new Set(targetNameMap.keys());
  const keepRootRotation = options.keepRootRotation ?? false;
  const channels = options.channels ?? { translate: true, rotate: true, scale: false };
  const positionPolicy = options.positionPolicy ?? (origin === 'own' ? 'hips' : 'none');
  const lockHipRotation = options.lockHipRotation ?? false;
  const translationScale = Number(options.translationScale ?? 1);
  const translationMode = Number.isFinite(translationScale) && Math.abs(translationScale - 1) > 0.0001 ? ' translationScale=' + translationScale : '';
  const stripRootMotionXZ = options.stripRootMotionXZ ?? false;
  return (clips || []).map((clip) => {
    const tracks = [];
    let quaternionFlips = 0;
    let translationKeys = 0;
    for (const sourceTrack of clip.tracks) {
      const normalizedName = normalizeTrackName(sourceTrack.name);
      const nodeName = trackTargetName(normalizedName);
      if (nodeName && !targetNames.has(nodeName)) continue;
      if (normalizedName.endsWith('.position')) {
        if (!channels.translate) continue;
        if (isRigRootTarget(nodeName)) continue;
        if (positionPolicy === 'none') continue;
        if (positionPolicy === 'hips' && !isHipTarget(nodeName)) continue;
        const nextTrack = sourceTrack.clone();
        nextTrack.name = normalizedName;
        if (stripRootMotionXZ && nextTrack.values?.length >= 3 && (isRigRootTarget(nodeName) || isHipTarget(nodeName))) {
          const baseX = nextTrack.values[0];
          const baseZ = nextTrack.values[2];
          for (let i = 0; i + 2 < nextTrack.values.length; i += 3) {
            nextTrack.values[i] = baseX;
            nextTrack.values[i + 2] = baseZ;
          }
        }
        translationKeys += scalePositionTrackDelta(nextTrack, translationScale);
        nextTrack.name = remapTrackName(normalizedName, targetNameMap);
        tracks.push(nextTrack);
        continue;
      }
      if (normalizedName.endsWith('.quaternion') && !channels.rotate) continue;
      if (normalizedName.endsWith('.quaternion') && lockHipRotation && isHipTarget(nodeName)) continue;
      if (normalizedName.endsWith('.scale') && !channels.scale) continue;
      if (isRigRootTarget(nodeName)) {
        if (!normalizedName.endsWith('.quaternion') || !keepRootRotation) continue;
      }
      const nextTrack = sourceTrack.clone();
      nextTrack.name = remapTrackName(normalizedName, targetNameMap);
      quaternionFlips += stabilizeQuaternionTrack(nextTrack);
      tracks.push(nextTrack);
    }
    const grounded = new THREE.AnimationClip(clip.name, clip.duration, tracks);
    grounded.optimize();
    const mode = channelSuffix(channels) + ' ' + (keepRootRotation ? 'root-rotation' : 'bone-rotation') + (lockHipRotation ? ' hip-rotation-locked' : '') + (positionPolicy !== 'none' ? ' ' + positionPolicy + '-position' : '') + (stripRootMotionXZ ? ' rootXZ-locked' : '') + translationMode + ' grounded';
    grounded.userData = { mode, origin, sourceName: clip.name, quaternionFlips, translationKeys };
    return grounded;
  }).filter((clip) => clip.tracks.length > 0);
}

function retargetSharedClips(sharedClips, sourceRoot, targetRoot, options = {}) {
  const sourceSkin = getSkinnedMesh(sourceRoot);
  const targetSkin = getSkinnedMesh(targetRoot);
  const channels = options.channels ?? { translate: true, rotate: true, scale: false };
  const positionPolicy = options.positionPolicy ?? 'hips';
  const sourceLabel = options.sourceLabel || 'source';
  const targetLabel = options.targetLabel || 'target';
  const names = options.names || {};
  if (!sourceSkin || !targetSkin) {
    const empty = [];
    empty.failures = sharedClips?.length || 0;
    empty.fallback = true;
    return empty;
  }
  const retargeted = [];
  let failures = 0;
  for (const clip of sharedClips || []) {
    try {
      const sourceFiltered = filterClipChannels(clip, channels, { positionPolicy, targetRoot: sourceRoot });
      if (!sourceFiltered.tracks.length) continue;
      const next = retargetClip(targetSkin, sourceSkin, sourceFiltered, {
        hip: names[findHipBoneName(targetSkin)] || findHipBoneName(sourceSkin) || findHipBoneName(targetSkin) || 'Hips',
        names,
        getBoneName: (bone) => mappedBoneName(bone, names),
        preserveBoneMatrix: false,
        preserveBonePositions: true,
        useFirstFramePosition: true,
        hipInfluence: new THREE.Vector3(1, 1, 1),
      });
      next.name = clip.name + ' -> ' + targetLabel + ' [' + channelSuffix(channels) + ']';
      next.userData = { ...(next.userData || {}), sourceName: clip.name, sourceActor: sourceLabel, targetActor: targetLabel };
      retargeted.push(next);
    } catch (err) {
      failures += 1;
      console.warn('retargetClip failed', clip.name, err);
    }
  }
  const prepared = prepareGroundedClips(retargeted, targetRoot, 'retarget:' + sourceLabel + '->' + targetLabel + ':' + channelSuffix(channels), { ...options, keepRootRotation: false, positionPolicy, channels, lockHipRotation: targetLabel === 'arcane' && options.lockHipRotation === true });
  prepared.failures = failures;
  prepared.fallback = prepared.length === 0;
  return prepared;
}

function filenameStem(url) {
  return String(url || '').split('/').pop().replace(/\.(glb|gltf|fbx)$/i, '');
}

function normalizeLoadedClipNames(clips, url) {
  const stem = filenameStem(url);
  return (clips || []).map((clip, index) => {
    const next = clip.clone();
    const generic = !next.name || /^Take 001$/i.test(next.name) || /mixamo\.com|Layer0/i.test(next.name);
    if (generic) next.name = stem + (clips.length > 1 ? '_' + (index + 1) : '');
    next.userData = { ...(next.userData || {}), sourceUrl: url, sourceFile: stem };
    return next;
  });
}

function findHipBoneNameInRoot(root) {
  return findHipBoneName(getSkinnedMesh(root)) || collectBones(root).find((bone) => /hip|pelvis/i.test(bone.name || ''))?.name || '';
}

function mappedBoneName(bone, names = {}) {
  return names?.[bone.name] || bone.name;
}

function torsoPriority(name) {
  const n = String(name || '').toLowerCase();
  if (/shouldercenter|spine2|upperchest|chest/.test(n)) return 0;
  if (/spine1|spine_1/.test(n)) return 1;
  if (/spine|torso|body/.test(n)) return 2;
  if (/root|hips?/.test(n)) return 3;
  return 99;
}

function pickTorsoQuaternionTrack(clip, sourceRoot) {
  const sourceBoneNames = new Set(collectBones(sourceRoot).map((bone) => bone.name));
  const candidates = [];
  for (const sourceTrack of clip.tracks || []) {
    const normalizedName = normalizeTrackName(sourceTrack.name);
    if (!normalizedName.endsWith('.quaternion')) continue;
    const nodeName = trackTargetName(normalizedName);
    if (!sourceBoneNames.has(nodeName)) continue;
    const priority = torsoPriority(nodeName);
    if (priority < 99) candidates.push({ priority, track: sourceTrack, nodeName });
  }
  candidates.sort((a, b) => a.priority - b.priority || a.nodeName.length - b.nodeName.length);
  return candidates[0] || null;
}

function canonicalBoneName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveMapTargets(sourceName, directMap = {}, directPairs = []) {
  const canonical = canonicalBoneName(sourceName);
  const targets = [];
  for (const pair of directPairs || []) {
    if (canonicalBoneName(pair.from) === canonical) targets.push({ name: pair.to, strength: Number(pair.strength ?? 1) });
  }
  for (const [from, to] of Object.entries(directMap || {})) {
    if (canonicalBoneName(from) === canonical && !targets.some((target) => target.name === to)) targets.push({ name: to, strength: 1 });
  }
  return targets;
}

function firstBoneChild(node) {
  return node?.children?.find((child) => child.isBone) || null;
}

function shouldUseChainUpBasis(sourceName, targetName, mode) {
  if (mode !== 'chain-up') return false;
  const source = canonicalBoneName(sourceName);
  const target = canonicalBoneName(targetName);
  const sourceArm = /^(armr|arml|forearmr|forearml|handr|handl)$/.test(source);
  const targetArm = /^(rightarm|leftarm|rightforearm|leftforearm|righthand|lefthand)$/.test(target);
  return sourceArm && targetArm;
}

function boneChainDirection(bone) {
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  if (/hand/i.test(bone?.name || '') && bone?.parent?.isBone) {
    bone.parent.getWorldPosition(start);
    bone.getWorldPosition(end);
  } else {
    const child = firstBoneChild(bone);
    if (child) {
      bone.getWorldPosition(start);
      child.getWorldPosition(end);
    } else if (bone?.parent?.isBone) {
      bone.parent.getWorldPosition(start);
      bone.getWorldPosition(end);
    } else {
      return null;
    }
  }
  const direction = end.sub(start);
  return direction.lengthSq() > 0.0000001 ? direction.normalize() : null;
}

function inferChainUpBasis(bone) {
  const xAxis = boneChainDirection(bone);
  if (!xAxis) {
    const fallback = new THREE.Quaternion();
    bone?.getWorldQuaternion(fallback);
    return fallback.normalize();
  }
  let reference = new THREE.Vector3(0, 1, 0);
  if (Math.abs(xAxis.dot(reference)) > 0.94) reference = new THREE.Vector3(0, 0, 1);
  let zAxis = reference.sub(xAxis.clone().multiplyScalar(reference.dot(xAxis)));
  if (zAxis.lengthSq() < 0.0000001) zAxis = new THREE.Vector3(0, 0, 1);
  zAxis.normalize();
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
  zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)).normalize();
}

function mapDeltaThroughChainUpBasis(delta, sourceBone, targetBone) {
  const sourceBasis = inferChainUpBasis(sourceBone);
  const targetBasis = inferChainUpBasis(targetBone);
  const canonicalDelta = sourceBasis.clone().invert().multiply(delta).multiply(sourceBasis).normalize();
  return targetBasis.clone().multiply(canonicalDelta).multiply(targetBasis.clone().invert()).normalize();
}

function buildMappedRotationClips(sharedClips, sourceRoot, targetRoot, options = {}) {
  const sourceLabel = options.sourceLabel || 'source';
  const targetLabel = options.targetLabel || 'target';
  const directMap = options.directRotationMap || {};
  const directPairs = options.directRotationPairs || [];
  const skipClipNames = new Set(options.skipClipNames || []);
  const boneRollCorrection = options.boneRollCorrection || 'none';
  sourceRoot.updateMatrixWorld(true);
  targetRoot.updateMatrixWorld(true);
  const built = [];
  let failures = 0;
  for (const clip of sharedClips || []) {
    if (skipClipNames.has(clip.name)) continue;
    const tracks = [];
    let flips = 0;
    for (const sourceTrack of clip.tracks || []) {
      const normalizedName = normalizeTrackName(sourceTrack.name);
      if (!normalizedName.endsWith('.quaternion')) continue;
      const sourceName = trackTargetName(normalizedName);
      const targetSpecs = resolveMapTargets(sourceName, directMap, directPairs);
      if (!targetSpecs.length) continue;
      const sourceBone = findNamedBone(sourceRoot, sourceName);
      if (!sourceBone || !sourceTrack.values || sourceTrack.values.length < 4) continue;
      const sourceRest = sourceBone.quaternion.clone().normalize();
      const invSourceRest = sourceRest.clone().invert();
      for (const targetSpec of targetSpecs) {
        const targetBone = findNamedBone(targetRoot, targetSpec.name);
        if (!targetBone) continue;
        const targetRest = targetBone.quaternion.clone();
        const strength = Math.max(0, Math.min(2, Number(targetSpec.strength ?? 1)));
        const values = new Float32Array(sourceTrack.values.length);
        for (let i = 0; i + 3 < sourceTrack.values.length; i += 4) {
          const current = new THREE.Quaternion(
            sourceTrack.values[i],
            sourceTrack.values[i + 1],
            sourceTrack.values[i + 2],
            sourceTrack.values[i + 3]
          ).normalize();
          const delta = invSourceRest.clone().multiply(current).normalize();
          const weightedDelta = new THREE.Quaternion().identity().slerp(delta, strength).normalize();
          const mappedDelta = shouldUseChainUpBasis(sourceName, targetSpec.name, boneRollCorrection)
            ? mapDeltaThroughChainUpBasis(weightedDelta, sourceBone, targetBone)
            : weightedDelta;
          const target = targetRest.clone().multiply(mappedDelta).normalize();
          values[i] = target.x;
          values[i + 1] = target.y;
          values[i + 2] = target.z;
          values[i + 3] = target.w;
        }
        const nextTrack = new THREE.QuaternionKeyframeTrack(targetSpec.name + '.quaternion', sourceTrack.times.slice(), values);
        flips += stabilizeQuaternionTrack(nextTrack);
        tracks.push(nextTrack);
      }
    }
    if (!tracks.length) {
      failures += 1;
      continue;
    }
    const next = new THREE.AnimationClip(clip.name + ' arms -> ' + targetLabel, clip.duration, tracks);
    next.optimize();
    next.userData = {
      origin: 'mapped-arms:' + sourceLabel + '->' + targetLabel,
      mode: 'mapped-chain-up-basis-rest-delta tracks=' + tracks.length,
      sourceName: clip.name,
      sourceActor: sourceLabel,
      targetActor: targetLabel,
      quaternionFlips: flips,
    };
    built.push(next);
  }
  built.failures = failures;
  built.fallback = built.length === 0;
  return built;
}


function findBoneCanonical(root, name) {
  const direct = findNamedBone(root, name);
  if (direct) return direct;
  const wanted = canonicalBoneName(name);
  let found = null;
  root.traverse((node) => {
    if (found || !node.isBone) return;
    if (canonicalBoneName(node.name) === wanted) found = node;
  });
  return found;
}

function worldPositionOf(node) {
  const value = new THREE.Vector3();
  node?.getWorldPosition(value);
  return value;
}

function averageBoneWorldPosition(root, names = []) {
  const points = [];
  for (const name of names) {
    const bone = findNamedBone(root, name);
    if (bone) points.push(worldPositionOf(bone));
  }
  if (!points.length) return null;
  const average = new THREE.Vector3();
  for (const point of points) average.add(point);
  return average.multiplyScalar(1 / points.length);
}

function worldQuaternionOf(node) {
  const value = new THREE.Quaternion();
  node?.getWorldQuaternion(value);
  return value;
}

function setBoneWorldQuaternion(bone, worldQuaternion) {
  const parentWorld = worldQuaternionOf(bone.parent).invert();
  bone.quaternion.copy(parentWorld.multiply(worldQuaternion).normalize());
}

function rotateIkJointToward(joint, end, targetWorld, strength = 1) {
  const jointPos = worldPositionOf(joint);
  const endDir = worldPositionOf(end).sub(jointPos);
  const targetDir = targetWorld.clone().sub(jointPos);
  if (endDir.lengthSq() < 0.000001 || targetDir.lengthSq() < 0.000001) return;
  endDir.normalize();
  targetDir.normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(endDir, targetDir);
  if (strength < 1) turn.slerp(new THREE.Quaternion(), 1 - strength).normalize();
  const nextWorld = turn.multiply(worldQuaternionOf(joint)).normalize();
  setBoneWorldQuaternion(joint, nextWorld);
  joint.updateMatrixWorld(true);
}

function solveTwoBoneIk(root, upper, lower, hand, targetWorld, iterations = 6) {
  for (let i = 0; i < iterations; i += 1) {
    rotateIkJointToward(lower, hand, targetWorld, 0.95);
    root.updateMatrixWorld(true);
    rotateIkJointToward(upper, hand, targetWorld, 0.85);
    root.updateMatrixWorld(true);
  }
}

function clipSampleTimes(clip, fps = 30) {
  const duration = Math.max(0, Number(clip.duration || 0));
  const count = Math.max(2, Math.ceil(duration * fps) + 1);
  const times = [];
  for (let i = 0; i < count; i += 1) times.push((duration * i) / (count - 1));
  return times;
}

function sourceHandLocal(sourceChest, sourceHand) {
  const local = worldPositionOf(sourceHand);
  sourceChest.worldToLocal(local);
  return local;
}

function guidedTargetLocalFromSource(sourceLocal, options = {}) {
  const lateralScale = Number(options.lateralScale ?? 1.15);
  const verticalScale = Number(options.verticalScale ?? 0.75);
  const forwardScale = Number(options.forwardScale ?? 0.95);
  const verticalOffset = Number(options.verticalOffset ?? -0.12);
  return new THREE.Vector3(
    sourceLocal.x * lateralScale,
    sourceLocal.y * verticalScale + verticalOffset,
    Math.max(0.08, sourceLocal.z * forwardScale)
  );
}

function axisVector(axisName) {
  const sign = String(axisName || 'z').startsWith('-') ? -1 : 1;
  const axis = String(axisName || 'z').replace(/^-/, '').toLowerCase();
  if (axis === 'x') return new THREE.Vector3(sign, 0, 0);
  if (axis === 'y') return new THREE.Vector3(0, sign, 0);
  return new THREE.Vector3(0, 0, sign);
}

function quaternionFromAxisDegrees(axisName, degrees = 0) {
  const amount = Number(degrees || 0);
  if (!amount) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromAxisAngle(axisVector(axisName || 'y').normalize(), THREE.MathUtils.degToRad(amount));
}

function applyLocalRotationOffset(bone, axisName, degrees) {
  const offset = quaternionFromAxisDegrees(axisName, degrees);
  if (Math.abs(Number(degrees || 0)) > 0.0001) bone.quaternion.multiply(offset).normalize();
}

function guidedTargetWorldFromSource(targetChest, sourceLocal, options = {}) {
  const targetLocal = guidedTargetLocalFromSource(sourceLocal, options);
  if ((options.targetBasis || 'world') !== 'bone') {
    const origin = worldPositionOf(targetChest);
    const lateral = axisVector(options.targetLateralAxis || 'x');
    const vertical = axisVector(options.targetVerticalAxis || 'y');
    const forward = axisVector(options.targetForwardAxis || 'z');
    return origin
      .add(lateral.multiplyScalar(targetLocal.x))
      .add(vertical.multiplyScalar(targetLocal.y))
      .add(forward.multiplyScalar(targetLocal.z));
  }
  return targetChest.localToWorld(targetLocal.clone());
}

function clampTargetToArmReach(shoulder, targetWorld, chainLength, reachScale = 0.97) {
  const shoulderWorld = worldPositionOf(shoulder);
  const offset = targetWorld.clone().sub(shoulderWorld);
  const maxReach = Math.max(0.001, chainLength * reachScale);
  if (offset.length() > maxReach) offset.setLength(maxReach);
  return shoulderWorld.add(offset);
}

function armChainLength(upper, lower, hand) {
  return worldPositionOf(lower).distanceTo(worldPositionOf(upper)) + worldPositionOf(hand).distanceTo(worldPositionOf(lower));
}

function buildPositionGuidedArmClips(sharedClips, sourceRoot, targetRoot, options = {}) {
  const config = options.positionGuidedArmClips;
  if (!config) {
    const empty = [];
    empty.failures = 0;
    empty.fallback = false;
    return empty;
  }
  const clipNames = new Set(Array.isArray(config.clips) ? config.clips : []);
  const clipPattern = config.clipPattern ? new RegExp(config.clipPattern) : null;
  const shouldGuideClip = (clipName) => Boolean(config.allClips || clipNames.has(clipName) || clipPattern?.test(clipName));
  const sourceLabel = options.sourceLabel || 'source';
  const targetLabel = options.targetLabel || 'target';
  const built = [];
  let failures = 0;
  for (const clip of sharedClips || []) {
    if (!shouldGuideClip(clip.name)) continue;
    const sourceClone = cloneSkinnedObject(sourceRoot);
    const targetClone = cloneSkinnedObject(targetRoot);
    const sourceChest = findBoneCanonical(sourceClone, config.sourceChest || 'ShoulderCenter');
    const targetChest = findBoneCanonical(targetClone, config.targetChest || 'Spine');
    if (!sourceChest || !targetChest) {
      failures += 1;
      continue;
    }
    const sourceMixer = new THREE.AnimationMixer(sourceClone);
    const sourceAction = sourceMixer.clipAction(clip);
    sourceAction.play();
    sourceClone.updateMatrixWorld(true);
    targetClone.updateMatrixWorld(true);
    const targetRestPose = captureBonePose(targetClone);
    const times = clipSampleTimes(clip, Number(config.sampleFps || 30));
    const trackValues = new Map();
    const targetBones = new Map();
    const chains = [];
    for (const chainSpec of config.chains || []) {
      const sourceHand = findBoneCanonical(sourceClone, chainSpec.sourceHand);
      const upper = findBoneCanonical(targetClone, chainSpec.targetUpper);
      const lower = findBoneCanonical(targetClone, chainSpec.targetLower);
      const hand = findBoneCanonical(targetClone, chainSpec.targetHand);
      if (!sourceHand || !upper || !lower || !hand) continue;
      const chain = { sourceHand, upper, lower, hand, length: armChainLength(upper, lower, hand), spec: chainSpec };
      chains.push(chain);
      for (const bone of [upper, lower, hand]) {
        if (!trackValues.has(bone.name)) {
          trackValues.set(bone.name, new Float32Array(times.length * 4));
          targetBones.set(bone.name, bone);
        }
      }
    }
    if (!chains.length) {
      failures += 1;
      continue;
    }
    for (let sampleIndex = 0; sampleIndex < times.length; sampleIndex += 1) {
      const time = times[sampleIndex];
      restoreBonePose(targetClone, targetRestPose);
      sourceMixer.setTime(time);
      sourceClone.updateMatrixWorld(true);
      targetClone.updateMatrixWorld(true);
      for (const chain of chains) {
        const sourceLocal = sourceHandLocal(sourceChest, chain.sourceHand);
        const targetWorld = guidedTargetWorldFromSource(targetChest, sourceLocal, { ...config, ...chain.spec });
        const clampedTarget = clampTargetToArmReach(chain.upper, targetWorld, chain.length, Number(chain.spec.reachScale ?? config.reachScale ?? 0.97));
        solveTwoBoneIk(targetClone, chain.upper, chain.lower, chain.hand, clampedTarget, Number(config.iterations || 6));
        applyLocalRotationOffset(chain.hand, chain.spec.handRollAxis || config.handRollAxis || 'y', Number(chain.spec.handRollDeg ?? 0));
        targetClone.updateMatrixWorld(true);
      }
      targetClone.updateMatrixWorld(true);
      for (const [boneName, values] of trackValues) {
        const q = targetBones.get(boneName).quaternion;
        const base = sampleIndex * 4;
        values[base] = q.x;
        values[base + 1] = q.y;
        values[base + 2] = q.z;
        values[base + 3] = q.w;
      }
    }
    const tracks = [];
    let flips = 0;
    for (const [boneName, values] of trackValues) {
      const track = new THREE.QuaternionKeyframeTrack(boneName + '.quaternion', times, values);
      flips += stabilizeQuaternionTrack(track);
      tracks.push(track);
    }
    const next = new THREE.AnimationClip(clip.name + ' arms -> ' + targetLabel, clip.duration, tracks);
    next.optimize();
    next.userData = {
      origin: 'mapped-arms:' + sourceLabel + '->' + targetLabel,
      mode: 'position-guided-world-forward-ik tracks=' + tracks.length + ' fwd=' + (config.targetForwardAxis || 'z'),
      sourceName: clip.name,
      sourceActor: sourceLabel,
      targetActor: targetLabel,
      quaternionFlips: flips,
    };
    built.push(next);
  }
  built.failures = failures;
  built.fallback = built.length === 0;
  return built;
}

function buildTorsoToHipClips(sharedClips, sourceRoot, targetRoot, options = {}) {
  const sourceLabel = options.sourceLabel || 'source';
  const targetLabel = options.targetLabel || 'target';
  const targetHip = findHipBoneNameInRoot(targetRoot);
  const targetHipBone = findNamedBone(targetRoot, targetHip);
  const targetRest = targetHipBone?.quaternion?.clone() || new THREE.Quaternion();
  const built = [];
  let failures = 0;
  if (!targetHip) {
    built.failures = sharedClips?.length || 0;
    built.fallback = true;
    return built;
  }
  for (const clip of sharedClips || []) {
    const picked = pickTorsoQuaternionTrack(clip, sourceRoot);
    if (!picked || !picked.track?.values || picked.track.values.length < 4) {
      failures += 1;
      continue;
    }
    const sourceRest = findNamedBone(sourceRoot, picked.nodeName)?.quaternion?.clone()?.normalize() || new THREE.Quaternion(
      picked.track.values[0],
      picked.track.values[1],
      picked.track.values[2],
      picked.track.values[3]
    ).normalize();
    const invSourceRest = sourceRest.clone().invert();
    const values = new Float32Array(picked.track.values.length);
    for (let i = 0; i + 3 < picked.track.values.length; i += 4) {
      const current = new THREE.Quaternion(
        picked.track.values[i],
        picked.track.values[i + 1],
        picked.track.values[i + 2],
        picked.track.values[i + 3]
      ).normalize();
      const delta = invSourceRest.clone().multiply(current).normalize();
      const target = targetRest.clone().multiply(delta).normalize();
      values[i] = target.x;
      values[i + 1] = target.y;
      values[i + 2] = target.z;
      values[i + 3] = target.w;
    }
    const nextTrack = new THREE.QuaternionKeyframeTrack(targetHip + '.quaternion', picked.track.times.slice(), values);
    const flips = stabilizeQuaternionTrack(nextTrack);
    const next = new THREE.AnimationClip(clip.name + ' torso -> ' + targetLabel + ' hips', clip.duration, [nextTrack]);
    next.optimize();
    next.userData = {
      origin: 'torso-hips:' + sourceLabel + '->' + targetLabel,
      mode: 'torso-model-rest-delta-to-hip source=' + picked.nodeName + ' target=' + targetHip,
      sourceName: clip.name,
      sourceActor: sourceLabel,
      targetActor: targetLabel,
      quaternionFlips: flips,
    };
    built.push(next);
  }
  built.failures = failures;
  built.fallback = built.length === 0;
  return built;
}

function clipKey(clip) {
  return (clip.userData?.origin || 'own') + ':' + clip.name;
}

function clampValue(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function makeTrackLike(sourceTrack, times, values) {
  const nextTimes = Float32Array.from(times || []);
  const interpolation = sourceTrack.getInterpolation ? sourceTrack.getInterpolation() : undefined;
  let next;
  if (sourceTrack.ValueTypeName === 'quaternion' || sourceTrack.name.endsWith('.quaternion')) next = new THREE.QuaternionKeyframeTrack(sourceTrack.name, nextTimes, Float32Array.from(values || []), interpolation);
  else if (sourceTrack.ValueTypeName === 'vector' || sourceTrack.name.endsWith('.position') || sourceTrack.name.endsWith('.scale')) next = new THREE.VectorKeyframeTrack(sourceTrack.name, nextTimes, Float32Array.from(values || []), interpolation);
  else if (sourceTrack.ValueTypeName === 'bool') next = new THREE.BooleanKeyframeTrack(sourceTrack.name, nextTimes, Array.from(values || []), interpolation);
  else if (sourceTrack.ValueTypeName === 'string') next = new THREE.StringKeyframeTrack(sourceTrack.name, nextTimes, Array.from(values || []), interpolation);
  else next = new THREE.NumberKeyframeTrack(sourceTrack.name, nextTimes, Float32Array.from(values || []), interpolation);
  if (next.name.endsWith('.quaternion')) stabilizeQuaternionTrack(next);
  return next;
}

function copyTrackFrame(track, index) {
  const stride = track.getValueSize();
  const offset = index * stride;
  return Array.from(track.values.slice(offset, offset + stride));
}

function sampleTrackValue(track, time) {
  const times = track.times || [];
  const values = track.values || [];
  const stride = track.getValueSize();
  if (!times.length || !values.length) return new Array(stride).fill(0);
  if (time <= times[0]) return copyTrackFrame(track, 0);
  if (time >= times[times.length - 1]) return copyTrackFrame(track, times.length - 1);
  let hi = 1;
  while (hi < times.length && times[hi] < time) hi += 1;
  const lo = Math.max(0, hi - 1);
  const span = Math.max(0.000001, times[hi] - times[lo]);
  const alpha = clampValue((time - times[lo]) / span, 0, 1);
  const a = copyTrackFrame(track, lo);
  const b = copyTrackFrame(track, hi);
  if (track.name.endsWith('.quaternion') && stride === 4) {
    const qa = new THREE.Quaternion(a[0], a[1], a[2], a[3]).normalize();
    const qb = new THREE.Quaternion(b[0], b[1], b[2], b[3]).normalize();
    qa.slerp(qb, alpha).normalize();
    return [qa.x, qa.y, qa.z, qa.w];
  }
  if (track.ValueTypeName === 'bool' || track.ValueTypeName === 'string') return alpha < 0.5 ? a : b;
  return a.map((value, index) => value + (b[index] - value) * alpha);
}

function pushKeyframe(times, values, time, frame) {
  const t = Math.max(0, Number(time) || 0);
  if (times.length && Math.abs(times[times.length - 1] - t) < 0.00001) {
    times[times.length - 1] = t;
    values.splice(values.length - frame.length, frame.length, ...frame);
    return;
  }
  times.push(t);
  values.push(...frame);
}

function cleanupClipName(clip, suffix) {
  const sourceName = clip.userData?.sourceName || clip.name || 'clip';
  return sourceName + ' [' + suffix + ']';
}

function buildCleanupClip(sourceClip, name, tracks, meta = {}) {
  const duration = Math.max(0.001, Number(meta.duration ?? sourceClip.duration ?? 0.001));
  const next = new THREE.AnimationClip(name, duration, tracks.filter(Boolean));
  next.optimize();
  next.userData = {
    ...(sourceClip.userData || {}),
    sourceName: sourceClip.userData?.sourceName || sourceClip.name,
    sourceKey: clipKey(sourceClip),
    cleanup: true,
    cleanupOp: meta.op || 'cleanup',
    mode: 'cleanup ' + (meta.mode || meta.op || 'clip'),
    sourceDuration: sourceClip.duration,
    duration,
    cleanupTracks: next.tracks.length,
    quaternionFlips: meta.quaternionFlips ?? sourceClip.userData?.quaternionFlips ?? 0,
  };
  return next;
}

function deleteClipRange(sourceClip, start, end) {
  const duration = Math.max(0.001, sourceClip.duration || 0.001);
  const a = clampValue(Math.min(start, end), 0, duration);
  const b = clampValue(Math.max(start, end), 0, duration);
  const gap = b - a;
  if (gap <= 0.0005) return null;
  const nextDuration = Math.max(0.001, duration - gap);
  const tracks = [];
  for (const track of sourceClip.tracks || []) {
    const times = [];
    const values = [];
    for (let i = 0; i < track.times.length; i += 1) {
      const time = track.times[i];
      if (time < a - 0.00001) pushKeyframe(times, values, time, copyTrackFrame(track, i));
    }
    if (b < duration - 0.00001) pushKeyframe(times, values, a, sampleTrackValue(track, b));
    for (let i = 0; i < track.times.length; i += 1) {
      const time = track.times[i];
      if (time > b + 0.00001) pushKeyframe(times, values, time - gap, copyTrackFrame(track, i));
    }
    if (!times.length) pushKeyframe(times, values, 0, sampleTrackValue(track, Math.min(b, duration)));
    if (times[times.length - 1] < nextDuration - 0.00001) pushKeyframe(times, values, nextDuration, sampleTrackValue(track, duration));
    tracks.push(makeTrackLike(track, times, values));
  }
  return buildCleanupClip(sourceClip, cleanupClipName(sourceClip, 'delete ' + fmt(a) + '-' + fmt(b)), tracks, {
    op: 'delete-range',
    mode: 'delete ' + fmt(gap) + 's from ' + fmt(a) + '-' + fmt(b),
    duration: nextDuration,
  });
}

function trimClipRange(sourceClip, start, end) {
  const duration = Math.max(0.001, sourceClip.duration || 0.001);
  const a = clampValue(Math.min(start, end), 0, duration);
  const b = clampValue(Math.max(start, end), 0, duration);
  if (b - a <= 0.0005) return null;
  const nextDuration = Math.max(0.001, b - a);
  const tracks = [];
  for (const track of sourceClip.tracks || []) {
    const times = [];
    const values = [];
    pushKeyframe(times, values, 0, sampleTrackValue(track, a));
    for (let i = 0; i < track.times.length; i += 1) {
      const time = track.times[i];
      if (time > a + 0.00001 && time < b - 0.00001) pushKeyframe(times, values, time - a, copyTrackFrame(track, i));
    }
    pushKeyframe(times, values, nextDuration, sampleTrackValue(track, b));
    tracks.push(makeTrackLike(track, times, values));
  }
  return buildCleanupClip(sourceClip, cleanupClipName(sourceClip, 'trim ' + fmt(a) + '-' + fmt(b)), tracks, {
    op: 'trim-range',
    mode: 'trim to ' + fmt(a) + '-' + fmt(b),
    duration: nextDuration,
  });
}

function selectedTrackChannels(channels, track) {
  const channel = trackChannel(track.name);
  if (channel === 'translate') return channels.translate;
  if (channel === 'rotate') return channels.rotate;
  if (channel === 'scale') return channels.scale;
  return false;
}

function smoothClipRange(sourceClip, start, end, options = {}) {
  const duration = Math.max(0.001, sourceClip.duration || 0.001);
  const a = clampValue(Math.min(start, end), 0, duration);
  const b = clampValue(Math.max(start, end), 0, duration);
  const strength = clampValue(options.strength ?? 0.45, 0, 1);
  const passes = Math.max(1, Math.min(8, Math.round(Number(options.passes || 1))));
  const channels = options.channels || { translate: true, rotate: true, scale: false };
  const tracks = [];
  let changedTracks = 0;
  let flips = 0;
  for (const sourceTrack of sourceClip.tracks || []) {
    const track = sourceTrack.clone();
    if (!selectedTrackChannels(channels, track) || track.times.length < 3 || strength <= 0) {
      tracks.push(track);
      continue;
    }
    if (track.name.endsWith('.quaternion')) flips += stabilizeQuaternionTrack(track);
    const stride = track.getValueSize();
    const values = Float32Array.from(track.values);
    for (let pass = 0; pass < passes; pass += 1) {
      const previous = Float32Array.from(values);
      for (let key = 1; key < track.times.length - 1; key += 1) {
        const time = track.times[key];
        if (time < a || time > b) continue;
        const offset = key * stride;
        const prevOffset = (key - 1) * stride;
        const nextOffset = (key + 1) * stride;
        if (track.name.endsWith('.quaternion') && stride === 4) {
          const current = new THREE.Quaternion(previous[offset], previous[offset + 1], previous[offset + 2], previous[offset + 3]).normalize();
          const target = new THREE.Quaternion(previous[prevOffset], previous[prevOffset + 1], previous[prevOffset + 2], previous[prevOffset + 3]).normalize();
          const next = new THREE.Quaternion(previous[nextOffset], previous[nextOffset + 1], previous[nextOffset + 2], previous[nextOffset + 3]).normalize();
          target.slerp(next, 0.5).normalize();
          current.slerp(target, strength).normalize();
          values[offset] = current.x;
          values[offset + 1] = current.y;
          values[offset + 2] = current.z;
          values[offset + 3] = current.w;
        } else if (track.ValueTypeName !== 'bool' && track.ValueTypeName !== 'string') {
          for (let c = 0; c < stride; c += 1) {
            const average = (previous[prevOffset + c] + previous[nextOffset + c]) * 0.5;
            values[offset + c] = previous[offset + c] + (average - previous[offset + c]) * strength;
          }
        }
      }
    }
    const nextTrack = makeTrackLike(track, track.times, values);
    if (nextTrack.name.endsWith('.quaternion')) flips += stabilizeQuaternionTrack(nextTrack);
    tracks.push(nextTrack);
    changedTracks += 1;
  }
  return buildCleanupClip(sourceClip, cleanupClipName(sourceClip, 'smooth'), tracks, {
    op: 'smooth-range',
    mode: 'smooth tracks=' + changedTracks + ' range=' + fmt(a) + '-' + fmt(b) + ' strength=' + Math.round(strength * 100) + '% passes=' + passes,
    duration,
    quaternionFlips: flips,
  });
}

function stabilizeClip(sourceClip) {
  const tracks = [];
  let flips = 0;
  for (const sourceTrack of sourceClip.tracks || []) {
    const track = sourceTrack.clone();
    flips += stabilizeQuaternionTrack(track);
    tracks.push(track);
  }
  return buildCleanupClip(sourceClip, cleanupClipName(sourceClip, 'rot fixed'), tracks, {
    op: 'stabilize-quaternion',
    mode: 'quaternion sign stabilization flips=' + flips,
    duration: sourceClip.duration,
    quaternionFlips: flips,
  });
}

function resampleClip(sourceClip, fps) {
  const duration = Math.max(0.001, sourceClip.duration || 0.001);
  const rate = clampValue(fps, 8, 120);
  const count = Math.max(2, Math.ceil(duration * rate) + 1);
  const times = [];
  for (let i = 0; i < count; i += 1) times.push((duration * i) / (count - 1));
  const tracks = [];
  let flips = 0;
  for (const sourceTrack of sourceClip.tracks || []) {
    const values = [];
    for (const time of times) values.push(...sampleTrackValue(sourceTrack, time));
    const track = makeTrackLike(sourceTrack, times, values);
    flips += stabilizeQuaternionTrack(track);
    tracks.push(track);
  }
  return buildCleanupClip(sourceClip, cleanupClipName(sourceClip, 'resample ' + Math.round(rate) + 'fps'), tracks, {
    op: 'resample-fps',
    mode: 'resample fps=' + Math.round(rate) + ' keys=' + count,
    duration,
    quaternionFlips: flips,
  });
}

function clipKeyCount(clip) {
  let keys = 0;
  for (const track of clip?.tracks || []) keys += track.times?.length || 0;
  return keys;
}

function setSelectOptions(select, entries, preferred = '') {
  if (!select) return '';
  const previous = preferred || select.value || '';
  select.replaceChildren();
  for (const entry of entries || []) {
    const option = document.createElement('option');
    option.value = entry.key;
    option.textContent = entry.label;
    select.append(option);
  }
  const next = (entries || []).some((entry) => entry.key === previous) ? previous : ((entries || [])[0]?.key || '');
  select.value = next;
  return next;
}

function clipEntries(actor) {
  return actor?.clips?.map((clip) => ({ key: clipKey(clip), label: clipLabel(clip), clip })) || [];
}

function defaultMergeClipName(sourceClip, targetClip) {
  const sourceName = String(sourceClip?.userData?.sourceName || sourceClip?.name || 'clip-a').trim();
  const targetName = String(targetClip?.userData?.sourceName || targetClip?.name || 'clip-b').trim();
  return sourceName + ' -> ' + targetName + ' [merge]';
}

function findClipByKey(actor, key) {
  if (!actor || !key) return null;
  return actor.actions.get(key)?._clip || actor.clips.find((clip) => clipKey(clip) === key) || null;
}

function sampleTrackValueWithFallback(track, time, fallbackTrack, fallbackTime = 0) {
  if (track) return sampleTrackValue(track, time);
  if (fallbackTrack) return sampleTrackValue(fallbackTrack, fallbackTime);
  const stride = track?.getValueSize?.() || fallbackTrack?.getValueSize?.() || 0;
  return new Array(stride).fill(0);
}

function blendFramesForTrack(track, frameA, frameB, alpha, blendable = true) {
  if (!Array.isArray(frameA) || !Array.isArray(frameB)) return Array.isArray(frameA) ? frameA : frameB;
  if (!blendable) return alpha < 1 ? frameA.slice() : frameB.slice();
  if (track?.name?.endsWith('.quaternion') && frameA.length === 4 && frameB.length === 4) {
    const qa = new THREE.Quaternion(frameA[0], frameA[1], frameA[2], frameA[3]).normalize();
    const qb = new THREE.Quaternion(frameB[0], frameB[1], frameB[2], frameB[3]).normalize();
    qa.slerp(qb, clampValue(alpha, 0, 1)).normalize();
    return [qa.x, qa.y, qa.z, qa.w];
  }
  if (track?.ValueTypeName === 'bool' || track?.ValueTypeName === 'string') return alpha < 0.5 ? frameA.slice() : frameB.slice();
  return frameA.map((value, index) => value + ((frameB[index] ?? value) - value) * clampValue(alpha, 0, 1));
}

function buildMergedClip(sourceClip, targetClip, start, end, options = {}) {
  if (!sourceClip || !targetClip) return null;
  const sourceDuration = Math.max(0.001, Number(sourceClip.duration || 0.001));
  const targetDuration = Math.max(0.001, Number(targetClip.duration || 0.001));
  const blendStart = clampValue(Math.min(start, end), 0, sourceDuration);
  const blendEnd = clampValue(Math.max(start, end), blendStart + 0.001, sourceDuration);
  const trimAfterBlend = Boolean(options.trimAfterBlend);
  const outputDuration = Math.max(0.001, trimAfterBlend ? blendEnd : (blendStart + targetDuration));
  const rate = clampValue(options.fps ?? 30, 8, 120);
  const sampleCount = Math.max(2, Math.ceil(outputDuration * rate) + 1);
  const times = [];
  for (let i = 0; i < sampleCount; i += 1) times.push((outputDuration * i) / (sampleCount - 1));
  const channels = options.channels || { translate: true, rotate: true, scale: true };
  const trackNames = new Set();
  for (const track of sourceClip.tracks || []) trackNames.add(track.name);
  for (const track of targetClip.tracks || []) trackNames.add(track.name);
  const sourceTracks = new Map((sourceClip.tracks || []).map((track) => [track.name, track]));
  const targetTracks = new Map((targetClip.tracks || []).map((track) => [track.name, track]));
  const tracks = [];
  let flips = 0;
  for (const trackName of trackNames) {
    const sourceTrack = sourceTracks.get(trackName) || null;
    const targetTrack = targetTracks.get(trackName) || null;
    const template = sourceTrack || targetTrack;
    if (!template) continue;
    const blendable = selectedTrackChannels(channels, template);
    const values = [];
    for (const time of times) {
      const aTime = clampValue(time, 0, sourceDuration);
      const bTime = clampValue(time - blendStart, 0, targetDuration);
      const alpha = time <= blendStart ? 0 : time >= blendEnd ? 1 : (time - blendStart) / Math.max(0.001, blendEnd - blendStart);
      const frameA = sampleTrackValueWithFallback(sourceTrack, aTime, targetTrack, bTime);
      const frameB = sampleTrackValueWithFallback(targetTrack, bTime, sourceTrack, aTime);
      values.push(...blendFramesForTrack(template, frameA, frameB, alpha, blendable));
    }
    const nextTrack = makeTrackLike(template, times, values);
    flips += stabilizeQuaternionTrack(nextTrack);
    tracks.push(nextTrack);
  }
  const sourceName = sourceClip.userData?.sourceName || sourceClip.name || 'clip-a';
  const targetName = targetClip.userData?.sourceName || targetClip.name || 'clip-b';
  const requestedName = String(options.name || '').trim();
  const next = buildCleanupClip(sourceClip, requestedName || `${sourceName} -> ${targetName} [merge]`, tracks, {
    op: 'merge-clips',
    mode: 'merge ' + sourceName + ' -> ' + targetName + ' blend=' + fmt(blendStart) + '-' + fmt(blendEnd) + ' out=' + fmt(outputDuration) + ' fps=' + Math.round(rate) + (trimAfterBlend ? ' trimAfterBlend' : ''),
    duration: outputDuration,
    quaternionFlips: flips,
  });
  next.userData.sourceName = sourceName + ' -> ' + targetName;
  next.userData.mergeSourceKey = clipKey(sourceClip);
  next.userData.mergeTargetKey = clipKey(targetClip);
  next.userData.mergeSourceName = sourceName;
  next.userData.mergeTargetName = targetName;
  next.userData.mergeBlendStart = blendStart;
  next.userData.mergeBlendEnd = blendEnd;
  next.userData.mergeOutputDuration = outputDuration;
  next.userData.mergeFps = rate;
  next.userData.mergeTrimAfterBlend = trimAfterBlend;
  return next;
}

function serializedTrackType(track) {
  if (track.ValueTypeName) return track.ValueTypeName;
  if (track.name.endsWith('.quaternion')) return 'quaternion';
  if (track.name.endsWith('.position') || track.name.endsWith('.scale')) return 'vector';
  return 'number';
}

function serializeAnimationClip(clip) {
  return {
    schema: 'pose-lab-animation-clip-v1',
    name: clip.name,
    duration: clip.duration,
    userData: { ...(clip.userData || {}) },
    tracks: (clip.tracks || []).map((track) => ({
      name: track.name,
      type: serializedTrackType(track),
      interpolation: track.getInterpolation ? track.getInterpolation() : undefined,
      times: Array.from(track.times || []),
      values: Array.from(track.values || []),
    })),
  };
}

function deserializeAnimationClip(data) {
  if (!data || !Array.isArray(data.tracks)) return null;
  const tracks = data.tracks.map((entry) => {
    const times = Float32Array.from(entry.times || []);
    const numericValues = Float32Array.from(entry.values || []);
    if (entry.type === 'quaternion' || String(entry.name || '').endsWith('.quaternion')) return new THREE.QuaternionKeyframeTrack(entry.name, times, numericValues, entry.interpolation);
    if (entry.type === 'vector' || String(entry.name || '').endsWith('.position') || String(entry.name || '').endsWith('.scale')) return new THREE.VectorKeyframeTrack(entry.name, times, numericValues, entry.interpolation);
    if (entry.type === 'bool') return new THREE.BooleanKeyframeTrack(entry.name, times, Array.from(entry.values || []), entry.interpolation);
    if (entry.type === 'string') return new THREE.StringKeyframeTrack(entry.name, times, Array.from(entry.values || []), entry.interpolation);
    return new THREE.NumberKeyframeTrack(entry.name, times, numericValues, entry.interpolation);
  });
  const clip = new THREE.AnimationClip(data.name || 'cleanup draft', Number(data.duration || 0.001), tracks);
  clip.userData = { ...(data.userData || {}), cleanup: true, restoredDraft: true };
  return clip;
}

function safeFileStem(name) {
  return String(name || 'clip').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'clip';
}

function mergeClips(sharedClips, ownClips) {
  const merged = new Map();
  for (const clip of ownClips || []) merged.set(clipKey(clip), clip);
  for (const clip of sharedClips || []) merged.set(clipKey(clip), clip);
  return [...merged.values()];
}

function degToRad(value) { return THREE.MathUtils.degToRad(Number(value)); }
function radToDeg(value) { return Math.round(THREE.MathUtils.radToDeg(value)); }
function setStatus(text) { const next = 'lab ' + LAB_BUILD + ' | ' + text; UI.status.textContent = next; UI.loadState.textContent = next; }
function fmt(value) { return Number.isFinite(value) ? value.toFixed(3) : 'n/a'; }
function fmtQuat(value) { return value ? [value.x, value.y, value.z, value.w].map(fmt).join(',') : 'n/a'; }

function clipMatchesPreference(candidate, pref) {
  if (!candidate || !pref) return false;
  const origin = candidate.userData?.origin || 'own';
  if (pref.origin && origin !== pref.origin) return false;
  if (pref.sourceName && candidate.userData?.sourceName === pref.sourceName) return true;
  return Boolean(pref.name && candidate.name === pref.name);
}

function roundValue(value, digits = 5) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function dedupeSortedTimes(times, epsilon = 0.0001) {
  const sorted = [...times].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const deduped = [];
  for (const value of sorted) {
    if (!deduped.length || Math.abs(deduped[deduped.length - 1] - value) > epsilon) deduped.push(value);
  }
  return deduped;
}

function clipKeyTimes(clip) {
  if (!clip?.tracks?.length) return [];
  const times = [];
  for (const track of clip.tracks || []) {
    for (const time of track.times || []) times.push(Number(time));
  }
  const deduped = dedupeSortedTimes(times);
  if (!deduped.length && Number.isFinite(clip.duration)) deduped.push(0, Number(clip.duration));
  return deduped;
}

function nearestKeyIndex(times, time) {
  if (!times.length) return -1;
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < times.length; index += 1) {
    const distance = Math.abs(times[index] - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function normalizeClipTokens(name) {
  return String(name || '')
    .replace(/\[(.*?)\]/g, ' ')
    .replace(/->/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeClipName(name) {
  const ignored = new Set(['own', 'cleanup', 'player', 'enemy', 'shared', 'retarget', 'gravity', 'fist']);
  return normalizeClipTokens(name).filter((token) => !ignored.has(token)).join(' ');
}

function watchDistance(snapshot, left, right) {
  const a = snapshot?.watch?.bones?.[left];
  const b = snapshot?.watch?.bones?.[right];
  if (!a || !b) return 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function snapshotBoneMap(snapshot) {
  const map = new Map();
  for (const bone of snapshot?.bones || []) map.set(bone.name, bone);
  return map;
}

function quaternionSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 4 || b.length < 4) return 0;
  const dot = Math.abs((a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]) + (a[3] * b[3]));
  return clampValue(dot, 0, 1);
}

function poseDifferenceScore(a, b) {
  if (!a || !b) return 0;
  const aBones = snapshotBoneMap(a);
  const bBones = snapshotBoneMap(b);
  let total = 0;
  let count = 0;
  for (const [name, left] of aBones) {
    const right = bBones.get(name);
    if (!right) continue;
    const dx = (left.position?.[0] || 0) - (right.position?.[0] || 0);
    const dy = (left.position?.[1] || 0) - (right.position?.[1] || 0);
    const dz = (left.position?.[2] || 0) - (right.position?.[2] || 0);
    const posDelta = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    const rotDelta = 1 - quaternionSimilarity(left.quaternion, right.quaternion);
    total += (posDelta * 2.1) + (rotDelta * 5.0);
    count += 1;
  }
  return count ? total / count : 0;
}

function poseSnapshot(actor) {
  const stats = actor.poseStats || actor.collectPoseStats();
  return {
    transform: {
      posX: Number(actor.values?.posX || 0),
      posY: Number(actor.values?.posY || 0),
      posZ: Number(actor.values?.posZ || 0),
      rotationX: Number(actor.values?.x || 0),
      rotationY: Number(actor.values?.y || 0),
      rotationZ: Number(actor.values?.z || 0),
      basisX: Number(actor.values?.basisX || 0),
      basisY: Number(actor.values?.basisY || 0),
      basisZ: Number(actor.values?.basisZ || 0),
      scale: Number(actor.values?.scale || 100),
    },
    watch: {
      footDelta: roundValue(stats.footDelta),
      toeDelta: roundValue(stats.toeDelta),
      bones: Object.fromEntries(Object.entries(stats.bones || {}).map(([label, vector]) => [label, {
        x: roundValue(vector.x),
        y: roundValue(vector.y),
        z: roundValue(vector.z),
      }])),
    },
    bones: actor.bones.map((bone) => ({
      name: bone.name,
      shortName: shortBoneName(bone.name),
      position: [roundValue(bone.position.x), roundValue(bone.position.y), roundValue(bone.position.z)],
      quaternion: [roundValue(bone.quaternion.x), roundValue(bone.quaternion.y), roundValue(bone.quaternion.z), roundValue(bone.quaternion.w)],
      scale: [roundValue(bone.scale.x), roundValue(bone.scale.y), roundValue(bone.scale.z)],
    })),
  };
}

function buildSemanticHints(meta, duration) {
  const hints = [{ label: 'start', tag: 'start', time: 0 }];
  if (meta) {
    if (Number.isFinite(meta.dash_start)) hints.push({ label: 'windup', tag: 'windup', time: Number(meta.dash_start) });
    if (Number.isFinite(meta.active_time)) hints.push({ label: 'impact', tag: 'impact', time: Number(meta.active_time) });
    if (Number.isFinite(meta.active_time) && Number.isFinite(meta.active_duration)) hints.push({ label: 'follow_through', tag: 'follow_through', time: Number(meta.active_time) + Number(meta.active_duration) });
    if (Number.isFinite(meta.attack_end)) hints.push({ label: 'recover', tag: 'recover', time: Number(meta.attack_end) });
  }
  hints.push({ label: 'end', tag: 'end', time: duration });
  const deduped = [];
  for (const hint of hints) {
    const time = clampValue(hint.time, 0, duration);
    if (deduped.some((entry) => Math.abs(entry.time - time) < 0.02)) continue;
    deduped.push({ ...hint, time });
  }
  return deduped;
}

function nearestSemanticHint(time, hints = []) {
  let best = hints[0] || { tag: 'pose', label: 'pose', time: 0 };
  let bestDelta = Infinity;
  for (const hint of hints) {
    const delta = Math.abs(Number(hint.time || 0) - Number(time || 0));
    if (delta < bestDelta) {
      best = hint;
      bestDelta = delta;
    }
  }
  const duration = Math.max(0.0001, Number(hints[hints.length - 1]?.time || 0.0001));
  const normalizedDelta = clampValue(bestDelta / Math.max(0.04, duration * 0.1), 0, 1);
  return { ...best, delta: bestDelta, confidence: roundValue(1 - normalizedDelta, 4) };
}

function classifyReachLabel(value) {
  if (value > 0.42) return 'fully_extended';
  if (value > 0.24) return 'extended';
  if (value < -0.05) return 'retracted';
  return 'neutral';
}

function classifyMotionLabel(value) {
  if (value > 1.45) return 'explosive';
  if (value > 0.75) return 'driving';
  if (value < 0.18) return 'held';
  return 'settling';
}

function frameDescriptionFromDescriptors(frame) {
  const pieces = [frame.semanticLabel || 'pose'];
  if (frame.descriptors?.strikeSide && frame.descriptors.strikeSide !== 'center') pieces.push(frame.descriptors.strikeSide + '-side');
  pieces.push(frame.descriptors?.reach || 'neutral');
  pieces.push(frame.descriptors?.guard || 'mid_guard');
  pieces.push(frame.descriptors?.base || 'balanced_base');
  pieces.push(frame.descriptors?.motion || 'settling');
  return pieces.join(' ');
}

function describePoseFrame(entry, prevEntry, nextEntry, hints = [], clipDuration = 0, meta = null) {
  const snapshot = entry.snapshot;
  const hip = snapshot?.watch?.bones?.hip || { x: 0, y: 0, z: 0 };
  const leftHand = snapshot?.watch?.bones?.lh || hip;
  const rightHand = snapshot?.watch?.bones?.rh || hip;
  const head = snapshot?.watch?.bones?.hd || hip;
  const leftFoot = snapshot?.watch?.bones?.lf || hip;
  const rightFoot = snapshot?.watch?.bones?.rf || hip;
  const handSpan = watchDistance(snapshot, 'lh', 'rh');
  const footSpan = watchDistance(snapshot, 'lf', 'rf');
  const leftReach = leftHand.z - hip.z;
  const rightReach = rightHand.z - hip.z;
  const dominantReach = Math.abs(rightReach) >= Math.abs(leftReach) ? rightReach : leftReach;
  const strikeSide = Math.abs(rightReach) >= Math.abs(leftReach) ? 'right' : 'left';
  const guardHeight = Math.max(leftHand.y, rightHand.y) - hip.y;
  const headGuardGap = head.y - Math.max(leftHand.y, rightHand.y);
  const reach = classifyReachLabel(dominantReach);
  const guard = guardHeight > 0.42 ? (headGuardGap < 0.12 ? 'high_guard' : 'pressing_high') : (guardHeight > 0.26 ? 'mid_guard' : 'low_guard');
  const base = footSpan > 0.42 ? 'wide_base' : (footSpan > 0.24 ? 'planted_base' : 'narrow_base');
  const semantic = nearestSemanticHint(entry.time, hints);
  const motionIn = poseDifferenceScore(prevEntry?.snapshot || null, snapshot);
  const motionOut = poseDifferenceScore(snapshot, nextEntry?.snapshot || null);
  const motionTotal = roundValue(motionIn + motionOut, 4);
  const silhouette = roundValue((handSpan * 1.6) + (footSpan * 0.8) + (Math.max(leftHand.y, rightHand.y) - hip.y), 4);
  const motion = classifyMotionLabel(Math.max(motionIn, motionOut));
  const tags = [semantic.tag, strikeSide + '_lead', reach, guard, base, motion];
  if (handSpan < 0.18) tags.push('compact_upper');
  if (handSpan > 0.42) tags.push('open_upper');
  if (Math.abs(leftFoot.y - rightFoot.y) > 0.12) tags.push('split_level');
  if (meta?.guard_break) tags.push('guard_break');
  const frame = {
    frameId: entry.id,
    time: roundValue(entry.time, 4),
    normalizedTime: roundValue(entry.time / Math.max(0.001, clipDuration || 0.001), 4),
    keyIndex: entry.keyIndex,
    keyCount: entry.keyCount,
    keyedTime: roundValue(entry.time, 4),
    semanticTag: semantic.tag,
    semanticLabel: semantic.label,
    semanticConfidence: semantic.confidence,
    description: '',
    descriptors: {
      strikeSide,
      reach,
      guard,
      base,
      motion,
      handSpan: roundValue(handSpan, 4),
      footSpan: roundValue(footSpan, 4),
      leadReach: roundValue(dominantReach, 4),
      tags,
    },
    scores: {
      motionIn: roundValue(motionIn, 4),
      motionOut: roundValue(motionOut, 4),
      motionTotal,
      silhouette,
      priority: roundValue((motionTotal * 2.2) + silhouette + (semantic.confidence * 2.4), 4),
    },
    transition: {
      prevFrameId: prevEntry?.id || '',
      nextFrameId: nextEntry?.id || '',
      prevDeltaTime: prevEntry ? roundValue(entry.time - Number(prevEntry.time || 0), 4) : 0,
      nextDeltaTime: nextEntry ? roundValue(Number(nextEntry.time || clipDuration) - entry.time, 4) : 0,
      holdLikelihood: roundValue(1 - clampValue(motionTotal / 2.4, 0, 1), 4),
    },
    snapshot,
  };
  frame.description = frameDescriptionFromDescriptors(frame);
  return frame;
}

function selectAnchorFrames(frames = [], hints = [], maxFrames = 6) {
  const picks = [];
  const minGap = Math.max(1, Math.floor((frames.length || 1) * 0.08));
  const addPick = (frame) => {
    if (!frame) return;
    if (picks.some((entry) => Math.abs(entry.keyIndex - frame.keyIndex) < minGap)) return;
    picks.push(frame);
  };
  for (const hint of hints) {
    let best = null;
    let bestDelta = Infinity;
    for (const frame of frames) {
      const delta = Math.abs(frame.time - Number(hint.time || 0));
      if (delta < bestDelta) {
        best = frame;
        bestDelta = delta;
      }
    }
    addPick(best);
  }
  for (const frame of [...frames].sort((a, b) => b.scores.priority - a.scores.priority)) {
    if (picks.length >= maxFrames) break;
    addPick(frame);
  }
  return picks
    .sort((a, b) => a.time - b.time)
    .slice(0, maxFrames)
    .map((frame) => ({
      frameId: frame.frameId,
      time: frame.time,
      keyIndex: frame.keyIndex,
      semanticTag: frame.semanticTag,
      semanticLabel: frame.semanticLabel,
      description: frame.description,
      priority: frame.scores.priority,
      tags: frame.descriptors.tags,
    }));
}

function defaultPoseIndexPayload(actor, clips = []) {
  return {
    schema: 'pose-lab-pose-index-v2',
    generatedAt: new Date().toISOString(),
    actorKey: actor?.key || '',
    actorLabel: actor?.info?.label || actor?.key || '',
    outputPath: actor?.info?.poseIndexExportPath || '',
    clipCount: clips.length,
    clips,
  };
}

const WATCH_BONES = [
  { name: 'mixamorig:Hips', label: 'hip', color: 0xff4fd8 },
  { name: 'mixamorig:LeftFoot', label: 'lf', color: 0x58ff74 },
  { name: 'mixamorig:RightFoot', label: 'rf', color: 0x43d5ff },
  { name: 'mixamorig:LeftToeBase', label: 'lt', color: 0xffdd4c },
  { name: 'mixamorig:RightToeBase', label: 'rt', color: 0xff9148 },
  { name: 'mixamorig:LeftHand', label: 'lh', color: 0xff6f95 },
  { name: 'mixamorig:RightHand', label: 'rh', color: 0x9382ff },
  { name: 'mixamorig:Head', label: 'hd', color: 0xf6e8a5 },
];

function matrixFromGodotTransform(transform) {
  const basis = transform?.basis || [];
  const position = transform?.position || [0, 0, 0];
  if (basis.length !== 9) return new THREE.Matrix4().makeTranslation(position[0] || 0, position[1] || 0, position[2] || 0);
  return new THREE.Matrix4().makeBasis(
    new THREE.Vector3(basis[0], basis[1], basis[2]),
    new THREE.Vector3(basis[3], basis[4], basis[5]),
    new THREE.Vector3(basis[6], basis[7], basis[8])
  ).setPosition(position[0] || 0, position[1] || 0, position[2] || 0);
}

class PoseActor {
  constructor(key, source, clips, profile = null) {
    this.key = key;
    this.info = profile || ACTORS[key];
    this.root = new THREE.Group();
    this.root.name = key;
    this.model = cloneSkinnedObject(source);
    this.model.name = this.info.label;
    prepareProfileVisuals(this.model, this.info);
    this.loadedModelPose = captureBonePose(this.model);
    this.modelRestPose = this.loadedModelPose;
    this.modelRestSource = 'model-loaded';
    this.currentRestPose = this.info.restPose || '';
    if (this.currentRestPose) applyGodotRestPose(this.model, this.currentRestPose);
    this.offset = new THREE.Group();
    this.offset.name = key + '-offset';
    this.manualOffset = new THREE.Group();
    this.manualOffset.name = key + '-manual-offset';
    this.basis = new THREE.Group();
    this.basis.name = key + '-animation-basis';
    this.basis.add(this.model);
    this.offset.add(this.basis);
    this.manualOffset.add(this.offset);
    this.root.add(this.manualOffset);
    this.rawClips = clips || [];
    if (this.info.rest?.clip || this.info.restClip) {
      restoreBonePose(this.model, this.loadedModelPose);
      const restClipName = applyClipFirstFramePose(this.model, this.rawClips, this.info.rest?.clip || this.info.restClip);
      if (restClipName) {
        this.modelRestPose = captureBonePose(this.model);
        this.modelRestSource = 'clip:' + restClipName;
      }
    }
    this.ownClipCount = 0;
    this.sharedClipCount = 0;
    this.sharedFallback = false;
    this.retargetFailures = 0;
    this.cleanupClipCount = 0;
    this.cleanupSerial = 0;
    this.actions = new Map();
    this.activeAction = null;
    this.recentClipKeys = [];
    this.clipSearch = '';
    this.groundBox = new THREE.Box3();
    this.groundCorrection = 0;
    this.rawGroundMinY = 0;
    this.groundedMinY = 0;
    this.poseStats = null;
    this.debugMarkers = new Map();
    this.debugLines = new Map();
    this.bones = [];
    this.boneByName = new Map();
    this.boneRest = new Map();
    this.boneEdits = new Map();
    this.boneHandles = new Map();
    this.boneLines = new Map();
    this.selectedBoneName = '';
    this.showBoneOverlay = false;
    this.legSymmetry = null;
    this.visualOverlay = null;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.cacheBones();
    this.fitToHeight(this.info.targetHeight || 1.85);
    const ownClipOptions = clipOptions(this.info, key === 'player' ? { positionPolicy: 'all' } : { positionPolicy: 'hips', lockHipRotation: true });
    this.clips = prepareGroundedClips(this.rawClips, this.model, 'own', ownClipOptions);
    this.ownClipCount = this.clips.length;
    for (const clip of this.clips) this.actions.set(clipKey(clip), this.mixer.clipAction(clip));
    this.root.position.x = this.info.labPositionX ?? this.info.position ?? 0;
    this.applyTransform(actorTransform(this.info));
    this.addHelpers();
  }

  cacheBones() {
    this.bones = collectBones(this.model);
    this.boneByName.clear();
    this.boneRest.clear();
    for (const bone of this.bones) {
      this.boneByName.set(bone.name, bone);
      this.boneRest.set(bone.name, {
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone(),
      });
    }
    if (!this.selectedBoneName && this.bones.length) {
      const hips = this.bones.find((bone) => /(^|[:_])Hips$/i.test(bone.name || ''));
      this.selectedBoneName = hips?.name || this.bones[0].name;
    }
  }

  addRetargetedClips(clips, sourceKey, channels) {
    const originPrefix = 'retarget:' + sourceKey + '->' + this.key + ':';
    this.clips = this.clips.filter((clip) => !(clip.userData?.origin || '').startsWith(originPrefix));
    for (const [key] of [...this.actions]) {
      if (key.startsWith(originPrefix)) this.actions.delete(key);
    }
    for (const clip of clips || []) {
      this.clips.push(clip);
      this.actions.set(clipKey(clip), this.mixer.clipAction(clip));
    }
    this.sharedClipCount = this.clips.filter((clip) => (clip.userData?.origin || '').startsWith('retarget:') || (clip.userData?.origin || '').startsWith('torso-hips:') || (clip.userData?.origin || '').startsWith('mapped-arms:')).length;
    this.lastRetargetChannels = channelSuffix(channels);
  }

  addCustomClips(clips, originPrefix, channels) {
    this.clips = this.clips.filter((clip) => !(clip.userData?.origin || '').startsWith(originPrefix));
    for (const [key] of [...this.actions]) {
      if (key.startsWith(originPrefix)) this.actions.delete(key);
    }
    for (const clip of clips || []) {
      this.clips.push(clip);
      this.actions.set(clipKey(clip), this.mixer.clipAction(clip));
    }
    this.sharedClipCount = this.clips.filter((clip) => (clip.userData?.origin || '').startsWith('retarget:') || (clip.userData?.origin || '').startsWith('torso-hips:') || (clip.userData?.origin || '').startsWith('mapped-arms:')).length;
    this.lastRetargetChannels = channelSuffix(channels);
  }

  addCleanupClip(clip) {
    if (!clip) return '';
    this.cleanupSerial += 1;
    const origin = 'cleanup:' + this.key + ':' + this.cleanupSerial;
    clip.userData = { ...(clip.userData || {}), origin, cleanupActor: this.key };
    this.clips.push(clip);
    const key = clipKey(clip);
    this.actions.set(key, this.mixer.clipAction(clip));
    this.cleanupClipCount = this.clips.filter((entry) => (entry.userData?.origin || '').startsWith('cleanup:')).length;
    this.play(key);
    return key;
  }

  activeClip() {
    return this.activeAction?._clip || null;
  }

  pauseActive(paused) {
    if (!this.activeAction) return;
    this.activeAction.paused = Boolean(paused);
  }

  seek(time) {
    if (!this.activeAction) return;
    const clip = this.activeAction._clip;
    const duration = Math.max(0.001, clip?.duration || 0.001);
    this.activeAction.paused = true;
    this.activeAction.time = clampValue(time, 0, duration);
    this.mixer.update(0);
    this.reapplyBoneEdits();
    this.applyGrounding();
    this.updateDebugHelpers();
    this.updateBoneOverlay();
  }

  fitToHeight(height) {
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = height / Math.max(0.001, size.y);
    this.model.scale.multiplyScalar(scale);
    this.model.updateMatrixWorld(true);
    const fitBox = new THREE.Box3().setFromObject(this.model);
    const center = new THREE.Vector3();
    fitBox.getCenter(center);
    this.model.position.x -= center.x;
    this.model.position.z -= center.z;
    this.model.position.y -= fitBox.min.y;
  }

  orbitFrame() {
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    return {
      box,
      center,
      size,
      radius: Math.max(size.x, size.y, size.z) * 0.5,
    };
  }

  attachVisualOverlay(overlayRoot, config = {}, textureSet = {}) {
    if (!overlayRoot) return null;
    if (this.visualOverlay?.root?.parent) this.visualOverlay.root.parent.remove(this.visualOverlay.root);
    if (config.hideBaseSkinnedMeshes) {
      this.model.traverse((node) => {
        if (node?.isSkinnedMesh) node.visible = false;
      });
    }
    const hideBaseNodes = new Set(config.hideBaseNodes || []);
    if (hideBaseNodes.size) {
      this.model.traverse((node) => {
        if (hideBaseNodes.has(node.name)) node.visible = false;
      });
    }
    applyVisualOverlayMaterials(overlayRoot, textureSet, config.materialOptions || {});
    const bindStats = rebindVisualOverlayToRig(overlayRoot, this.model);
    if (config.transform?.position) overlayRoot.position.fromArray(config.transform.position);
    if (config.transform?.rotationDeg) overlayRoot.rotation.set(...config.transform.rotationDeg.map((value) => THREE.MathUtils.degToRad(value)));
    if (config.transform?.scale != null) overlayRoot.scale.setScalar(Number(config.transform.scale || 1));
    overlayRoot.name = this.key + '-visual-overlay';
    this.model.add(overlayRoot);
    this.visualOverlay = { root: overlayRoot, bindStats, config };
    return this.visualOverlay;
  }

  addHelpers() {
    const color = this.info.color || (this.key === 'arcane' ? 0x82d7a2 : 0xffd36d);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.56, 0.62, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    this.root.add(ring);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(12, 12, 232, 54);
    ctx.strokeStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 232, 54);
    ctx.fillStyle = '#fff7df';
    ctx.font = '900 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!this.info.hideLabel) {
      const label = String(this.info.label || this.key).toUpperCase().slice(0, 16);
      ctx.fillText(label, 128, 40);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
      sprite.position.y = 2.45;
      sprite.scale.set(1.35, 0.42, 1);
      sprite.renderOrder = 10;
      this.root.add(sprite);
    }
    this.addDebugHelpers();
    this.addBoneOverlay();
    this.addLegSymmetryOverlay();
    this.setBoneOverlayVisible(this.showBoneOverlay);
  }

  addLegSymmetryOverlay() {
    const config = this.info.legSymmetry;
    if (!config?.sourceChain?.length) return;
    const chainBones = config.sourceChain.map((name) => this.boneByName.get(name)).filter(Boolean);
    if (chainBones.length < 3) return;
    const group = new THREE.Group();
    group.name = this.key + '-leg-symmetry';
    const jointGeometry = new THREE.SphereGeometry(Number(config.jointRadius || 0.032), 10, 8);
    const segmentGeometry = new THREE.CylinderGeometry(Number(config.segmentRadius || 0.026), Number(config.segmentRadius || 0.026), 1, 7, 1, false);
    const jointMaterial = new THREE.MeshBasicMaterial({
      color: Number(config.jointColor || 0x78d5ff),
      transparent: true,
      opacity: Number(config.opacity || 0.9),
      depthTest: false,
    });
    const segmentMaterial = new THREE.MeshBasicMaterial({
      color: Number(config.segmentColor || 0x4d90ff),
      transparent: true,
      opacity: Math.max(0.25, Number(config.opacity || 0.9) * 0.78),
      depthTest: false,
    });
    const joints = chainBones.map((bone, index) => {
      const mesh = new THREE.Mesh(jointGeometry, jointMaterial.clone());
      mesh.name = this.key + '-leg-symmetry-joint-' + index;
      mesh.renderOrder = 24;
      group.add(mesh);
      return mesh;
    });
    const segments = [];
    for (let i = 0; i < chainBones.length - 1; i += 1) {
      const mesh = new THREE.Mesh(segmentGeometry, segmentMaterial.clone());
      mesh.name = this.key + '-leg-symmetry-segment-' + i;
      mesh.renderOrder = 23;
      group.add(mesh);
      segments.push(mesh);
    }
    this.root.add(group);
    this.legSymmetry = {
      config,
      bones: chainBones,
      group,
      joints,
      segments,
      upAxis: new THREE.Vector3(0, 1, 0),
    };
    this.updateLegSymmetryOverlay();
  }

  updateLegSymmetryOverlay() {
    const overlay = this.legSymmetry;
    if (!overlay) return;
    this.root.updateMatrixWorld(true);
    const points = [];
    for (const bone of overlay.bones) {
      const world = bone.getWorldPosition(new THREE.Vector3());
      const mirrored = mirroredLocalPoint(this.root, world, overlay.config.mirrorAxis || 'x', new THREE.Vector3());
      points.push(mirrored);
    }
    for (let i = 0; i < overlay.joints.length; i += 1) overlay.joints[i].position.copy(points[i]);
    for (let i = 0; i < overlay.segments.length; i += 1) {
      const start = points[i];
      const end = points[i + 1];
      const delta = end.clone().sub(start);
      const length = Math.max(0.0001, delta.length());
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const segment = overlay.segments[i];
      segment.position.copy(mid);
      segment.quaternion.setFromUnitVectors(overlay.upAxis, delta.normalize());
      segment.scale.set(1, length, 1);
    }
  }

  addBoneOverlay() {
    const handleGeometry = new THREE.SphereGeometry(0.04, 10, 8);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xf4ddac, depthTest: false, transparent: true, opacity: 0.65 });
    for (const bone of this.bones) {
      const handle = new THREE.Mesh(
        handleGeometry,
        new THREE.MeshBasicMaterial({ color: 0x7fdcff, depthTest: false, transparent: true, opacity: 0.78 })
      );
      handle.name = this.key + '-bone-handle-' + bone.name;
      handle.userData.actorKey = this.key;
      handle.userData.boneName = bone.name;
      handle.renderOrder = 30;
      this.root.add(handle);
      this.boneHandles.set(bone.name, handle);

      if (bone.parent?.isBone) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          lineMaterial.clone()
        );
        line.name = this.key + '-bone-line-' + bone.name;
        line.userData.actorKey = this.key;
        line.userData.boneName = bone.name;
        line.renderOrder = 29;
        this.root.add(line);
        this.boneLines.set(bone.name, line);
      }
    }
  }

  setBoneOverlayVisible(visible) {
    this.showBoneOverlay = visible;
    for (const handle of this.boneHandles.values()) handle.visible = visible;
    for (const line of this.boneLines.values()) line.visible = visible;
  }

  selectBone(name) {
    if (!this.boneByName.has(name)) return false;
    this.selectedBoneName = name;
    this.refreshBoneOverlayMaterials();
    return true;
  }

  refreshBoneOverlayMaterials() {
    for (const [name, handle] of this.boneHandles) {
      handle.material.color.set(name === this.selectedBoneName ? 0xffdc35 : 0x7fdcff);
      handle.material.opacity = name === this.selectedBoneName ? 1.0 : 0.78;
      const scale = name === this.selectedBoneName ? 1.55 : 1.0;
      handle.scale.setScalar(scale);
    }
    for (const [name, line] of this.boneLines) {
      line.material.color.set(name === this.selectedBoneName ? 0xffdc35 : 0xf4ddac);
      line.material.opacity = name === this.selectedBoneName ? 1.0 : 0.65;
    }
  }

  currentBoneEdit(name = this.selectedBoneName) {
    return this.boneEdits.get(name) || {
      posX: 0,
      posY: 0,
      posZ: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      scale: 100,
      useTranslate: true,
      useRotate: true,
      useScale: false,
    };
  }

  applyBoneEdit(name, edit) {
    const bone = this.boneByName.get(name);
    const rest = this.boneRest.get(name);
    if (!bone || !rest) return;
    const next = {
      ...this.currentBoneEdit(name),
      ...edit,
    };
    this.boneEdits.set(name, next);
    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);
    if (next.useTranslate) {
      bone.position.x += Number(next.posX || 0) / 100;
      bone.position.y += Number(next.posY || 0) / 100;
      bone.position.z += Number(next.posZ || 0) / 100;
    }
    if (next.useRotate) {
      const delta = new THREE.Euler(degToRad(next.rotX || 0), degToRad(next.rotY || 0), degToRad(next.rotZ || 0), bone.rotation.order || 'XYZ');
      bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(delta));
    }
    if (next.useScale) {
      const s = Number(next.scale || 100) / 100;
      bone.scale.multiplyScalar(Math.max(0.01, s));
    }
    bone.updateMatrixWorld(true);
  }

  reapplyBoneEdits() {
    for (const [name, edit] of this.boneEdits) this.applyBoneEdit(name, edit);
  }

  resetBoneEdit(name = this.selectedBoneName) {
    const bone = this.boneByName.get(name);
    const rest = this.boneRest.get(name);
    if (!bone || !rest) return;
    this.boneEdits.delete(name);
    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);
    bone.updateMatrixWorld(true);
  }

  resetAllBoneEdits() {
    for (const name of [...this.boneEdits.keys()]) this.resetBoneEdit(name);
    this.boneEdits.clear();
  }

  selectedBoneStatus() {
    const bone = this.boneByName.get(this.selectedBoneName);
    const rest = this.boneRest.get(this.selectedBoneName);
    if (!bone || !rest) return 'select a bone';
    const localPos = vectorToCm(bone.position.clone().sub(rest.position));
    const currentEuler = new THREE.Euler().setFromQuaternion(rest.quaternion.clone().invert().multiply(bone.quaternion), bone.rotation.order || 'XYZ');
    const localRot = eulerToDeg(currentEuler);
    const edit = this.currentBoneEdit();
    return [
      shortBoneName(bone.name) + '  edits=' + this.boneEdits.size,
      'raw=' + bone.name,
      'delta cm=(' + localPos.x + ',' + localPos.y + ',' + localPos.z + ')',
      'delta deg=(' + localRot.x + ',' + localRot.y + ',' + localRot.z + ')',
      'channels=' + channelSuffix({ translate: edit.useTranslate, rotate: edit.useRotate, scale: edit.useScale }) + ' scale=' + edit.scale + '%',
    ].join('\n');
  }

  addDebugHelpers() {
    const markerGeometry = new THREE.SphereGeometry(0.055, 12, 8);
    for (const spec of WATCH_BONES) {
      const marker = new THREE.Mesh(
        markerGeometry,
        new THREE.MeshBasicMaterial({ color: spec.color, depthTest: false, transparent: true, opacity: 0.95 })
      );
      marker.name = this.key + '-' + spec.label + '-marker';
      marker.renderOrder = 20;
      this.root.add(marker);
      this.debugMarkers.set(spec.name, marker);

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: spec.color, depthTest: false, transparent: true, opacity: 0.85 })
      );
      line.name = this.key + '-' + spec.label + '-drop-line';
      line.renderOrder = 19;
      this.root.add(line);
      this.debugLines.set(spec.name, line);
    }
  }

  boneWorldPosition(name) {
    const bone = findNamedBone(this.model, name);
    if (!bone) return null;
    return bone.getWorldPosition(new THREE.Vector3());
  }

  boneQuaternion(name) {
    const bone = findNamedBone(this.model, name);
    return bone ? bone.quaternion : null;
  }

  collectPoseStats() {
    const bones = {};
    for (const spec of WATCH_BONES) {
      const world = this.boneWorldPosition(spec.name);
      if (world) bones[spec.label] = world;
    }
    const lf = bones.lf?.y;
    const rf = bones.rf?.y;
    const lt = bones.lt?.y;
    const rt = bones.rt?.y;
    this.poseStats = {
      bones,
      footDelta: Number.isFinite(lf) && Number.isFinite(rf) ? Math.abs(lf - rf) : NaN,
      toeDelta: Number.isFinite(lt) && Number.isFinite(rt) ? Math.abs(lt - rt) : NaN,
    };
    return this.poseStats;
  }

  updateDebugHelpers() {
    const stats = this.poseStats || this.collectPoseStats();
    for (const spec of WATCH_BONES) {
      const world = stats.bones[spec.label];
      const marker = this.debugMarkers.get(spec.name);
      const line = this.debugLines.get(spec.name);
      if (!world || !marker || !line) {
        if (marker) marker.visible = false;
        if (line) line.visible = false;
        continue;
      }
      marker.visible = true;
      line.visible = true;
      const local = this.root.worldToLocal(world.clone());
      const floor = this.root.worldToLocal(new THREE.Vector3(world.x, 0, world.z));
      marker.position.copy(local);
      const attr = line.geometry.attributes.position;
      attr.setXYZ(0, local.x, local.y, local.z);
      attr.setXYZ(1, floor.x, floor.y, floor.z);
      attr.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
  }

  updateBoneOverlay() {
    this.refreshBoneOverlayMaterials();
    for (const [name, bone] of this.boneByName) {
      const handle = this.boneHandles.get(name);
      if (!handle) continue;
      handle.visible = this.showBoneOverlay;
      if (!this.showBoneOverlay) continue;
      const world = bone.getWorldPosition(new THREE.Vector3());
      handle.position.copy(this.root.worldToLocal(world.clone()));
    }
    for (const [name, line] of this.boneLines) {
      line.visible = this.showBoneOverlay;
      if (!this.showBoneOverlay) continue;
      const bone = this.boneByName.get(name);
      if (!bone?.parent?.isBone) {
        line.visible = false;
        continue;
      }
      const parent = this.root.worldToLocal(bone.parent.getWorldPosition(new THREE.Vector3()));
      const child = this.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
      const attr = line.geometry.attributes.position;
      attr.setXYZ(0, parent.x, parent.y, parent.z);
      attr.setXYZ(1, child.x, child.y, child.z);
      attr.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
  }

  applyTransform(values) {
    this.values = { ...values };
    this.manualOffset.position.set(Number(values.posX || 0) / 100, Number(values.posY || 0) / 100, Number(values.posZ || 0) / 100);
    this.offset.rotation.set(degToRad(values.x), degToRad(values.y), degToRad(values.z));
    this.basis.rotation.set(degToRad(values.basisX || 0), degToRad(values.basisY || 0), degToRad(values.basisZ || 0));
    const s = Number(values.scale) / 100;
    this.offset.scale.setScalar(s);
  }

  rememberClip(name) {
    if (!name) return;
    this.recentClipKeys = [name, ...this.recentClipKeys.filter((key) => key !== name)].slice(0, 5);
  }

  play(name) {
    const next = this.actions.get(name);
    if (!next) return;
    if (!this.activeAction) {
      restoreBonePose(this.model, this.modelRestPose);
      if (this.currentRestPose) applyGodotRestPose(this.model, this.currentRestPose);
    }
    if (this.activeAction && this.activeAction !== next) this.activeAction.fadeOut(0.1);
    next.enabled = true;
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.fadeIn(0.1).play();
    next.paused = false;
    this.activeAction = next;
    this.rememberClip(name);
  }

  setRestPose(poseName) {
    if (this.mixer) this.mixer.stopAllAction();
    for (const action of this.actions.values()) action.reset();
    restoreBonePose(this.model, this.modelRestPose);
    if (poseName) applyGodotRestPose(this.model, poseName);
    this.currentRestPose = poseName || '';
    this.activeAction = null;
    this.boneEdits.clear();
    this.cacheBones();
    this.applyGrounding();
  }

  stop() {
    this.setRestPose(this.currentRestPose);
  }

  applyGrounding() {
    this.offset.position.y = 0;
    this.root.updateMatrixWorld(true);
    this.groundBox.setFromObject(this.model);
    if (!Number.isFinite(this.groundBox.min.y)) return;
    this.rawGroundMinY = this.groundBox.min.y;
    const correction = -this.groundBox.min.y;
    if (Math.abs(correction) < 0.0005 || Math.abs(correction) > 4) {
      this.groundCorrection = 0;
      this.groundedMinY = this.groundBox.min.y;
      this.collectPoseStats();
      return;
    }
    this.offset.position.y = correction;
    this.groundCorrection = correction;
    this.root.updateMatrixWorld(true);
    this.groundBox.setFromObject(this.model);
    this.groundedMinY = this.groundBox.min.y;
    this.collectPoseStats();
  }

  update(dt) {
    this.mixer.update(dt);
    this.reapplyBoneEdits();
    this.applyGrounding();
    this.updateLegSymmetryOverlay();
    this.updateDebugHelpers();
    this.updateBoneOverlay();
  }

  restPoseLabel() {
    return this.currentRestPose ? 'godot:' + this.currentRestPose : this.modelRestSource;
  }

  modelRestTransform(name) {
    const bone = findNamedBone(this.model, name);
    return bone ? this.modelRestPose.get(bone.uuid) : null;
  }

  diagnosticLine() {
    const stats = this.poseStats || this.collectPoseStats();
    const b = stats.bones;
    const clip = this.activeAction?._clip;
    const origin = clip?.userData?.origin || 'none';
    const hipQ = this.boneQuaternion('mixamorig:Hips');
    const spineQ = this.boneQuaternion('mixamorig:Spine');
    const modelHipQ = this.modelRestTransform('mixamorig:Hips')?.quaternion;
    return [
      'lab=' + LAB_BUILD + ' rest=' + this.restPoseLabel(),
      this.info.label + '  clip=' + (clip?.name || 'none'),
      'origin=' + origin + ' mode=' + (clip?.userData?.mode || 'none') + ' qFlips=' + (clip?.userData?.quaternionFlips || 0),
      'hipQ=' + fmtQuat(hipQ) + ' modelHipQ=' + fmtQuat(modelHipQ),
      'spineQ=' + fmtQuat(spineQ),
      'rawMinY=' + fmt(this.rawGroundMinY) + ' yFix=' + fmt(this.groundCorrection) + ' minY=' + fmt(this.groundedMinY),
      'hipY=' + fmt(b.hip?.y) + ' lfY=' + fmt(b.lf?.y) + ' rfY=' + fmt(b.rf?.y),
      'ltY=' + fmt(b.lt?.y) + ' rtY=' + fmt(b.rt?.y) + ' footDelta=' + fmt(stats.footDelta) + ' toeDelta=' + fmt(stats.toeDelta),
    ].join('\n');
  }

  readout() {
    const meshes = [];
    const bones = [];
    this.model.traverse((node) => {
      if (node.isMesh || node.isSkinnedMesh) meshes.push(node.name || node.type);
      if (node.isBone) bones.push(node.name || 'Bone');
    });
    const extraConfigured = Number(this.info.extraClipUrls?.length || 0);
    const extraLoaded = this.clips.filter((clip) => String(clip.userData?.origin || '').startsWith('own-extra:' + this.key + ':')).length;
    const startupResolved = this.info.startupClip ? this.clips.some((clip) => clipMatchesPreference(clip, this.info.startupClip)) : false;
    return [
      this.info.label,
      'clips=' + this.clips.length + ' own=' + this.ownClipCount + ' shared=' + this.sharedClipCount + ' cleanup=' + this.cleanupClipCount,
      'extraConfigured=' + extraConfigured + ' extraLoaded=' + extraLoaded + ' startupResolved=' + (this.info.startupClip ? startupResolved : 'n/a'),
      'lastRetargetChannels=' + (this.lastRetargetChannels || 'none'),
      'mode=' + (this.activeAction?._clip?.userData?.mode || 'none') + ' qFlips=' + (this.activeAction?._clip?.userData?.quaternionFlips || 0) + ' fallback=' + this.sharedFallback + ' retargetFailures=' + this.retargetFailures,
      'meshes=' + meshes.length,
      'bones=' + bones.length,
      'active=' + (this.activeAction?._clip?.name || 'none'),
      'restPose=' + this.restPoseLabel(),
      'profileHeight=' + (this.info.targetHeight || 'n/a') + ' ownClipOptions=' + JSON.stringify(this.info.ownClipOptions || {}),
      'profileTransform=' + JSON.stringify(actorTransform(this.info)),
      'troubleshooting=' + (this.info.troubleshooting || []).join(' | '),
      'selectedBone=' + (this.selectedBoneName || 'none') + ' boneEdits=' + this.boneEdits.size,
      this.selectedBoneStatus(),
      'rawMinY=' + fmt(this.rawGroundMinY) + ' groundCorrection=' + fmt(this.groundCorrection) + ' groundedMinY=' + fmt(this.groundedMinY),
      this.diagnosticLine(),
      'pos=(' + (this.values.posX || 0) + ',' + (this.values.posY || 0) + ',' + (this.values.posZ || 0) + ') rot=(' + this.values.x + ',' + this.values.y + ',' + this.values.z + ') basis=(' + (this.values.basisX || 0) + ',' + (this.values.basisY || 0) + ',' + (this.values.basisZ || 0) + ') scale=' + this.values.scale,
      'copy: ' + this.key + ' posX=' + (this.values.posX || 0) + ' posY=' + (this.values.posY || 0) + ' posZ=' + (this.values.posZ || 0) + ' rotationX=' + this.values.x + ' rotationY=' + this.values.y + ' rotationZ=' + this.values.z + ' basisX=' + (this.values.basisX || 0) + ' basisY=' + (this.values.basisY || 0) + ' basisZ=' + (this.values.basisZ || 0) + ' scale=' + this.values.scale,
    ].join('\n');
  }
}

class PoseLab {
  constructor() {
    this.visualQa = visualQaConfig();
    this.visualQaState = { rendered: false, captured: 0, lastCaptureAt: 0, inFlight: false };
    this.renderer = new THREE.WebGLRenderer({ canvas: UI.canvas, antialias: true, preserveDrawingBuffer: this.visualQa.enabled });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1014);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.orbitCameraState = { fov: 45, near: 0.1, position: new THREE.Vector3(0, 2.2, 6.2), target: new THREE.Vector3(0, 1.05, 0) };
    this.camera.position.set(0, 2.2, 6.2);
    this.controls = new OrbitControls(this.camera, UI.canvas);
    if (this.viewMode === 'orbit') this.controls.target.set(0, 1.05, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 10.0;
    this.loader = new GLTFLoader();
    this.fbxLoader = new FBXLoader();
    this.localObjectUrls = [];
    this.localActorKeys = new Set();
    this.localActorSerial = 0;
    this.loadingActors = new Map();
    this.actorLoadErrors = new Map();
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerDown = null;
    this.actors = new Map();
    this.cleanupLastClipKey = '';
    this.cleanupScrubbing = false;
    this.cleanupTimelineDrag = null;
    this.mergeLastPairKey = '';
    this.mergeLastSuggestedName = '';
    this.mergeTimelineDrag = null;
    this.poseIndexStore = new Map();
    this.poseIndexStatusText = 'waiting';
    this.attackMetadata = new Map();
    this.selected = 'player';
    this.viewMode = 'orbit';
    this.activePanel = 'clips';
    this.isRestoringState = false;
    this.stateSaveTimer = null;
    this.savedState = this.visualQa?.enabled ? {} : this.readSavedState();
  }

  async start() {
    this.setupScene();
    this.setupUi();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
    await this.loadActors();
    await this.loadAttackMetadata();
    this.renderActorTabs();
    this.isRestoringState = true;
    this.selectStartupActor();
    this.isRestoringState = false;
    this.saveState();
  }

  readSavedState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (_err) {
      return {};
    }
  }

  actorSearchState() {
    const searches = {};
    for (const [key, actor] of this.actors) {
      const value = String(actor.clipSearch || '').trim();
      if (value) searches[key] = value;
    }
    return searches;
  }

  captureViewAngle() {
    return {
      mode: this.viewMode,
      orbit: {
        position: this.camera.position.toArray(),
        target: this.controls.target.toArray(),
        fov: this.camera.fov,
        near: this.camera.near,
      },
    };
  }

  applySavedViewAngle(viewAngle) {
    const orbit = viewAngle?.orbit || viewAngle;
    if (this.viewMode !== 'orbit' || !orbit) return false;
    if (!Array.isArray(orbit.position) || !Array.isArray(orbit.target)) return false;
    this.camera.position.fromArray(orbit.position);
    this.controls.target.fromArray(orbit.target);
    if (Number.isFinite(Number(orbit.fov))) this.camera.fov = Number(orbit.fov);
    if (Number.isFinite(Number(orbit.near))) this.camera.near = Number(orbit.near);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    return true;
  }

  savedPanelForActor(key, fallback = 'clips') {
    if (this.savedState?.actorKey !== key) return fallback;
    const panel = this.savedState?.activePanel || this.savedState?.panel || '';
    if (panel === 'none' || UI.panels[panel]) return panel;
    return fallback;
  }

  applySavedActorState(actor) {
    if (!actor || this.visualQa?.enabled) return;
    const searches = this.savedState?.clipSearches || {};
    if (Object.prototype.hasOwnProperty.call(searches, actor.key)) actor.clipSearch = String(searches[actor.key] || '');
    else if (this.savedState?.actorKey === actor.key && this.savedState?.clipSearch) actor.clipSearch = String(this.savedState.clipSearch || '');
  }

  queueStateSave() {
    if (this.isRestoringState) return;
    if (this.stateSaveTimer) window.clearTimeout(this.stateSaveTimer);
    this.stateSaveTimer = window.setTimeout(() => {
      this.stateSaveTimer = null;
      this.saveState();
    }, 120);
  }

  saveState() {
    if (this.isRestoringState || this.visualQa?.enabled) return;
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeAction?._clip || null;
    const state = {
      schema: 'pose-lab-ui-state-v2',
      actorKey: this.selected,
      actorLabel: actor?.info?.label || this.selected,
      activePanel: this.activePanel || 'clips',
      viewMode: this.viewMode,
      viewAngle: this.captureViewAngle(),
      clipKey: clip ? clipKey(clip) : '',
      clipName: clip?.name || '',
      origin: clip?.userData?.origin || '',
      sourceName: clip?.userData?.sourceName || '',
      clipSearch: actor?.clipSearch || '',
      clipSearches: this.actorSearchState(),
      savedAt: Date.now(),
    };
    this.savedState = state;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_err) {}
  }

  findSavedClip(actor, state = {}) {
    if (!actor || !state) return null;
    if (state.clipKey && actor.actions.has(state.clipKey)) return actor.actions.get(state.clipKey)?._clip || actor.clips.find((clip) => clipKey(clip) === state.clipKey) || null;
    return actor.clips.find((clip) => {
      const origin = clip.userData?.origin || 'own';
      if (state.origin && origin !== state.origin) return false;
      if (state.sourceName && clip.userData?.sourceName === state.sourceName) return true;
      return state.clipName && clip.name === state.clipName;
    }) || null;
  }


  findClipByName(actor, name) {
    const wanted = String(name || '').trim().toLowerCase();
    if (!actor || !wanted) return null;
    const entries = actor.clips.map((clip) => ({
      clip,
      labels: [clip.name, clipLabel(clip), clip.userData?.sourceName, clip.userData?.origin].filter(Boolean).map((value) => String(value).trim().toLowerCase()),
    }));
    return entries.find((entry) => entry.labels[0] === wanted)?.clip
      || entries.find((entry) => entry.labels[1] === wanted)?.clip
      || entries.find((entry) => entry.labels.some((label) => label === wanted))?.clip
      || entries.find((entry) => entry.labels.some((label) => label.includes(wanted)))?.clip
      || null;
  }

  findStartupClip(actor) {
    const pref = actor?.info?.startupClip;
    if (!actor || !pref) return null;
    return actor.clips.find((candidate) => clipMatchesPreference(candidate, pref)) || null;
  }

  findFirstPlayableClip(actor) {
    if (!actor) return null;
    return actor.clips.find((clip) => clip.tracks?.length && !String(clip.userData?.origin || '').startsWith('torso-hips:')) || actor.clips.find((clip) => clip.tracks?.length) || actor.clips[0] || null;
  }

  actorSelectionStatus(actor, clip) {
    if (!actor) return 'selected missing actor';
    const extraConfigured = Number(actor.info?.extraClipUrls?.length || 0);
    const extraLoaded = actor.clips.filter((entry) => String(entry.userData?.origin || '').startsWith('own-extra:' + actor.key + ':')).length;
    const startupResolved = actor.info?.startupClip ? actor.clips.some((entry) => clipMatchesPreference(entry, actor.info.startupClip)) : false;
    return 'selected ' + actor.info.label + (clip ? ' clip=' + clipLabel(clip) : '') + ' extra=' + extraLoaded + '/' + extraConfigured + ' startup=' + (actor.info?.startupClip ? (startupResolved ? 'ok' : 'missing') : 'none');
  }

  activateActor(key, options = {}) {
    const actor = this.actors.get(key);
    if (!actor) {
      setStatus('actor not loaded: ' + key);
      return;
    }
    this.applySavedActorState(actor);
    this.select(key);
    if (options.viewMode) this.setViewMode(options.viewMode);
    if (this.viewMode === 'firstPerson' && !actor.info?.firstPersonCamera) this.setViewMode('orbit');
    const savedClip = options.preferSaved && this.savedState?.actorKey === key ? this.findSavedClip(actor, this.savedState) : null;
    const requestedClip = options.clipName ? this.findClipByName(actor, options.clipName) : null;
    const clip = requestedClip || savedClip || this.findStartupClip(actor) || actor.activeClip() || this.findFirstPlayableClip(actor);
    if (clip) actor.play(clipKey(clip));
    this.renderClipButtons();
    const fallbackPanel = actor.info?.startupPanel || (UI.panels.cleanup?.classList.contains('open') ? 'cleanup' : 'clips');
    this.setPanel(options.restoreSavedUi ? this.savedPanelForActor(key, fallbackPanel) : fallbackPanel);
    if (options.restoreSavedUi && this.savedState?.actorKey === key) this.applySavedViewAngle(this.savedState.viewAngle);
    this.updateCleanupUi(clip ? 'loaded ' + actor.info.label + ' | ' + clipLabel(clip) : 'loaded ' + actor.info.label);
    this.updateReadout();
    this.saveState();
    setStatus(this.actorSelectionStatus(actor, clip));
  }

  selectStartupActor() {
    const startupEntry = Object.entries(ACTORS).find(([, info]) => info.startupClip);
    const visualActorKey = this.visualQa?.actor && this.actors.has(this.visualQa.actor) ? this.visualQa.actor : '';
    const savedActorKey = this.savedState?.actorKey;
    const actorKey = visualActorKey || (savedActorKey && this.actors.has(savedActorKey) ? savedActorKey : (startupEntry?.[0] || 'player'));
    const actor = this.actors.get(actorKey);
    const nextViewMode = this.savedState?.actorKey === actorKey ? (this.savedState?.viewAngle?.mode || this.savedState?.viewMode || actor?.info?.startupViewMode) : actor?.info?.startupViewMode;
    const preferSaved = this.savedState?.actorKey === actorKey ? true : preferSavedClipForActor(actor?.info);
    this.activateActor(actorKey, { preferSaved: visualActorKey ? false : preferSaved, restoreSavedUi: visualActorKey ? false : this.savedState?.actorKey === actorKey, viewMode: nextViewMode, clipName: this.visualQa?.clip || '' });
  }

  setupScene() {
    this.scene.add(new THREE.HemisphereLight(0xd4e8ff, 0x372719, 1.8));
    const key = new THREE.DirectionalLight(0xffefd2, 2.4);
    key.position.set(3.6, 6.5, 4.0);
    key.castShadow = true;
    this.scene.add(key);
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.12, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x4b5358, roughness: 0.7, metalness: 0.35 })
    );
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(7.2, 12, 0xd6a642, 0x42505a);
    grid.position.y = 0.005;
    this.scene.add(grid);
    const axes = new THREE.AxesHelper(1.4);
    axes.position.set(-3.2, 0.03, 1.55);
    this.scene.add(axes);
  }

  setupUi() {
    this.renderActorTabs();
    for (const button of UI.viewButtons) button.addEventListener('click', () => this.setViewMode(button.dataset.viewMode || 'orbit'));
    this.controls.addEventListener('change', () => {
      if (this.viewMode === 'orbit') this.queueStateSave();
    });
    UI.clipSearch?.addEventListener('input', () => {
      const actor = this.actors.get(this.selected);
      if (actor) actor.clipSearch = UI.clipSearch.value;
      this.renderClipButtons();
      this.saveState();
    });
    UI.cleanupScrub?.addEventListener('input', () => {
      this.cleanupScrubbing = true;
      this.scrubCleanupClip(Number(UI.cleanupScrub.value));
    });
    UI.cleanupScrub?.addEventListener('change', () => { this.cleanupScrubbing = false; });
    UI.cleanupTimelineCanvas?.addEventListener('pointerdown', (event) => this.beginCleanupTimelineDrag(event));
    UI.cleanupMergeTimelineCanvas?.addEventListener('pointerdown', (event) => this.beginMergeTimelineDrag(event));
    UI.cleanupPlayPause?.addEventListener('click', () => this.toggleCleanupPlayback());
    UI.cleanupSetStart?.addEventListener('click', () => this.setCleanupBoundary('start'));
    UI.cleanupSetEnd?.addEventListener('click', () => this.setCleanupBoundary('end'));
    for (const input of [UI.cleanupStart, UI.cleanupEnd, UI.cleanupBlendStart, UI.cleanupBlendEnd, UI.cleanupSmoothPasses, UI.cleanupFps, UI.cleanupUseTranslate, UI.cleanupUseRotate, UI.cleanupUseScale]) {
      input?.addEventListener('change', () => this.updateCleanupUi());
    }
    for (const input of [UI.cleanupMergeSource, UI.cleanupMergeTarget, UI.cleanupMergeStart, UI.cleanupMergeEnd, UI.cleanupMergeName, UI.cleanupMergeTrimAfterBlend]) {
      input?.addEventListener('change', () => this.updateMergeUi());
      input?.addEventListener('input', () => this.updateMergeUi());
    }
    UI.cleanupEditMode?.addEventListener('change', () => this.updateCleanupUi());
    UI.cleanupApplyEdit?.addEventListener('click', () => this.applyCleanupEditorMode());
    UI.cleanupUseActiveAsMergeSource?.addEventListener('click', () => this.useActiveClipAsMergeSource());
    UI.cleanupBuildMerge?.addEventListener('click', () => this.applyCleanupMerge());
    UI.cleanupSaveDraft?.addEventListener('click', () => this.saveActiveCleanupDraft('manual'));
    UI.cleanupExportClip?.addEventListener('click', () => this.exportActiveCleanupClip());
    UI.poseIndexClip?.addEventListener('click', () => this.indexActiveClipPoses());
    UI.poseIndexActor?.addEventListener('click', () => this.indexSelectedActorClips());
    UI.poseExportIndex?.addEventListener('click', () => this.exportSelectedPoseIndex());
    UI.cleanupClearDrafts?.addEventListener('click', () => this.clearCleanupDraftsForSelectedActor());
    UI.cleanupSmoothStrength?.addEventListener('input', () => this.updateCleanupUi());
    UI.cleanupDeleteRange?.addEventListener('click', () => this.applyCleanupOperation('delete'));
    UI.cleanupTrimRange?.addEventListener('click', () => this.applyCleanupOperation('trim'));
    UI.cleanupSmoothRange?.addEventListener('click', () => this.applyCleanupOperation('smooth'));
    UI.cleanupSmoothAll?.addEventListener('click', () => this.applyCleanupOperation('smoothAll'));
    UI.cleanupStabilize?.addEventListener('click', () => this.applyCleanupOperation('stabilize'));
    UI.cleanupResample?.addEventListener('click', () => this.applyCleanupOperation('resample'));
    UI.cleanupReset?.addEventListener('click', () => this.restoreCleanupSource());
    UI.cleanupStop?.addEventListener('click', () => {
      const actor = this.actors.get(this.selected);
      if (!actor) return;
      actor.stop();
      this.cleanupLastClipKey = '';
      this.renderClipButtons();
      this.updateCleanupUi('stopped');
      this.updateReadout();
    });
    UI.openAssetFilesButton?.addEventListener('click', () => UI.openAssetFiles?.click());
    UI.openAssetFiles?.addEventListener('change', () => {
      const files = [...(UI.openAssetFiles.files || [])];
      UI.openAssetFiles.value = '';
      this.openLocalAssetFiles(files);
    });
    UI.clearOpenedAssets?.addEventListener('click', () => this.clearOpenedActors());
    for (const button of UI.panelButtons) button.addEventListener('click', () => {
      const panel = button.dataset.panel;
      const isOpen = button.classList.contains('active') && panel !== 'none';
      this.setPanel(isOpen ? 'none' : panel);
    });
    for (const input of [UI.posX, UI.posY, UI.posZ, UI.rotX, UI.rotY, UI.rotZ, UI.scale, UI.basisX, UI.basisY, UI.basisZ]) input.addEventListener('input', () => this.applyUiTransform());
    for (const input of [UI.bonePosX, UI.bonePosY, UI.bonePosZ, UI.boneRotX, UI.boneRotY, UI.boneRotZ, UI.boneScale, UI.boneUseTranslate, UI.boneUseRotate, UI.boneUseScale]) {
      input.addEventListener('input', () => this.applyBoneUiEdit());
      input.addEventListener('change', () => this.applyBoneUiEdit());
    }
    UI.boneSelect.addEventListener('change', () => this.selectBone(UI.boneSelect.value));
    UI.showBoneOverlay.addEventListener('change', () => {
      const actor = this.actors.get(this.selected);
      if (!actor) return;
      actor.setBoneOverlayVisible(UI.showBoneOverlay.checked);
      this.updateBoneUi();
    });
    UI.resetBoneEdit.addEventListener('click', () => {
      const actor = this.actors.get(this.selected);
      if (!actor) return;
      actor.resetBoneEdit();
      this.setBoneUiValues(actor.currentBoneEdit());
      this.updateBoneUi();
    });
    UI.resetAllBoneEdits.addEventListener('click', () => {
      const actor = this.actors.get(this.selected);
      if (!actor) return;
      actor.resetAllBoneEdits();
      this.setBoneUiValues(actor.currentBoneEdit());
      this.updateBoneUi();
    });
    UI.canvas.addEventListener('pointerdown', (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });
    UI.canvas.addEventListener('pointerup', (event) => this.pickBoneHandle(event));
    UI.buildRetarget.addEventListener('click', () => this.buildRetarget());
    UI.swapRetarget.addEventListener('click', () => {
      const source = UI.sourceActor.value;
      UI.sourceActor.value = UI.targetActor.value;
      UI.targetActor.value = source;
      this.updateRetargetStatus('swapped source/target');
    });
    for (const input of [UI.sourceActor, UI.targetActor, UI.useTranslate, UI.useRotate, UI.useScale, UI.positionPolicy, UI.torsoToHips]) {
      input.addEventListener('change', () => this.updateRetargetStatus());
    }
    UI.resetTransform.addEventListener('click', () => {
      const info = ACTORS[this.selected];
      const transform = actorTransform(info);
      this.setUiValues(transform.posX, transform.posY, transform.posZ, transform.x, transform.y, transform.z, transform.scale, transform.basisX, transform.basisY, transform.basisZ);
      this.applyUiTransform();
    });
    UI.modelRest.addEventListener('click', () => {
      const actor = this.actors.get(this.selected);
      if (!actor) return;
      actor.setRestPose('');
      this.renderClipButtons();
      this.updateReadout();
      setStatus('model bind rest: ' + actor.info.label);
    });
    UI.godotRest.addEventListener('click', () => {
      const actor = this.actors.get(this.selected);
      if (!actor) return;
      actor.setRestPose(actor.info.godotRestPose || '');
      this.renderClipButtons();
      this.updateReadout();
      setStatus('godot scene rest: ' + actor.info.label);
    });
    UI.titanZero.addEventListener('click', () => {
      this.select('arcane');
      this.setUiValues(UI.posX.value, UI.posY.value, UI.posZ.value, 0, 0, 0, 100, UI.basisX.value, UI.basisY.value, UI.basisZ.value);
      this.applyUiTransform();
    });
    UI.godotTitan.addEventListener('click', () => {
      this.select('arcane');
      this.setUiValues(UI.posX.value, UI.posY.value, UI.posZ.value, -90, 0, 0, 100, UI.basisX.value, UI.basisY.value, UI.basisZ.value);
      this.applyUiTransform();
    });
    UI.titanPlus.addEventListener('click', () => {
      this.select('arcane');
      this.setUiValues(UI.posX.value, UI.posY.value, UI.posZ.value, 90, 0, 0, 100, UI.basisX.value, UI.basisY.value, UI.basisZ.value);
      this.applyUiTransform();
    });
    UI.basisXNeg.addEventListener('click', () => {
      this.setUiValues(UI.posX.value, UI.posY.value, UI.posZ.value, UI.rotX.value, UI.rotY.value, UI.rotZ.value, UI.scale.value, -90, 0, 0);
      this.applyUiTransform();
    });
    UI.basisXPos.addEventListener('click', () => {
      this.setUiValues(UI.posX.value, UI.posY.value, UI.posZ.value, UI.rotX.value, UI.rotY.value, UI.rotZ.value, UI.scale.value, 90, 0, 0);
      this.applyUiTransform();
    });
    UI.basisReset.addEventListener('click', () => {
      this.setUiValues(UI.posX.value, UI.posY.value, UI.posZ.value, UI.rotX.value, UI.rotY.value, UI.rotZ.value, UI.scale.value, 0, 0, 0);
      this.applyUiTransform();
    });
  }

  async loadAsset(input) {
    const isFile = typeof File !== 'undefined' && input instanceof File;
    const label = isFile ? input.name : String(input || 'asset');
    const url = isFile ? URL.createObjectURL(input) : label;
    if (isFile) this.localObjectUrls.push(url);
    if (/\.poseclip\.json($|[?#])/i.test(label)) {
      const response = await fetch(url);
      const payload = await response.json();
      const clip = deserializeAnimationClip(payload.clip || payload);
      return { scene: null, animations: clip ? [clip] : [], label, file: isFile ? input : null };
    }
    if (/\.fbx($|[?#])/i.test(label)) {
      const object = await this.fbxLoader.loadAsync(url);
      return { scene: object, animations: normalizeLoadedClipNames(object.animations || [], label), label, file: isFile ? input : null };
    }
    const gltf = await this.loader.loadAsync(url);
    return { scene: gltf.scene, animations: normalizeLoadedClipNames(gltf.animations || [], label), label, file: isFile ? input : null };
  }

  async loadExtraClips(info) {
    const clips = [];
    const failures = [];
    for (const url of info.extraClipUrls || []) {
      try {
        setStatus('loading extra clips ' + filenameStem(url));
        const loaded = await this.loadAsset(url);
        clips.push(...normalizeLoadedClipNames(loaded.animations || [], url));
      } catch (err) {
        failures.push(filenameStem(url));
        console.warn('extra clip failed', url, err);
      }
    }
    clips.failures = failures;
    return clips;
  }

  renderActorTabs() {
    const container = document.getElementById('actorTabs');
    if (!container) return;
    const specs = [];
    const seen = new Set();
    for (const [key, info] of Object.entries(ACTORS)) {
      specs.push({
        key,
        label: this.actors.get(key)?.info?.label || info.label || key,
        available: this.actors.has(key),
        loading: this.loadingActors.has(key),
        error: this.actorLoadErrors.get(key) || '',
      });
      seen.add(key);
    }
    for (const [key, actor] of this.actors) {
      if (seen.has(key)) continue;
      specs.push({ key, label: actor.info?.label || key, available: true, loading: false, error: '' });
    }
    if (!specs.length) {
      for (const button of UI.tabs) button.addEventListener('click', () => { this.select(button.dataset.actor); this.saveState(); });
      return;
    }
    container.replaceChildren();
    for (const spec of specs) {
      const button = document.createElement('button');
      button.id = 'tab-' + spec.key;
      button.type = 'button';
      button.dataset.actor = spec.key;
      button.textContent = spec.label + (spec.loading ? ' ...' : spec.error ? ' !' : '');
      button.classList.toggle('unloaded', !spec.available);
      button.classList.toggle('loading', spec.loading);
      button.classList.toggle('failed', Boolean(spec.error));
      button.title = spec.error || (spec.available ? spec.label : 'Tap to load ' + spec.label);
      button.addEventListener('click', async () => {
        if (!this.actors.has(spec.key)) {
          try {
            await this.loadActorProfile(spec.key, ACTORS[spec.key]);
          } catch (err) {
            setStatus('load failed ' + spec.label + ': ' + (err.message || err));
            if (UI.cleanupStatus) UI.cleanupStatus.textContent = err.stack || String(err);
            return;
          }
        }
        this.activateActor(spec.key, { preferSaved: false });
      });
      container.append(button);
    }
    UI.tabs = [...container.querySelectorAll('button')];
    for (const tab of UI.tabs) tab.classList.toggle('active', tab.dataset.actor === this.selected);
  }

  localActorProfile(label) {
    return {
      label,
      role: 'opened-local-asset',
      url: '',
      color: 0xd6a642,
      runtimeColor: 0xd6a642,
      labPositionX: 0,
      position: 0,
      targetHeight: 2.0,
      defaultRotX: 0,
      transform: { posX: 0, posY: 0, posZ: 0, rotationX: 0, rotationY: 0, rotationZ: 0, basisX: 0, basisY: 0, basisZ: 0, scale: 100 },
      rest: { source: 'local file open', reason: 'Opened directly through browser file picker.' },
      restClip: '',
      startupPanel: 'cleanup',
      ownClipOptions: { positionPolicy: 'hips', lockHipRotation: false },
      retargetOptions: { positionPolicy: 'hips', lockHipRotation: false },
      troubleshooting: ['Opened from local files. Select a model FBX/GLB plus optional animation FBX files together for a self-service cleanup session.'],
    };
  }

  async openLocalAssetFiles(files) {
    if (!files?.length) return;
    try {
      setStatus('opening ' + files.length + ' local file(s)');
      const loaded = [];
      for (const file of files) loaded.push(await this.loadAsset(file));
      const modelEntry = loaded.find((entry) => hasRenderableModel(entry.scene));
      const clips = loaded.flatMap((entry) => entry.animations || []);
      if (!modelEntry) {
        const actor = this.actors.get(this.selected);
        if (!actor || !clips.length) {
          setStatus('opened files had no model or animation clips');
          return;
        }
        const prefix = 'opened-clips:' + this.selected + ':' + Date.now();
        const prepared = prepareGroundedClips(clips, actor.model, prefix, actor.info?.ownClipOptions || { positionPolicy: 'hips' });
        actor.addCustomClips(prepared, prefix, { translate: true, rotate: true, scale: false });
        const firstClip = prepared.find((clip) => clip.tracks?.length) || prepared[0];
        if (firstClip) actor.play(clipKey(firstClip));
        this.renderClipButtons();
        this.setPanel('cleanup');
        this.updateCleanupUi('added clips to ' + actor.info.label + ': ' + files.map((file) => file.name).join(', '));
        this.updateReadout();
        this.saveState();
        setStatus('added local clips=' + prepared.length + ' to ' + actor.info.label);
        return;
      }
      this.localActorSerial += 1;
      const key = 'opened-' + this.localActorSerial;
      const label = filenameStem(modelEntry.label || 'Opened Asset');
      const actor = new PoseActor(key, modelEntry.scene, clips, this.localActorProfile(label));
      this.actors.set(key, actor);
      this.localActorKeys.add(key);
      this.scene.add(actor.root);
      actor.root.visible = false;
      this.renderActorTabs();
      this.activateActor(key, { preferSaved: false });
      this.updateCleanupUi('opened ' + files.map((file) => file.name).join(', '));
      setStatus('opened local actor: ' + label + ' clips=' + actor.clips.length);
    } catch (err) {
      console.error(err);
      setStatus('open failed: ' + (err.message || err));
      if (UI.cleanupStatus) UI.cleanupStatus.textContent = err.stack || String(err);
    }
  }

  clearOpenedActors() {
    for (const key of [...this.localActorKeys]) {
      const actor = this.actors.get(key);
      if (actor?.root?.parent) actor.root.parent.remove(actor.root);
      actor?.mixer?.stopAllAction();
      this.actors.delete(key);
    }
    this.localActorKeys.clear();
    for (const url of this.localObjectUrls.splice(0)) URL.revokeObjectURL(url);
    this.selected = this.actors.has('orc') ? 'orc' : [...this.actors.keys()][0] || 'player';
    this.renderActorTabs();
    this.select(this.selected);
    this.setPanel(this.actors.get(this.selected)?.info?.startupPanel || 'clips');
    setStatus('cleared opened local assets');
  }

  async loadActorProfile(key, info = ACTORS[key]) {
    if (!info) throw new Error('unknown actor profile: ' + key);
    if (this.actors.has(key)) return this.actors.get(key);
    if (this.loadingActors.has(key)) return this.loadingActors.get(key);
    const promise = (async () => {
      this.actorLoadErrors.delete(key);
      this.renderActorTabs();
      setStatus('loading ' + (info.label || key));
      const loaded = await this.loadAsset(info.url);
      const actor = new PoseActor(key, loaded.scene, loaded.animations || []);
      this.actors.set(key, actor);
      this.scene.add(actor.root);
      actor.root.visible = false;
      this.renderActorTabs();
      if (info.visualOverlay?.textures) {
        try {
          const overlayTextures = await loadVisualOverlayTextureSet(info.visualOverlay);
          if (info.visualOverlay.url) {
            const overlayLoaded = await this.loadAsset(info.visualOverlay.url);
            actor.attachVisualOverlay(overlayLoaded.scene, info.visualOverlay, overlayTextures);
          } else {
            applyVisualOverlayMaterials(actor.model, overlayTextures, info.visualOverlay.materialOptions || {});
          }
        } catch (err) {
          console.warn('visual overlay failed', info.visualOverlay.url || 'texture-set', err);
        }
      }
      const extraClips = await this.loadExtraClips(info);
      let preparedExtraClips = [];
      if (extraClips.length) {
        const originPrefix = 'own-extra:' + key + ':';
        preparedExtraClips = prepareGroundedClips(extraClips, actor.model, originPrefix, clipOptions(actor.info, key === 'player' ? { positionPolicy: 'all' } : { positionPolicy: 'hips', lockHipRotation: false }));
        actor.addCustomClips(preparedExtraClips, originPrefix, { translate: true, rotate: true, scale: false });
      }
      this.restoreCleanupDrafts(actor);
      this.applySavedActorState(actor);
      this.renderActorTabs();
      const startupResolved = actor.info?.startupClip ? actor.clips.some((clip) => clipMatchesPreference(clip, actor.info.startupClip)) : false;
      const extraConfigured = Number(actor.info?.extraClipUrls?.length || 0);
      setStatus((info.label || key) + ' clips=' + actor.clips.length + ' bones=' + actor.bones.length + ' extra=' + preparedExtraClips.length + '/' + extraConfigured + ' startup=' + (startupResolved ? 'ok' : actor.info?.startupClip ? 'missing' : 'none') + (extraClips.failures?.length ? ' clip failures=' + extraClips.failures.join(',') : ''));
      return actor;
    })();
    this.loadingActors.set(key, promise);
    try {
      return await promise;
    } catch (err) {
      this.actorLoadErrors.set(key, err.message || String(err));
      console.warn('actor failed to load', key, err);
      this.renderActorTabs();
      throw err;
    } finally {
      this.loadingActors.delete(key);
      this.renderActorTabs();
    }
  }


  async loadAttackMetadata() {
    const loads = Object.entries(ACTORS)
      .filter(([, info]) => info.attackMetadataUrl)
      .map(async ([key, info]) => {
        try {
          const response = await fetch(info.attackMetadataUrl);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const payload = await response.json();
          const entries = [];
          if (Array.isArray(payload?.standard)) entries.push(...payload.standard);
          if (Array.isArray(payload?.special)) entries.push(...payload.special);
          this.attackMetadata.set(key, entries);
        } catch (err) {
          console.warn('attack metadata failed', key, info.attackMetadataUrl, err);
          this.attackMetadata.set(key, []);
        }
      });
    await Promise.all(loads);
  }


  poseIndexData(actor) {
    return this.poseIndexStore.get(actor?.key || '') || defaultPoseIndexPayload(actor, []);
  }

  setPoseIndexData(actor, payload, statusText = '') {
    if (!actor) return;
    const next = payload || defaultPoseIndexPayload(actor, []);
    this.poseIndexStore.set(actor.key, next);
    this.poseIndexStatusText = statusText || ('indexed clips=' + (next.clips?.length || 0));
    this.renderPoseIndexUi();
  }

  matchAttackMetadata(actor, clip) {
    const source = normalizeClipName(clip?.userData?.sourceName || clip?.name || '');
    const sourceTokens = new Set(normalizeClipTokens(source));
    let best = null;
    let bestScore = -1;
    for (const entry of this.attackMetadata.get(actor?.key || '') || []) {
      const target = normalizeClipName(entry?.name || '');
      if (!target) continue;
      const targetTokens = normalizeClipTokens(target);
      let score = 0;
      if (source === target) score = 100;
      else if (source.includes(target) || target.includes(source)) score = 60;
      else score = targetTokens.reduce((sum, token) => sum + (sourceTokens.has(token) ? 10 : 0), 0);
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    return bestScore >= 10 ? best : null;
  }

  describeClipFrames(actor, clip, options = {}) {
    const meta = options.meta || this.matchAttackMetadata(actor, clip);
    if (!meta) return null;
    const keyTimes = clipKeyTimes(clip);
    if (!keyTimes.length) return null;
    const duration = Math.max(0.001, Number(clip.duration || keyTimes[keyTimes.length - 1] || 0.001));
    const hints = buildSemanticHints(meta, duration);
    actor.play(clipKey(clip));
    actor.pauseActive(true);
    const rawFrames = keyTimes.map((time, index) => {
      actor.seek(time);
      return {
        id: actor.key + ':' + clipKey(clip) + ':' + index + ':' + Math.round(time * 1000),
        time,
        keyIndex: index,
        keyCount: keyTimes.length,
        snapshot: poseSnapshot(actor),
      };
    });
    const frames = rawFrames.map((entry, index) => describePoseFrame(entry, rawFrames[index - 1] || null, rawFrames[index + 1] || null, hints, duration, meta));
    const anchors = selectAnchorFrames(frames, hints, options.maxAnchors || 6);
    return {
      clipKey: clipKey(clip),
      clipName: clip.name,
      sourceName: clip.userData?.sourceName || clip.name,
      origin: clip.userData?.origin || 'own',
      duration: roundValue(duration, 4),
      keyTimes: keyTimes.map((time) => roundValue(time, 4)),
      frameCount: frames.length,
      attackMetadata: meta,
      semanticHints: hints.map((hint) => ({ ...hint, time: roundValue(hint.time, 4) })),
      frames,
      anchorFrames: anchors,
    };
  }

  indexActiveClipPoses() {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!actor || !clip) {
      this.poseIndexStatusText = 'play an attack clip first';
      this.renderPoseIndexUi();
      return;
    }
    const clipData = this.describeClipFrames(actor, clip, { maxAnchors: 6 });
    if (!clipData) {
      this.poseIndexStatusText = 'no matching attack metadata for ' + clipLabel(clip);
      this.renderPoseIndexUi();
      return;
    }
    const payload = defaultPoseIndexPayload(actor, [clipData]);
    this.setPoseIndexData(actor, payload, 'indexed ' + clipData.frameCount + ' keyed frames from ' + clipLabel(clip));
    this.updateCleanupUi('pose index ready | ' + clipLabel(clip));
    this.updateReadout();
  }

  indexSelectedActorClips() {
    const actor = this.actors.get(this.selected);
    if (!actor) return;
    const clips = actor.clips.filter((clip) => this.matchAttackMetadata(actor, clip));
    if (!clips.length) {
      this.poseIndexStatusText = 'no attack-metadata-matched clips for ' + actor.info.label;
      this.renderPoseIndexUi();
      return;
    }
    const described = [];
    for (const clip of clips) {
      const clipData = this.describeClipFrames(actor, clip, { maxAnchors: 6 });
      if (clipData) described.push(clipData);
    }
    described.sort((a, b) => a.sourceName.localeCompare(b.sourceName));
    const frameCount = described.reduce((sum, clipData) => sum + Number(clipData.frameCount || 0), 0);
    const payload = defaultPoseIndexPayload(actor, described);
    this.setPoseIndexData(actor, payload, 'indexed ' + frameCount + ' keyed frames across ' + described.length + ' attack clip(s)');
    this.updateCleanupUi('pose index ready | ' + actor.info.label);
    this.updateReadout();
  }

  exportSelectedPoseIndex() {
    const actor = this.actors.get(this.selected);
    const payload = this.poseIndexData(actor);
    if (!actor || !(payload.clips || []).length) {
      this.poseIndexStatusText = 'no indexed clips to export';
      this.renderPoseIndexUi();
      return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const preferred = actor.info?.poseIndexExportPath || ('assets/pose_indexes/' + safeFileStem(actor.key + '_pose_index') + '.json');
    link.download = preferred.split('/').pop() || (safeFileStem(actor.key + '_pose_index') + '.json');
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.poseIndexStatusText = 'exported ' + link.download + ' | repo target: ' + preferred;
    this.renderPoseIndexUi();
  }

  renderPoseIndexUi() {
    const actor = this.actors.get(this.selected);
    const activeClip = actor?.activeClip();
    const payload = this.poseIndexData(actor);
    const clips = payload.clips || [];
    if (UI.poseIndexStatus) {
      if (!actor) UI.poseIndexStatus.textContent = 'waiting';
      else if (!clips.length) UI.poseIndexStatus.textContent = this.poseIndexStatusText || ('attack metadata: ' + ((this.attackMetadata.get(actor.key) || []).length ? 'ready' : 'none') + ' | active clip: ' + (activeClip ? clipLabel(activeClip) : 'none'));
      else UI.poseIndexStatus.textContent = this.poseIndexStatusText || ('indexed clips=' + clips.length + ' | active clip: ' + (activeClip ? clipLabel(activeClip) : 'none'));
    }
    if (!UI.poseIndexList) return;
    UI.poseIndexList.replaceChildren();
    if (!actor) return;
    if (!clips.length) {
      const empty = document.createElement('div');
      empty.className = 'cleanup-pose-index-empty';
      empty.textContent = 'Index Clip builds per-keyed-frame descriptions for the current attack clip. Index Actor scans all matched attack clips and exports reusable frame-state sequences.';
      UI.poseIndexList.append(empty);
      return;
    }
    for (const clipData of clips) {
      const item = document.createElement('div');
      item.className = 'cleanup-pose-index-item';
      const title = document.createElement('strong');
      title.textContent = clipData.sourceName + ' | frames=' + clipData.frameCount + ' anchors=' + (clipData.anchorFrames?.length || 0);
      const meta = document.createElement('span');
      meta.textContent = 'duration=' + fmt(clipData.duration) + ' semantic=' + (clipData.semanticHints || []).map((hint) => hint.tag).join(', ');
      const sample = document.createElement('span');
      const anchorSummary = (clipData.anchorFrames || []).slice(0, 4).map((frame) => frame.semanticTag + '@' + fmt(frame.time) + ' ' + frame.description).join(' | ');
      sample.textContent = anchorSummary || 'no anchors';
      item.append(title, meta, sample);
      UI.poseIndexList.append(item);
    }
  }


  async loadActors() {
    for (const [key, info] of Object.entries(ACTORS)) {
      try {
        await this.loadActorProfile(key, info);
      } catch (err) {
        setStatus('failed loading ' + (info.label || key) + ': ' + (err.message || err));
      }
    }

    const player = this.actors.get('player');
    const arcane = this.actors.get('arcane');
    const ares = this.actors.get('ares');
    const titan = this.actors.get('titan');
    if (ares && titan) {
      const sharedForTitan = retargetSharedClips(ares.rawClips, ares.model, titan.model, {
        channels: { translate: true, rotate: true, scale: false },
        positionPolicy: ACTORS.titan?.retargetOptions?.positionPolicy || 'hips',
        sourceLabel: 'ares',
        targetLabel: 'titan',
        lockHipRotation: ACTORS.titan?.retargetOptions?.lockHipRotation === true,
        translationScale: ACTORS.titan?.retargetOptions?.translationScale ?? 1,
      });
      titan.addRetargetedClips(sharedForTitan, 'ares', { translate: true, rotate: true, scale: false });
      ares.setRestPose(ares.currentRestPose);
      titan.setRestPose(titan.currentRestPose);
      titan.sharedFallback = Boolean(sharedForTitan.fallback);
      titan.retargetFailures = Number(sharedForTitan.failures || 0);
    }
    if (player && arcane) {
      const guidedArmClips = buildPositionGuidedArmClips(player.rawClips, player.model, arcane.model, {
        sourceLabel: 'player',
        targetLabel: 'arcane',
        positionGuidedArmClips: ACTORS.arcane.retargetOptions?.positionGuidedArmClips,
      });
      const guidedNames = new Set(guidedArmClips.map((clip) => clip.userData?.sourceName).filter(Boolean));
      const armRetarget = buildMappedRotationClips(player.rawClips, player.model, arcane.model, {
        sourceLabel: 'player',
        targetLabel: 'arcane',
        directRotationMap: ACTORS.arcane.retargetOptions?.directRotationMap || {},
        directRotationPairs: ACTORS.arcane.retargetOptions?.directRotationPairs || [],
        boneRollCorrection: ACTORS.arcane.retargetOptions?.boneRollCorrection || 'none',
        skipClipNames: guidedNames,
      });
      armRetarget.push(...guidedArmClips);
      armRetarget.failures = Number(armRetarget.failures || 0) + Number(guidedArmClips.failures || 0);
      armRetarget.fallback = armRetarget.length === 0;
      arcane.addCustomClips(armRetarget, 'mapped-arms:player->arcane', { translate: false, rotate: true, scale: false });
      const torsoHip = buildTorsoToHipClips(player.rawClips, player.model, arcane.model, {
        sourceLabel: 'player',
        targetLabel: 'arcane',
      });
      arcane.addCustomClips(torsoHip, 'torso-hips:player->arcane', { translate: false, rotate: true, scale: false });
      arcane.sharedFallback = Boolean(armRetarget.fallback && torsoHip.fallback);
      arcane.retargetFailures = Number(armRetarget.failures || 0) + Number(torsoHip.failures || 0);
      player.setRestPose(player.currentRestPose);
      arcane.setRestPose(arcane.currentRestPose);
    }

    this.populateRetargetSelectors();
    this.updateRetargetStatus('ready');
    const ready = [...this.actors.values()].map((actor) => actor.info.label + ' clips=' + actor.clips.length).join(' | ');
    setStatus('ready: ' + ready);
  }

  populateRetargetSelectors() {
    for (const select of [UI.sourceActor, UI.targetActor]) select.replaceChildren();
    for (const [key, actor] of this.actors) {
      for (const select of [UI.sourceActor, UI.targetActor]) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = actor.info.label;
        select.append(option);
      }
    }
    UI.sourceActor.value = 'player';
    UI.targetActor.value = this.actors.has('arcane') ? 'arcane' : [...this.actors.keys()][1] || [...this.actors.keys()][0] || '';
  }

  getRetargetOptions() {
    const channels = {
      translate: UI.useTranslate.checked,
      rotate: UI.useRotate.checked,
      scale: UI.useScale.checked,
    };
    return {
      sourceKey: UI.sourceActor.value,
      targetKey: UI.targetActor.value,
      channels,
      positionPolicy: UI.positionPolicy.value,
      torsoToHips: UI.torsoToHips.checked,
    };
  }

  updateRetargetStatus(prefix = '') {
    const options = this.getRetargetOptions();
    const source = this.actors.get(options.sourceKey);
    const target = this.actors.get(options.targetKey);
    const label = [
      prefix,
      (source?.info?.label || options.sourceKey) + ' -> ' + (target?.info?.label || options.targetKey),
      'channels=' + channelSuffix(options.channels),
      'position=' + options.positionPolicy,
      options.torsoToHips ? 'torso->hips' : '',
    ].filter(Boolean).join(' | ');
    UI.retargetStatus.textContent = label || 'waiting';
  }

  buildRetarget() {
    const options = this.getRetargetOptions();
    const source = this.actors.get(options.sourceKey);
    const target = this.actors.get(options.targetKey);
    if (!source || !target) {
      this.updateRetargetStatus('missing actor');
      return;
    }
    if (source === target) {
      this.updateRetargetStatus('source and target must differ');
      return;
    }
    const useDirectMap = !options.torsoToHips && Object.keys(target.info.retargetOptions?.directRotationMap || {}).length > 0;
    const retargeted = options.torsoToHips
      ? buildTorsoToHipClips(source.rawClips, source.model, target.model, {
        sourceLabel: options.sourceKey,
        targetLabel: options.targetKey,
      })
      : useDirectMap
        ? (() => {
          const guidedArmClips = buildPositionGuidedArmClips(source.rawClips, source.model, target.model, {
            sourceLabel: options.sourceKey,
            targetLabel: options.targetKey,
            positionGuidedArmClips: target.info.retargetOptions?.positionGuidedArmClips,
          });
          const guidedNames = new Set(guidedArmClips.map((clip) => clip.userData?.sourceName).filter(Boolean));
          const mapped = buildMappedRotationClips(source.rawClips, source.model, target.model, {
            sourceLabel: options.sourceKey,
            targetLabel: options.targetKey,
            directRotationMap: target.info.retargetOptions?.directRotationMap || {},
            directRotationPairs: target.info.retargetOptions?.directRotationPairs || [],
            boneRollCorrection: target.info.retargetOptions?.boneRollCorrection || 'none',
            skipClipNames: guidedNames,
          });
          mapped.push(...guidedArmClips);
          mapped.failures = Number(mapped.failures || 0) + Number(guidedArmClips.failures || 0);
          mapped.fallback = mapped.length === 0;
          return mapped;
        })()
        : retargetSharedClips(source.rawClips, source.model, target.model, {
          channels: options.channels,
          positionPolicy: options.positionPolicy,
          sourceLabel: options.sourceKey,
          targetLabel: options.targetKey,
          names: target.info.retargetOptions?.names || {},
        });
    if (options.torsoToHips) {
      target.addCustomClips(retargeted, 'torso-hips:' + options.sourceKey + '->' + options.targetKey, { translate: false, rotate: true, scale: false });
    } else if (useDirectMap) {
      target.addCustomClips(retargeted, 'mapped-arms:' + options.sourceKey + '->' + options.targetKey, { translate: false, rotate: true, scale: false });
    } else {
      target.addRetargetedClips(retargeted, options.sourceKey, options.channels);
    }
    source.setRestPose(source.currentRestPose);
    target.setRestPose(target.currentRestPose);
    target.sharedFallback = Boolean(retargeted.fallback);
    target.retargetFailures = Number(retargeted.failures || 0);
    this.select(options.targetKey);
    this.updateRetargetStatus('built clips=' + retargeted.length + ' failures=' + target.retargetFailures);
  }

  populateBoneSelect(actor) {
    UI.boneSelect.replaceChildren();
    if (!actor) return;
    for (const bone of actor.bones) {
      const option = document.createElement('option');
      option.value = bone.name;
      option.textContent = shortBoneName(bone.name);
      option.title = bone.name;
      UI.boneSelect.append(option);
    }
    if (actor.selectedBoneName) UI.boneSelect.value = actor.selectedBoneName;
  }

  selectBone(name) {
    const actor = this.actors.get(this.selected);
    if (!actor || !actor.selectBone(name)) return;
    UI.boneSelect.value = actor.selectedBoneName;
    this.setBoneUiValues(actor.currentBoneEdit());
    this.updateBoneUi();
    setStatus('selected bone: ' + shortBoneName(actor.selectedBoneName));
  }

  setBoneUiValues(edit) {
    UI.boneUseTranslate.checked = Boolean(edit.useTranslate);
    UI.boneUseRotate.checked = Boolean(edit.useRotate);
    UI.boneUseScale.checked = Boolean(edit.useScale);
    UI.bonePosX.value = String(edit.posX || 0);
    UI.bonePosY.value = String(edit.posY || 0);
    UI.bonePosZ.value = String(edit.posZ || 0);
    UI.boneRotX.value = String(edit.rotX || 0);
    UI.boneRotY.value = String(edit.rotY || 0);
    UI.boneRotZ.value = String(edit.rotZ || 0);
    UI.boneScale.value = String(edit.scale || 100);
    UI.bonePosXValue.textContent = UI.bonePosX.value;
    UI.bonePosYValue.textContent = UI.bonePosY.value;
    UI.bonePosZValue.textContent = UI.bonePosZ.value;
    UI.boneRotXValue.textContent = UI.boneRotX.value;
    UI.boneRotYValue.textContent = UI.boneRotY.value;
    UI.boneRotZValue.textContent = UI.boneRotZ.value;
    UI.boneScaleValue.textContent = UI.boneScale.value + '%';
  }

  getBoneUiEdit() {
    return {
      useTranslate: UI.boneUseTranslate.checked,
      useRotate: UI.boneUseRotate.checked,
      useScale: UI.boneUseScale.checked,
      posX: Number(UI.bonePosX.value),
      posY: Number(UI.bonePosY.value),
      posZ: Number(UI.bonePosZ.value),
      rotX: Number(UI.boneRotX.value),
      rotY: Number(UI.boneRotY.value),
      rotZ: Number(UI.boneRotZ.value),
      scale: Number(UI.boneScale.value),
    };
  }

  applyBoneUiEdit() {
    const actor = this.actors.get(this.selected);
    if (!actor?.selectedBoneName) return;
    const edit = this.getBoneUiEdit();
    actor.applyBoneEdit(actor.selectedBoneName, edit);
    this.setBoneUiValues(edit);
    this.updateBoneUi();
  }

  updateBoneUi() {
    const actor = this.actors.get(this.selected);
    if (!actor) return;
    UI.showBoneOverlay.checked = actor.showBoneOverlay;
    UI.boneStatus.textContent = actor.selectedBoneStatus();
    this.updateReadout();
  }

  pickBoneHandle(event) {
    if (!this.pointerDown) return;
    const dx = event.clientX - this.pointerDown.x;
    const dy = event.clientY - this.pointerDown.y;
    this.pointerDown = null;
    if (Math.hypot(dx, dy) > 12) return;
    const actor = this.actors.get(this.selected);
    if (!actor?.showBoneOverlay) return;
    const rect = UI.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const handles = [...actor.boneHandles.values()].filter((handle) => handle.visible);
    const hits = this.raycaster.intersectObjects(handles, false);
    if (!hits.length) return;
    const boneName = hits[0].object.userData.boneName;
    if (boneName) {
      this.selectBone(boneName);
      this.setPanel('bones');
    }
  }

  applyOrbitView(actor) {
    const orbitView = actor?.info?.orbitView;
    if (!actor || !orbitView) {
      this.controls.target.copy(this.orbitCameraState.target);
      this.camera.position.copy(this.orbitCameraState.position);
      this.controls.minDistance = 2.0;
      this.controls.maxDistance = 10.0;
      return;
    }
    const frame = actor.orbitFrame();
    const target = Array.isArray(orbitView.target)
      ? new THREE.Vector3().fromArray(orbitView.target)
      : frame.center.clone();
    const position = Array.isArray(orbitView.position)
      ? new THREE.Vector3().fromArray(orbitView.position)
      : this.orbitCameraState.position.clone();
    this.controls.target.copy(target);
    this.camera.position.copy(position);
    this.controls.minDistance = Number(orbitView.minDistance ?? 2.0);
    this.controls.maxDistance = Number(orbitView.maxDistance ?? 10.0);
  }

  setViewMode(mode) {
    this.clearFirstPersonMasks();
    this.viewMode = mode === 'firstPerson' ? 'firstPerson' : 'orbit';
    const actor = this.actors.get(this.selected);
    if (this.viewMode === 'firstPerson' && !actor?.info?.firstPersonCamera) this.viewMode = 'orbit';
    if (this.viewMode === 'orbit') {
      this.camera.fov = this.orbitCameraState.fov;
      this.camera.near = this.orbitCameraState.near;
      this.controls.enabled = true;
      this.applyOrbitView(actor);
      this.camera.updateProjectionMatrix();
    } else {
      this.controls.enabled = false;
      this.updateFirstPersonCamera();
    }
    for (const button of UI.viewButtons) button.classList.toggle('active', button.dataset.viewMode === this.viewMode);
    document.body.classList.toggle('is-fpv', this.viewMode === 'firstPerson');
    if (this.viewMode === 'firstPerson' && UI.panels.clips?.classList.contains('open')) this.setPanel('none');
    this.saveState();
    this.updateReadout();
  }

  setFirstPersonHeadMask(actor, hidden) {
    const config = actor?.info?.firstPersonCamera;
    if (!actor || !config) return;
    const hideScale = Math.max(0.0001, Number(config.hideScale || 0.001));
    for (const name of config.hideBones || []) {
      const bone = findNamedBone(actor.model, name);
      if (!bone) continue;
      const rest = actor.boneRest.get(bone.name);
      if (hidden) bone.scale.setScalar(hideScale);
      else if (rest?.scale) bone.scale.copy(rest.scale);
      else bone.scale.setScalar(1);
    }
    for (const spec of config.stretchBones || []) {
      const bone = findNamedBone(actor.model, spec.name);
      if (!bone) continue;
      const rest = actor.boneRest.get(bone.name);
      if (rest?.scale) bone.scale.copy(rest.scale);
      else bone.scale.setScalar(1);
      if (hidden) {
        bone.scale.x *= Number(spec.x ?? spec.scale ?? 1);
        bone.scale.y *= Number(spec.y ?? spec.scale ?? 1);
        bone.scale.z *= Number(spec.z ?? spec.scale ?? 1);
      }
    }
    actor.model.updateMatrixWorld(true);
  }

  clearFirstPersonMasks() {
    for (const actor of this.actors.values()) this.setFirstPersonHeadMask(actor, false);
  }

  updateFirstPersonCamera() {
    if (this.viewMode !== 'firstPerson') return;
    const actor = this.actors.get(this.selected);
    const config = actor?.info?.firstPersonCamera;
    if (!actor || !config) return;
    this.setFirstPersonHeadMask(actor, false);
    const anchorBone = findNamedBone(actor.model, config.anchor) || findNamedBone(actor.model, config.fallbackAnchor) || findNamedBone(actor.model, 'Head');
    if (!anchorBone) return;
    actor.model.updateMatrixWorld(true);
    if (config.useBoneCameraTransform) {
      anchorBone.matrixWorld.decompose(this.camera.position, this.camera.quaternion, new THREE.Vector3());
      if (config.levelWorldUp) {
        this.camera.up.set(0, 1, 0);
        const position = this.camera.position.clone();
        const forward = axisVector(config.forwardAxis || 'z').multiplyScalar(Number(config.lookForward || 1.35));
        const target = position.clone().add(forward).add(new THREE.Vector3(0, Number(config.lookVertical || 0), 0));
        this.camera.lookAt(target);
      }
    } else if (config.useSourceCameraMarker) {
      const anchor = worldPositionOf(anchorBone);
      const handCenter = averageBoneWorldPosition(actor.model, config.targetHandBones || []);
      const position = anchor.clone();
      if (handCenter) position.y = handCenter.y + Number(config.handCameraYOffset ?? 0.095);
      position.z += Number(config.cameraBackOffset ?? -0.22);
      this.camera.position.copy(position);
      this.camera.up.set(0, 1, 0);
      const forward = axisVector(config.forwardAxis || 'z').multiplyScalar(Number(config.lookForward || 1.35));
      const target = position.clone().add(forward).add(new THREE.Vector3(0, Number(config.lookVertical || 0), 0));
      this.camera.lookAt(target);
    } else {
      const localCamera = matrixFromGodotTransform(config.godotCameraTransform || config.arcaneCamera3DReference);
      const worldCamera = anchorBone.matrixWorld.clone().multiply(localCamera);
      worldCamera.decompose(this.camera.position, this.camera.quaternion, new THREE.Vector3());
    }
    this.camera.fov = Number(config.fov || 85);
    this.camera.near = Number(config.near || 0.08);
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
    this.setFirstPersonHeadMask(actor, true);
  }

  select(key) {
    this.clearFirstPersonMasks();
    this.selected = key;
    const actor = this.actors.get(key);
    for (const tab of UI.tabs) tab.classList.toggle('active', tab.dataset.actor === key);
    for (const [actorKey, entry] of this.actors) {
      entry.root.visible = actorKey === key;
      if (entry.root.visible) entry.root.position.x = 0;
    }
    if (!actor) return;
    if (this.viewMode === 'orbit') this.applyOrbitView(actor);
    this.setUiValues(actor.values.posX || 0, actor.values.posY || 0, actor.values.posZ || 0, actor.values.x, actor.values.y, actor.values.z, actor.values.scale, actor.values.basisX || 0, actor.values.basisY || 0, actor.values.basisZ || 0);
    this.populateBoneSelect(actor);
    this.setBoneUiValues(actor.currentBoneEdit());
    if (UI.clipSearch) UI.clipSearch.value = actor.clipSearch || '';
    this.renderClipButtons();
    this.renderPoseIndexUi();
    this.updateCleanupUi();
    this.updateReadout();
  }

  readCleanupDraftStore() {
    try { return JSON.parse(localStorage.getItem(CLEANUP_DRAFTS_KEY) || '{}') || {}; }
    catch (_err) { return {}; }
  }

  writeCleanupDraftStore(store) {
    localStorage.setItem(CLEANUP_DRAFTS_KEY, JSON.stringify(store));
  }

  saveCleanupDraft(actor, clip, reason = 'autosave') {
    if (!actor || !clip) return false;
    const store = this.readCleanupDraftStore();
    const list = Array.isArray(store[actor.key]) ? store[actor.key] : [];
    const savedAt = Date.now();
    const draft = { id: 'draft-' + savedAt, actorKey: actor.key, actorLabel: actor.info?.label || actor.key, savedAt, reason, clip: serializeAnimationClip(clip) };
    store[actor.key] = [draft, ...list.filter((entry) => entry.clip?.name !== clip.name)].slice(0, 8);
    try {
      this.writeCleanupDraftStore(store);
      if (UI.cleanupSaveStatus) UI.cleanupSaveStatus.textContent = reason + ' saved ' + new Date(savedAt).toLocaleTimeString();
      return true;
    } catch (err) {
      console.warn('cleanup draft save failed', err);
      if (UI.cleanupSaveStatus) UI.cleanupSaveStatus.textContent = 'save failed: ' + (err.message || err);
      return false;
    }
  }

  saveActiveCleanupDraft(reason = 'manual') {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!actor || !clip) { this.updateCleanupUi('no active clip to save'); return; }
    const ok = this.saveCleanupDraft(actor, clip, reason);
    this.updateCleanupUi(ok ? 'saved draft: ' + clip.name : 'draft save failed');
  }

  restoreCleanupDrafts(actor) {
    if (!actor) return 0;
    const store = this.readCleanupDraftStore();
    const list = Array.isArray(store[actor.key]) ? store[actor.key] : [];
    let restored = 0;
    for (const entry of list.slice().reverse()) {
      const clip = deserializeAnimationClip(entry.clip);
      if (!clip) continue;
      clip.userData = { ...(clip.userData || {}), origin: clip.userData?.origin || ('cleanup:' + actor.key + ':restored-' + restored), cleanupActor: actor.key, restoredDraft: true };
      const key = clipKey(clip);
      if (actor.actions.has(key)) continue;
      actor.clips.push(clip);
      actor.actions.set(key, actor.mixer.clipAction(clip));
      restored += 1;
    }
    if (restored) {
      actor.cleanupClipCount = actor.clips.filter((entry) => (entry.userData?.origin || '').startsWith('cleanup:')).length;
      if (UI.cleanupSaveStatus) UI.cleanupSaveStatus.textContent = 'restored drafts=' + restored;
    }
    return restored;
  }

  clearCleanupDraftsForSelectedActor() {
    const actor = this.actors.get(this.selected);
    if (!actor) return;
    const store = this.readCleanupDraftStore();
    delete store[actor.key];
    try { this.writeCleanupDraftStore(store); } catch (_err) {}
    if (UI.cleanupSaveStatus) UI.cleanupSaveStatus.textContent = 'cleared drafts for ' + actor.info.label;
    this.updateCleanupUi('cleared saved drafts');
  }

  exportActiveCleanupClip() {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!clip) { this.updateCleanupUi('no active clip to export'); return; }
    const payload = { exportedAt: new Date().toISOString(), actorKey: actor.key, actorLabel: actor.info?.label || actor.key, clip: serializeAnimationClip(clip) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFileStem(actor.key + '_' + clip.name) + '.poseclip.json';
    document.body.append(link);
    link.click();
    const filename = link.download;
    link.remove();
    URL.revokeObjectURL(url);
    if (UI.cleanupSaveStatus) UI.cleanupSaveStatus.textContent = 'exported ' + filename;
    this.updateCleanupUi('exported json: ' + filename);
  }

  cleanupTimelineMetrics(clip) {
    const canvas = UI.cleanupTimelineCanvas;
    const duration = Math.max(0.001, clip?.duration || 0.001);
    const rect = canvas?.getBoundingClientRect?.() || { left: 0, top: 0, width: 1, height: 1 };
    const left = 14;
    const right = Math.max(left + 1, rect.width - 14);
    return {
      canvas,
      duration,
      rect,
      left,
      right,
      width: Math.max(1, right - left),
      trackY: Math.max(22, rect.height * 0.42),
      trackH: Math.max(26, rect.height * 0.32),
    };
  }

  timeToCleanupX(time, metrics) {
    return metrics.left + (clampValue(time, 0, metrics.duration) / metrics.duration) * metrics.width;
  }

  cleanupXToTime(clientX, metrics) {
    return clampValue(((clientX - metrics.rect.left - metrics.left) / metrics.width) * metrics.duration, 0, metrics.duration);
  }

  cleanupBlendRange(clip) {
    const range = this.cleanupRange(clip);
    const blendStart = clampValue(UI.cleanupBlendStart?.value ?? range.start, 0, range.start);
    const blendEnd = clampValue(UI.cleanupBlendEnd?.value ?? range.end, range.end, range.duration);
    return {
      ...range,
      blendStart,
      blendEnd,
      leftBlend: Math.max(0, range.start - blendStart),
      rightBlend: Math.max(0, blendEnd - range.end),
    };
  }

  setCleanupRangeValues(values, statusText = '') {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    const duration = Math.max(0.001, clip?.duration || 0.001);
    let start = clampValue(values.start ?? UI.cleanupStart?.value, 0, duration);
    let end = clampValue(values.end ?? UI.cleanupEnd?.value, 0, duration);
    if (start > end) [start, end] = [end, start];
    let blendStart = clampValue(values.blendStart ?? UI.cleanupBlendStart?.value ?? start, 0, start);
    let blendEnd = clampValue(values.blendEnd ?? UI.cleanupBlendEnd?.value ?? end, end, duration);
    UI.cleanupStart.value = start.toFixed(3);
    UI.cleanupEnd.value = end.toFixed(3);
    if (UI.cleanupBlendStart) UI.cleanupBlendStart.value = blendStart.toFixed(3);
    if (UI.cleanupBlendEnd) UI.cleanupBlendEnd.value = blendEnd.toFixed(3);
    this.updateCleanupUi(statusText);
  }

  beginCleanupTimelineDrag(event) {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!clip || !UI.cleanupTimelineCanvas) return;
    event.preventDefault();
    const metrics = this.cleanupTimelineMetrics(clip);
    const range = this.cleanupBlendRange(clip);
    const time = this.cleanupXToTime(event.clientX, metrics);
    const x = event.clientX - metrics.rect.left;
    const handleSpecs = [
      ['blendStart', range.blendStart],
      ['start', range.start],
      ['end', range.end],
      ['blendEnd', range.blendEnd],
    ].map(([name, value]) => ({ name, value, x: this.timeToCleanupX(value, metrics) }));
    const nearest = handleSpecs.reduce((best, item) => Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best, handleSpecs[0]);
    const mode = Math.abs(nearest.x - x) <= 14 ? nearest.name : 'newRange';
    this.cleanupTimelineDrag = { mode, anchor: time };
    UI.cleanupTimelineCanvas.setPointerCapture?.(event.pointerId);
    const move = (nextEvent) => this.dragCleanupTimeline(nextEvent);
    const up = (nextEvent) => {
      UI.cleanupTimelineCanvas.releasePointerCapture?.(nextEvent.pointerId);
      UI.cleanupTimelineCanvas.removeEventListener('pointermove', move);
      UI.cleanupTimelineCanvas.removeEventListener('pointerup', up);
      UI.cleanupTimelineCanvas.removeEventListener('pointercancel', up);
      this.cleanupTimelineDrag = null;
    };
    UI.cleanupTimelineCanvas.addEventListener('pointermove', move);
    UI.cleanupTimelineCanvas.addEventListener('pointerup', up);
    UI.cleanupTimelineCanvas.addEventListener('pointercancel', up);
    this.dragCleanupTimeline(event);
  }

  dragCleanupTimeline(event) {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!clip || !this.cleanupTimelineDrag) return;
    const metrics = this.cleanupTimelineMetrics(clip);
    const t = this.cleanupXToTime(event.clientX, metrics);
    const range = this.cleanupBlendRange(clip);
    const next = { start: range.start, end: range.end, blendStart: range.blendStart, blendEnd: range.blendEnd };
    if (this.cleanupTimelineDrag.mode === 'newRange') {
      next.start = Math.min(this.cleanupTimelineDrag.anchor, t);
      next.end = Math.max(this.cleanupTimelineDrag.anchor, t);
      next.blendStart = next.start;
      next.blendEnd = next.end;
      this.scrubCleanupClip(t);
    } else if (this.cleanupTimelineDrag.mode === 'start') {
      next.start = Math.min(t, next.end);
      next.blendStart = Math.min(next.blendStart, next.start);
    } else if (this.cleanupTimelineDrag.mode === 'end') {
      next.end = Math.max(t, next.start);
      next.blendEnd = Math.max(next.blendEnd, next.end);
    } else if (this.cleanupTimelineDrag.mode === 'blendStart') {
      next.blendStart = Math.min(t, next.start);
    } else if (this.cleanupTimelineDrag.mode === 'blendEnd') {
      next.blendEnd = Math.max(t, next.end);
    }
    this.setCleanupRangeValues(next, 'selection ' + fmt(next.start) + '-' + fmt(next.end));
  }

  drawCleanupTimeline() {
    const canvas = UI.cleanupTimelineCanvas;
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#05080a';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#101820';
    ctx.fillRect(14, rect.height * 0.42, Math.max(1, rect.width - 28), Math.max(26, rect.height * 0.32));
    if (!clip) {
      ctx.fillStyle = '#9fb3bb';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('no clip', 18, 22);
      return;
    }
    const metrics = this.cleanupTimelineMetrics(clip);
    const range = this.cleanupBlendRange(clip);
    const y = metrics.trackY;
    const h = metrics.trackH;
    const xBlendStart = this.timeToCleanupX(range.blendStart, metrics);
    const xStart = this.timeToCleanupX(range.start, metrics);
    const xEnd = this.timeToCleanupX(range.end, metrics);
    const xBlendEnd = this.timeToCleanupX(range.blendEnd, metrics);
    const playX = this.timeToCleanupX(actor.activeAction?.time || 0, metrics);
    ctx.fillStyle = '#18252d';
    ctx.fillRect(metrics.left, y, metrics.width, h);
    ctx.fillStyle = 'rgba(141,218,255,0.18)';
    for (const track of clip.tracks || []) {
      const times = track.times || [];
      const step = Math.max(1, Math.ceil(times.length / 140));
      for (let i = 0; i < times.length; i += step) {
        const x = this.timeToCleanupX(times[i], metrics);
        ctx.fillRect(x, y + 2, 1, h - 4);
      }
    }
    ctx.fillStyle = 'rgba(214,166,66,0.28)';
    ctx.fillRect(xBlendStart, y, Math.max(0, xStart - xBlendStart), h);
    ctx.fillRect(xEnd, y, Math.max(0, xBlendEnd - xEnd), h);
    ctx.fillStyle = 'rgba(210,68,54,0.42)';
    ctx.fillRect(xStart, y, Math.max(1, xEnd - xStart), h);
    ctx.strokeStyle = '#d6a642';
    ctx.lineWidth = 2;
    for (const x of [xBlendStart, xStart, xEnd, xBlendEnd]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y + h + 7);
      ctx.stroke();
    }
    ctx.strokeStyle = '#f8f1dd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, y - 12);
    ctx.lineTo(playX, y + h + 12);
    ctx.stroke();
    ctx.fillStyle = '#d7f6ff';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('blend', xBlendStart + 2, y - 9);
    ctx.fillStyle = '#ffb2a3';
    ctx.fillText('cut', xStart + 2, y + h + 18);
  }

  currentMergePair(preferActiveSource = false) {
    const actor = this.actors.get(this.selected);
    const entries = clipEntries(actor);
    if (!actor || !entries.length) {
      setSelectOptions(UI.cleanupMergeSource, []);
      setSelectOptions(UI.cleanupMergeTarget, []);
      return { actor, entries, sourceClip: null, targetClip: null };
    }
    const activeKey = actor.activeClip() ? clipKey(actor.activeClip()) : '';
    const sourceFallback = preferActiveSource && activeKey ? activeKey : (UI.cleanupMergeSource?.value || activeKey || entries[0].key);
    const sourceKey = setSelectOptions(UI.cleanupMergeSource, entries, sourceFallback);
    const altTarget = entries.find((entry) => entry.key !== sourceKey)?.key || sourceKey;
    let targetKey = setSelectOptions(UI.cleanupMergeTarget, entries, UI.cleanupMergeTarget?.value || altTarget);
    if (targetKey === sourceKey && entries.length > 1) {
      targetKey = altTarget;
      UI.cleanupMergeTarget.value = targetKey;
    }
    return {
      actor,
      entries,
      sourceClip: findClipByKey(actor, sourceKey),
      targetClip: findClipByKey(actor, targetKey),
    };
  }

  mergeRangeForPair(sourceClip, targetClip) {
    const sourceDuration = Math.max(0.001, sourceClip?.duration || 0.001);
    const targetDuration = Math.max(0.001, targetClip?.duration || 0.001);
    let start = clampValue(UI.cleanupMergeStart?.value ?? Math.max(0, sourceDuration - 0.18), 0, sourceDuration);
    let end = clampValue(UI.cleanupMergeEnd?.value ?? sourceDuration, start + 0.001, sourceDuration);
    if (end < start) [start, end] = [end, start];
    return {
      start,
      end,
      sourceDuration,
      targetDuration,
      trimAfterBlend: Boolean(UI.cleanupMergeTrimAfterBlend?.checked),
      outputDuration: Math.max(0.001, (UI.cleanupMergeTrimAfterBlend?.checked ? end : (start + targetDuration))),
      overlap: Math.max(0.001, end - start),
    };
  }

  setMergeRangeValues(values, statusText = '') {
    const { sourceClip, targetClip } = this.currentMergePair();
    if (!sourceClip || !targetClip) return;
    const sourceDuration = Math.max(0.001, sourceClip.duration || 0.001);
    let start = clampValue(values.start ?? UI.cleanupMergeStart?.value, 0, sourceDuration);
    let end = clampValue(values.end ?? UI.cleanupMergeEnd?.value, start + 0.001, sourceDuration);
    if (start > end) [start, end] = [end, start];
    if (UI.cleanupMergeStart) UI.cleanupMergeStart.value = start.toFixed(3);
    if (UI.cleanupMergeEnd) UI.cleanupMergeEnd.value = end.toFixed(3);
    this.updateMergeUi(statusText);
  }

  mergeTimelineMetrics(duration) {
    const canvas = UI.cleanupMergeTimelineCanvas;
    const rect = canvas?.getBoundingClientRect?.() || { width: 1, height: 1, left: 0 };
    const left = 14;
    const right = Math.max(left + 1, rect.width - 14);
    return {
      canvas,
      duration: Math.max(0.001, duration || 0.001),
      rect,
      left,
      right,
      width: Math.max(1, right - left),
      topTrackY: Math.max(10, rect.height * 0.2),
      midTrackY: Math.max(26, rect.height * 0.46),
      trackH: Math.max(14, rect.height * 0.18),
      bottomTrackY: Math.max(42, rect.height * 0.7),
    };
  }

  timeToMergeX(time, metrics) {
    return metrics.left + (clampValue(time, 0, metrics.duration) / metrics.duration) * metrics.width;
  }

  mergeXToTime(clientX, metrics) {
    return clampValue(((clientX - metrics.rect.left - metrics.left) / metrics.width) * metrics.duration, 0, metrics.duration);
  }

  beginMergeTimelineDrag(event) {
    const { sourceClip, targetClip } = this.currentMergePair();
    if (!sourceClip || !targetClip || !UI.cleanupMergeTimelineCanvas) return;
    event.preventDefault();
    const range = this.mergeRangeForPair(sourceClip, targetClip);
    const metrics = this.mergeTimelineMetrics(range.outputDuration);
    const x = event.clientX - metrics.rect.left;
    const handles = [
      { name: 'start', x: this.timeToMergeX(range.start, metrics) },
      { name: 'end', x: this.timeToMergeX(range.end, metrics) },
    ];
    const nearest = handles.reduce((best, item) => Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best, handles[0]);
    this.mergeTimelineDrag = { mode: nearest.name };
    UI.cleanupMergeTimelineCanvas.setPointerCapture?.(event.pointerId);
    const move = (nextEvent) => this.dragMergeTimeline(nextEvent);
    const up = (nextEvent) => {
      UI.cleanupMergeTimelineCanvas.releasePointerCapture?.(nextEvent.pointerId);
      UI.cleanupMergeTimelineCanvas.removeEventListener('pointermove', move);
      UI.cleanupMergeTimelineCanvas.removeEventListener('pointerup', up);
      UI.cleanupMergeTimelineCanvas.removeEventListener('pointercancel', up);
      this.mergeTimelineDrag = null;
    };
    UI.cleanupMergeTimelineCanvas.addEventListener('pointermove', move);
    UI.cleanupMergeTimelineCanvas.addEventListener('pointerup', up);
    UI.cleanupMergeTimelineCanvas.addEventListener('pointercancel', up);
    this.dragMergeTimeline(event);
  }

  dragMergeTimeline(event) {
    const { sourceClip, targetClip } = this.currentMergePair();
    if (!sourceClip || !targetClip || !this.mergeTimelineDrag) return;
    const range = this.mergeRangeForPair(sourceClip, targetClip);
    const metrics = this.mergeTimelineMetrics(range.outputDuration);
    const t = this.mergeXToTime(event.clientX, metrics);
    const next = { start: range.start, end: range.end };
    if (this.mergeTimelineDrag.mode === 'start') next.start = Math.min(t, next.end - 0.001);
    else next.end = Math.max(t, next.start + 0.001);
    this.setMergeRangeValues(next, 'merge blend ' + fmt(next.start) + '-' + fmt(next.end));
  }

  drawMergeTimeline() {
    const canvas = UI.cleanupMergeTimelineCanvas;
    const { sourceClip, targetClip } = this.currentMergePair();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#05080a';
    ctx.fillRect(0, 0, rect.width, rect.height);
    if (!sourceClip || !targetClip) {
      ctx.fillStyle = '#9fb3bb';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('pick two clips to merge', 18, 22);
      return;
    }
    const range = this.mergeRangeForPair(sourceClip, targetClip);
    const metrics = this.mergeTimelineMetrics(range.outputDuration);
    const xSourceEnd = this.timeToMergeX(range.sourceDuration, metrics);
    const xStart = this.timeToMergeX(range.start, metrics);
    const xEnd = this.timeToMergeX(range.end, metrics);
    const xOutputEnd = this.timeToMergeX(range.outputDuration, metrics);
    ctx.fillStyle = '#101820';
    ctx.fillRect(metrics.left, metrics.topTrackY, metrics.width, metrics.trackH);
    ctx.fillRect(metrics.left, metrics.bottomTrackY, metrics.width, metrics.trackH);
    ctx.fillStyle = 'rgba(214,166,66,0.34)';
    ctx.fillRect(metrics.left, metrics.topTrackY, Math.max(1, xSourceEnd - metrics.left), metrics.trackH);
    ctx.fillStyle = 'rgba(141,218,255,0.34)';
    ctx.fillRect(xStart, metrics.bottomTrackY, Math.max(1, xOutputEnd - xStart), metrics.trackH);
    const gradient = ctx.createLinearGradient(xStart, 0, Math.max(xStart + 1, xEnd), 0);
    gradient.addColorStop(0, 'rgba(214,166,66,0.92)');
    gradient.addColorStop(1, 'rgba(141,218,255,0.92)');
    ctx.fillStyle = gradient;
    ctx.fillRect(xStart, metrics.midTrackY, Math.max(1, xEnd - xStart), metrics.trackH);
    ctx.fillStyle = 'rgba(214,166,66,0.22)';
    ctx.fillRect(metrics.left, metrics.midTrackY, Math.max(1, xStart - metrics.left), metrics.trackH);
    ctx.fillStyle = 'rgba(141,218,255,0.22)';
    ctx.fillRect(xEnd, metrics.midTrackY, Math.max(1, xOutputEnd - xEnd), metrics.trackH);
    ctx.strokeStyle = '#d6a642';
    ctx.lineWidth = 2;
    for (const x of [xStart, xEnd]) {
      ctx.beginPath();
      ctx.moveTo(x, metrics.topTrackY - 5);
      ctx.lineTo(x, metrics.bottomTrackY + metrics.trackH + 5);
      ctx.stroke();
    }
    ctx.fillStyle = '#f4ddac';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('A', metrics.left + 3, metrics.topTrackY - 3);
    ctx.fillText('A -> B', metrics.left + 3, metrics.midTrackY - 3);
    ctx.fillText('B', metrics.left + 3, metrics.bottomTrackY - 3);
    ctx.fillStyle = '#d7f6ff';
    ctx.fillText('blend', xStart + 3, metrics.midTrackY + metrics.trackH + 13);
  }

  useActiveClipAsMergeSource() {
    const actor = this.actors.get(this.selected);
    const active = actor?.activeClip();
    if (!actor || !active || !UI.cleanupMergeSource) {
      this.updateMergeUi('play a clip first');
      return;
    }
    UI.cleanupMergeSource.value = clipKey(active);
    this.mergeLastPairKey = '';
    this.updateMergeUi('merge source set to active clip');
  }

  updateMergeUi(statusText = '') {
    const { actor, entries, sourceClip, targetClip } = this.currentMergePair();
    if (!UI.cleanupMergeHint) return;
    if (!actor || !entries.length) {
      if (UI.cleanupMergeStart) UI.cleanupMergeStart.value = '0.000';
      if (UI.cleanupMergeEnd) UI.cleanupMergeEnd.value = '0.000';
      UI.cleanupMergeHint.textContent = statusText || 'load an actor with clips';
      this.drawMergeTimeline();
      return;
    }
    if (!sourceClip || !targetClip) {
      UI.cleanupMergeHint.textContent = statusText || 'pick two clips to merge';
      this.drawMergeTimeline();
      return;
    }
    const pairKey = clipKey(sourceClip) + '->' + clipKey(targetClip);
    const suggestedName = defaultMergeClipName(sourceClip, targetClip);
    if (this.mergeLastPairKey !== pairKey) {
      const previousSuggested = this.mergeLastSuggestedName;
      this.mergeLastPairKey = pairKey;
      this.mergeLastSuggestedName = suggestedName;
      const overlap = Math.max(0.04, Math.min(0.24, sourceClip.duration * 0.35, targetClip.duration * 0.35));
      const end = Math.max(0.001, sourceClip.duration);
      const start = Math.max(0, end - overlap);
      if (UI.cleanupMergeStart) UI.cleanupMergeStart.value = start.toFixed(3);
      if (UI.cleanupMergeEnd) UI.cleanupMergeEnd.value = end.toFixed(3);
      if (UI.cleanupMergeName && (!UI.cleanupMergeName.value.trim() || UI.cleanupMergeName.value === previousSuggested)) UI.cleanupMergeName.value = suggestedName;
    } else if (UI.cleanupMergeName && !UI.cleanupMergeName.value.trim()) {
      UI.cleanupMergeName.value = suggestedName;
    }
    const range = this.mergeRangeForPair(sourceClip, targetClip);
    if (UI.cleanupMergeStart) UI.cleanupMergeStart.value = range.start.toFixed(3);
    if (UI.cleanupMergeEnd) UI.cleanupMergeEnd.value = range.end.toFixed(3);
    const sourceName = sourceClip.userData?.sourceName || sourceClip.name || 'clip-a';
    const targetName = targetClip.userData?.sourceName || targetClip.name || 'clip-b';
    UI.cleanupMergeHint.textContent = statusText || ('merge ' + sourceName + ' -> ' + targetName + ' | overlap ' + fmt(range.overlap) + ' | out ' + fmt(range.outputDuration) + (range.trimAfterBlend ? ' | trim after blend' : ''));
    this.drawMergeTimeline();
  }

  applyCleanupMerge() {
    const { actor, entries, sourceClip, targetClip } = this.currentMergePair();
    if (!actor || !sourceClip || !targetClip) {
      this.updateMergeUi('pick two clips first');
      return;
    }
    if (entries.length < 2 && clipKey(sourceClip) === clipKey(targetClip)) {
      this.updateMergeUi('need a second clip to merge');
      return;
    }
    const range = this.mergeRangeForPair(sourceClip, targetClip);
    const next = buildMergedClip(sourceClip, targetClip, range.start, range.end, {
      fps: clampValue(UI.cleanupFps?.value, 8, 120),
      channels: this.cleanupChannels(),
      trimAfterBlend: range.trimAfterBlend,
      name: String(UI.cleanupMergeName?.value || '').trim(),
    });
    if (!next) {
      this.updateMergeUi('merge failed');
      return;
    }
    const key = actor.addCleanupClip(next);
    this.saveCleanupDraft(actor, next, 'autosave');
    this.saveState();
    this.renderClipButtons();
    this.cleanupLastClipKey = '';
    this.updateCleanupUi('created merge-clips | key=' + key + '\n' + next.userData.mode);
    this.updateMergeUi('created merge ' + (next.userData.sourceName || next.name));
    this.updateReadout();
  }

  applyCleanupEditorMode() {
    const mode = UI.cleanupEditMode?.value || 'delete';
    const kind = mode === 'trim' ? 'trim' : mode === 'smooth' ? 'smooth' : mode === 'resample' ? 'resample' : mode === 'stabilize' ? 'stabilize' : 'delete';
    this.applyCleanupOperation(kind);
  }

  cleanupChannels() {
    return {
      translate: Boolean(UI.cleanupUseTranslate?.checked),
      rotate: Boolean(UI.cleanupUseRotate?.checked),
      scale: Boolean(UI.cleanupUseScale?.checked),
    };
  }

  cleanupRange(clip) {
    const duration = Math.max(0.001, clip?.duration || 0.001);
    const start = clampValue(UI.cleanupStart?.value, 0, duration);
    const end = clampValue(UI.cleanupEnd?.value, 0, duration);
    return { start: Math.min(start, end), end: Math.max(start, end), duration };
  }

  updateCleanupUi(statusText = '') {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!UI.cleanupClipName) return;
    if (!actor || !clip) {
      UI.cleanupClipName.textContent = 'No active clip';
      UI.cleanupTime.textContent = '0.000 / 0.000';
      UI.cleanupStatus.textContent = statusText || 'play a clip to edit';
      this.updateMergeUi(statusText || 'play a clip to edit');
      return;
    }
    const key = clipKey(clip);
    const duration = Math.max(0.001, clip.duration || 0.001);
    if (this.cleanupLastClipKey !== key) {
      this.cleanupLastClipKey = key;
      UI.cleanupStart.value = '0.000';
      UI.cleanupEnd.value = duration.toFixed(3);
      if (UI.cleanupBlendStart) UI.cleanupBlendStart.value = '0.000';
      if (UI.cleanupBlendEnd) UI.cleanupBlendEnd.value = duration.toFixed(3);
      UI.cleanupScrub.value = '0';
    }
    const time = clampValue(actor.activeAction?.time || 0, 0, duration);
    UI.cleanupClipName.textContent = clipLabel(clip) + ' | tracks=' + (clip.tracks?.length || 0) + ' keys=' + clipKeyCount(clip) + ' duration=' + fmt(duration);
    UI.cleanupScrub.max = String(duration);
    UI.cleanupScrub.step = '0.001';
    if (!this.cleanupScrubbing) UI.cleanupScrub.value = String(time);
    UI.cleanupTime.textContent = fmt(Number(UI.cleanupScrub.value || time)) + ' / ' + fmt(duration);
    UI.cleanupPlayPause.textContent = actor.activeAction?.paused ? 'Play' : 'Pause';
    if (UI.cleanupSmoothStrengthValue) UI.cleanupSmoothStrengthValue.textContent = Math.round(Number(UI.cleanupSmoothStrength?.value || 0)) + '%';
    const range = this.cleanupBlendRange(clip);
    UI.cleanupStart.value = range.start.toFixed(3);
    UI.cleanupEnd.value = range.end.toFixed(3);
    if (UI.cleanupBlendStart) UI.cleanupBlendStart.value = range.blendStart.toFixed(3);
    if (UI.cleanupBlendEnd) UI.cleanupBlendEnd.value = range.blendEnd.toFixed(3);
    if (UI.cleanupBlendHint) UI.cleanupBlendHint.textContent = 'blend ' + fmt(range.leftBlend) + ' / ' + fmt(range.rightBlend);
    this.drawCleanupTimeline();
    this.updateMergeUi();
    if (statusText) UI.cleanupStatus.textContent = statusText;
    else if (!UI.cleanupStatus.textContent || UI.cleanupStatus.textContent === 'waiting') UI.cleanupStatus.textContent = 'ready';
    this.renderPoseIndexUi();
  }

  scrubCleanupClip(time) {
    const actor = this.actors.get(this.selected);
    if (!actor?.activeClip()) return;
    actor.seek(time);
    this.updateCleanupUi('scrub ' + fmt(time));
    this.updateReadout();
  }

  toggleCleanupPlayback() {
    const actor = this.actors.get(this.selected);
    if (!actor?.activeAction) return;
    actor.pauseActive(!actor.activeAction.paused);
    this.updateCleanupUi(actor.activeAction.paused ? 'paused' : 'playing');
  }

  setCleanupBoundary(which) {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!clip) return;
    const duration = Math.max(0.001, clip.duration || 0.001);
    const time = clampValue(UI.cleanupScrub?.value ?? actor.activeAction?.time ?? 0, 0, duration);
    if (which === 'start') {
      UI.cleanupStart.value = time.toFixed(3);
      if (UI.cleanupBlendStart) UI.cleanupBlendStart.value = time.toFixed(3);
    } else {
      UI.cleanupEnd.value = time.toFixed(3);
      if (UI.cleanupBlendEnd) UI.cleanupBlendEnd.value = time.toFixed(3);
    }
    this.updateCleanupUi(which === 'start' ? 'in=' + fmt(time) : 'out=' + fmt(time));
  }

  applyCleanupOperation(kind) {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!actor || !clip) {
      this.updateCleanupUi('no active clip');
      return;
    }
    const range = this.cleanupBlendRange(clip);
    const channels = this.cleanupChannels();
    const strength = clampValue(Number(UI.cleanupSmoothStrength?.value || 45) / 100, 0, 1);
    const passes = clampValue(UI.cleanupSmoothPasses?.value, 1, 8);
    const fps = clampValue(UI.cleanupFps?.value, 8, 120);
    let next = null;
    if (kind === 'delete') {
      next = deleteClipRange(clip, range.start, range.end);
      if (next && (range.leftBlend > 0.0005 || range.rightBlend > 0.0005)) {
        const seam = Math.min(range.start, next.duration);
        const blendStart = Math.max(0, seam - range.leftBlend);
        const blendEnd = Math.min(next.duration, seam + range.rightBlend);
        next = smoothClipRange(next, blendStart, blendEnd, { channels, strength: Math.max(strength, 0.55), passes: Math.max(2, Math.round(passes)) });
        next.userData.cleanupOp = 'delete-range-blend';
        next.userData.mode += ' seamBlend=' + fmt(range.leftBlend) + '/' + fmt(range.rightBlend);
      }
    }
    else if (kind === 'trim') next = trimClipRange(clip, range.start, range.end);
    else if (kind === 'smooth') next = smoothClipRange(clip, range.start, range.end, { channels, strength, passes });
    else if (kind === 'smoothAll') next = smoothClipRange(clip, 0, range.duration, { channels, strength, passes });
    else if (kind === 'stabilize') next = stabilizeClip(clip);
    else if (kind === 'resample') next = resampleClip(clip, fps);
    if (!next) {
      this.updateCleanupUi('range too small');
      return;
    }
    const key = actor.addCleanupClip(next);
    this.saveCleanupDraft(actor, next, 'autosave');
    this.saveState();
    this.renderClipButtons();
    this.cleanupLastClipKey = '';
    this.updateCleanupUi('created ' + next.userData.cleanupOp + ' | key=' + key + '\n' + next.userData.mode);
    this.updateReadout();
  }

  restoreCleanupSource() {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    const sourceKey = clip?.userData?.sourceKey;
    if (!actor || !sourceKey || !actor.actions.has(sourceKey)) {
      this.updateCleanupUi('no source clip on current draft');
      return;
    }
    actor.play(sourceKey);
    this.saveState();
    this.renderClipButtons();
    this.cleanupLastClipKey = '';
    this.updateCleanupUi('restored original');
    this.updateReadout();
  }

  setPanel(panel) {
    const nextPanel = panel || 'none';
    this.activePanel = nextPanel;
    for (const button of UI.panelButtons) button.classList.toggle('active', button.dataset.panel === nextPanel);
    for (const [name, element] of Object.entries(UI.panels)) {
      if (element) element.classList.toggle('open', name === nextPanel);
    }
    document.body.classList.toggle('panel-open-info', nextPanel === 'info');
    document.body.classList.toggle('has-open-panel', nextPanel !== 'none');
    if (nextPanel === 'cleanup') this.updateCleanupUi();
    this.saveState();
  }

  renderClipButtons() {
    const actor = this.actors.get(this.selected);
    if (!actor || !UI.clipButtons) return;
    const active = actor.activeAction ? clipKey(actor.activeAction._clip) : '';
    const query = String(actor.clipSearch || UI.clipSearch?.value || '').trim();
    if (UI.clipSearch && UI.clipSearch.value !== query) UI.clipSearch.value = query;
    UI.clipButtons.replaceChildren();
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'stop-clip';
    stop.textContent = 'Stop pose';
    stop.addEventListener('click', () => { actor.stop(); this.saveState(); this.renderClipButtons(); this.updateCleanupUi('stopped'); this.updateReadout(); });
    UI.clipButtons.append(stop);
    const entries = searchableClipEntries(actor.clips).map((entry) => ({ ...entry, key: clipKey(entry.clip) }));
    let visible = [];
    let sf2DefaultCount = 0;
    if (query) {
      visible = searchClipEntries(query, actor.clips, 12).map((entry) => ({ ...entry, key: clipKey(entry.clip) }));
      if (UI.clipHint) UI.clipHint.textContent = 'Search results: ' + visible.length + ' / ' + entries.length;
    } else {
      visible = defaultClipEntries(actor.clips, actor.recentClipKeys, active).map((entry) => ({ ...entry, key: clipKey(entry.clip) }));
      sf2DefaultCount = entries.filter((entry) => isSf2PoseClip(entry.clip)).length;
      if (UI.clipHint) UI.clipHint.textContent = sf2DefaultCount ? 'Showing all ' + sf2DefaultCount + ' generated SF2 poseclips by default' : 'Recent clips: ' + visible.length + ' / ' + entries.length;
    }
    if (sf2DefaultCount) {
      const batch = document.createElement('button');
      batch.type = 'button';
      batch.className = 'empty-clip sf2-clip-label';
      batch.disabled = true;
      batch.textContent = 'SF2 poseclips: ' + sf2DefaultCount + ' generated (default batch)';
      UI.clipButtons.append(batch);
    }
    if (!visible.length) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'empty-clip';
      empty.textContent = 'No clips found';
      UI.clipButtons.append(empty);
      return;
    }
    for (const entry of visible) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.label;
      button.title = entry.key;
      button.dataset.clipKey = entry.key;
      button.classList.toggle('active', entry.key === active);
      button.addEventListener('click', () => {
        actor.play(entry.key);
        this.saveState();
        this.renderClipButtons();
        this.updateCleanupUi();
        this.updateReadout();
      });
      UI.clipButtons.append(button);
    }
  }

  setUiValues(posX, posY, posZ, x, y, z, scale, basisX = 0, basisY = 0, basisZ = 0) {
    UI.posX.value = String(posX);
    UI.posY.value = String(posY);
    UI.posZ.value = String(posZ);
    UI.rotX.value = String(x);
    UI.rotY.value = String(y);
    UI.rotZ.value = String(z);
    UI.scale.value = String(scale);
    UI.basisX.value = String(basisX);
    UI.basisY.value = String(basisY);
    UI.basisZ.value = String(basisZ);
    UI.rotXValue.textContent = String(x);
    UI.rotYValue.textContent = String(y);
    UI.rotZValue.textContent = String(z);
    UI.scaleValue.textContent = String(scale) + '%';
    UI.posXValue.textContent = String(posX);
    UI.posYValue.textContent = String(posY);
    UI.posZValue.textContent = String(posZ);
    UI.basisXValue.textContent = String(basisX);
    UI.basisYValue.textContent = String(basisY);
    UI.basisZValue.textContent = String(basisZ);
  }

  applyUiTransform() {
    this.setUiValues(UI.posX.value, UI.posY.value, UI.posZ.value, UI.rotX.value, UI.rotY.value, UI.rotZ.value, UI.scale.value, UI.basisX.value, UI.basisY.value, UI.basisZ.value);
    const actor = this.actors.get(this.selected);
    if (!actor) return;
    actor.applyTransform({ posX: UI.posX.value, posY: UI.posY.value, posZ: UI.posZ.value, x: UI.rotX.value, y: UI.rotY.value, z: UI.rotZ.value, scale: UI.scale.value, basisX: UI.basisX.value, basisY: UI.basisY.value, basisZ: UI.basisZ.value });
    this.updateReadout();
  }

  updateReadout() {
    const actor = this.actors.get(this.selected);
    if (!actor) return;
    UI.readout.textContent = 'view=' + this.viewMode + '\n' + actor.readout();
    if (UI.diagnostic) UI.diagnostic.textContent = actor.diagnosticLine();
    if (UI.panels.cleanup?.classList.contains('open')) this.updateCleanupUi();
  }

  updateDiagnosticOverlay() {
    const actor = this.actors.get(this.selected);
    if (!actor || !UI.diagnostic) return;
    UI.diagnostic.textContent = actor.diagnosticLine();
    if (UI.panels.info?.classList.contains('open')) UI.readout.textContent = 'view=' + this.viewMode + '\n' + actor.readout();
    if (UI.panels.cleanup?.classList.contains('open')) this.updateCleanupUi();
  }


  visualQaReadFrames(clip) {
    const frames = clip?.userData?.sourceReduction?.spriteFrames || [];
    return frames.map((frame) => ({
      tag: frame.tag || '',
      spriteFrame: Number(frame.spriteFrame || 0),
      time: Number.isFinite(Number(frame.spriteFrame)) ? Number(frame.spriteFrame) / 60 : Number(frame.sourceTime || 0),
    })).filter((frame) => Number.isFinite(frame.time));
  }

  handleVisualQaFrame() {
    if (!this.visualQa?.enabled) return;
    if (!this.actors.size) return;
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeAction?._clip;
    if (this.visualQa.actor && this.selected !== this.visualQa.actor) return;
    const requestedClip = this.visualQa.clip ? this.findClipByName(actor, this.visualQa.clip) : null;
    if (this.visualQa.clip && !requestedClip) return;
    if (requestedClip && clip !== requestedClip) return;
    if (!this.visualQaState.rendered && this.visualQa.beacon) {
      this.visualQaState.rendered = true;
      postVisualQaBeacon('rendered', {
        actor: this.selected || '',
        clip: clip?.name || '',
        clipKey: clip ? clipKey(clip) : '',
        origin: clip?.userData?.origin || '',
        sourceName: clip?.userData?.sourceName || '',
        frameMode: this.visualQa.frameMode || '',
      });
    }
    if (!this.visualQa.capture) return;
    if (this.visualQaState.captured >= this.visualQa.frames) return;
    const now = performance.now();
    if (this.visualQaState.inFlight) return;

    let readFrame = null;
    if (this.visualQa.frameMode === 'read') {
      const readFrames = this.visualQaReadFrames(clip);
      if (!readFrames.length) return;
      const readIndex = Math.min(this.visualQaState.captured, readFrames.length - 1);
      readFrame = readFrames[readIndex];
      actor.seek(readFrame.time);
      this.updateDiagnosticOverlay();
      if (this.controls.enabled) this.controls.update();
      this.renderer.render(this.scene, this.camera);
    } else if (this.visualQaState.captured > 0 && now - this.visualQaState.lastCaptureAt < this.visualQa.intervalMs) {
      return;
    }

    this.visualQaState.inFlight = true;
    const frame = this.visualQaState.captured;
    this.visualQaState.captured += 1;
    this.visualQaState.lastCaptureAt = now;
    postVisualQaCapture(this.renderer.domElement, {
      frame: String(frame),
      actor: this.selected || '',
      clip: clip?.name || '',
      clipKey: clip ? clipKey(clip) : '',
      origin: clip?.userData?.origin || '',
      sourceName: clip?.userData?.sourceName || '',
      tag: readFrame?.tag || '',
      spriteFrame: readFrame ? String(readFrame.spriteFrame) : '',
      poseclipTime: readFrame ? String(readFrame.time.toFixed(5)) : '',
      frameMode: this.visualQa.frameMode || '',
      t: String(Math.round(now)),
    });
    window.setTimeout(() => { this.visualQaState.inFlight = false; }, 0);
  }

  resize() {
    const width = innerWidth;
    const height = innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    for (const actor of this.actors.values()) actor.update(dt);
    this.updateDiagnosticOverlay();
    this.updateFirstPersonCamera();
    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.handleVisualQaFrame();
  }
}

try {
  const lab = new PoseLab();
  lab.start().catch((err) => {
    console.error(err);
    setStatus('failed: ' + (err.message || err));
    UI.readout.textContent = err.stack || String(err);
  });
} catch (err) {
  console.error(err);
  setStatus('webgl failed: ' + (err.message || err));
  UI.readout.textContent = err.stack || String(err);
}
