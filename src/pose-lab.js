import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinnedObject, retargetClip } from 'three/addons/utils/SkeletonUtils.js';
import { applyGodotRestPose } from './godot-rest-poses.js?v=pose-editor-22';
import { RIG_PROFILES, actorTransform, clipOptions } from './rig-profiles.js?v=pose-editor-22';
import { preferSavedClipForActor } from './startup-policy.js?v=pose-editor-22';
import { resolveLabMode } from './lab-mode.mjs?v=pose-editor-22';
import { clipLabel, defaultClipEntries, isSf2PoseClip, searchableClipEntries, searchClipEntries } from './clip-search.js?v=pose-editor-22';

const LAB_BUILD = 'clean-sf2';
const LAB_MODE = resolveLabMode(window.location.search || '');
const STATUS_PREFIX = LAB_MODE === 'critique' ? 'critique' : 'lab';

const ACTORS = RIG_PROFILES;
const STORAGE_KEY = 'pose-lab:last-state:v1';
const CLEANUP_DRAFTS_KEY = 'pose-lab:cleanup-drafts:v1';
const CRITIQUE_NOTES_KEY = 'pose-lab:critique-notes:v1';
const POSE_CORRECTIONS_KEY = 'pose-lab:pose-corrections:v1';
const POSE_HISTORY_KEY = 'pose-lab:pose-history:v1';
const POSE_HISTORY_LIMIT = 80;
const CRITIQUE_STEP_FPS = 30;
const CRITIQUE_LIVE_FPS = 60;
const PHONE_SHEET_PANELS = ['clips', 'pose', 'edit', 'bones', 'advanced', 'view'];
const CLEANUP_SHEET_PANELS = new Set(['pose', 'edit', 'advanced', 'cleanup']);
const TOUCH_POSE_DRAG_THRESHOLD = 8;
const TOUCH_POSE_FK_MIN_RADIUS = 12;
const TOUCH_POSE_ROTATION_PAN_SPEED = 0.0045;
const TOUCH_POSE_ROLL_DEADZONE = 0.045;
const TOUCH_POSE_ROLL_PAN_DEADZONE = 14.0;
const TOUCH_POSE_DOUBLE_TAP_MS = 360;
const TOUCH_POSE_DOUBLE_TAP_PX = 32;
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

function debugBridgeConfig() {
  const params = new URLSearchParams(window.location.search || '');
  const enabled = params.get('debugBridge') === '1' || params.get('debugBridge') === 'true' || Boolean(params.get('debugBridgeUrl'));
  const url = String(params.get('debugBridgeUrl') || '').trim().replace(/\/$/, '');
  return {
    enabled,
    url,
    label: String(params.get('debugLabel') || 'pose-lab-debug'),
    timeoutMs: Math.max(2000, Number(params.get('debugBridgeTimeoutMs') || 15000)),
    pollMs: Math.max(100, Number(params.get('debugBridgePollMs') || 250)),
  };
}

function splitDebugCommand(input) {
  const text = String(input || '').trim();
  if (!text) return [];
  const parts = [];
  let token = '';
  let quote = '';
  let escaped = false;
  for (const char of text) {
    if (escaped) {
      token += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        token += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (token) {
        parts.push(token);
        token = '';
      }
      continue;
    }
    token += char;
  }
  if (token) parts.push(token);
  return parts;
}

function normalizeDebugCommand(input) {
  if (typeof input === 'string') {
    const parts = splitDebugCommand(input);
    return { name: String(parts[0] || '').trim().toLowerCase(), args: parts.slice(1), raw: input };
  }
  if (input && typeof input === 'object') {
    const name = String(input.name || input.command || input.cmd || '').trim().toLowerCase();
    const args = Array.isArray(input.args) ? input.args.map((value) => String(value)) : splitDebugCommand(String(input.text || input.command || ''));
    return { name, args: input.args ? args : args.slice(1), raw: String(input.raw || input.text || input.command || ''), payload: input };
  }
  return { name: '', args: [], raw: '' };
}

function debugValueString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
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
  playerTransportLabel: document.getElementById('playerTransportLabel'),
  playerPrevFrame: document.getElementById('playerPrevFrame'),
  playerPlayPause: document.getElementById('playerPlayPause'),
  playerNextFrame: document.getElementById('playerNextFrame'),
  playerClipPanel: document.getElementById('playerClipPanel'),
  playerPoseControls: document.getElementById('playerPoseControls'),
  playerStop: document.getElementById('playerStop'),
  critiqueFrameButtons: document.getElementById('critiqueFrameButtons'),
  critiqueResetPose: document.getElementById('critiqueResetPose'),
  critiqueNewKey: document.getElementById('critiqueNewKey'),
  critiqueCompare: document.getElementById('critiqueCompare'),
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
  critiqueStepMode: document.getElementById('critiqueStepMode'),
  critiqueLiveMode: document.getElementById('critiqueLiveMode'),
  critiqueLoopMode: document.getElementById('critiqueLoopMode'),
  critiquePingPongMode: document.getElementById('critiquePingPongMode'),
  critiquePrevFrame: document.getElementById('critiquePrevFrame'),
  critiqueNextFrame: document.getElementById('critiqueNextFrame'),
  critiquePrevKeyframe: document.getElementById('critiquePrevKeyframe'),
  critiqueNextKeyframe: document.getElementById('critiqueNextKeyframe'),
  critiquePlayPause: document.getElementById('critiquePlayPause'),
  critiqueJumpStart: document.getElementById('critiqueJumpStart'),
  critiqueJumpAnticipation: document.getElementById('critiqueJumpAnticipation'),
  critiqueJumpContact: document.getElementById('critiqueJumpContact'),
  critiqueJumpRecovery: document.getElementById('critiqueJumpRecovery'),
  critiqueJumpEnd: document.getElementById('critiqueJumpEnd'),
  critiqueScrub: document.getElementById('critiqueScrub'),
  critiqueFrameSummary: document.getElementById('critiqueFrameSummary'),
  critiqueFrameLabel: document.getElementById('critiqueFrameLabel'),
  critiqueFrameStatus: document.getElementById('critiqueFrameStatus'),
  critiqueComment: document.getElementById('critiqueComment'),
  critiqueMarks: document.getElementById('critiqueMarks'),
  critiqueBones: document.getElementById('critiqueBones'),
  critiqueSaveNote: document.getElementById('critiqueSaveNote'),
  critiqueClearNote: document.getElementById('critiqueClearNote'),
  critiqueCopyNote: document.getElementById('critiqueCopyNote'),
  critiqueLog: document.getElementById('critiqueLog'),
  critiqueDock: document.getElementById('critiqueDock'),
  touchPoseHud: document.getElementById('touchPoseHud'),
  touchPoseLabel: document.getElementById('touchPoseLabel'),
  touchPoseMode: document.getElementById('touchPoseMode'),
  touchPoseUndo: document.getElementById('touchPoseUndo'),
  touchPoseRedo: document.getElementById('touchPoseRedo'),
  touchPoseSave: document.getElementById('touchPoseSave'),
  touchPoseReset: document.getElementById('touchPoseReset'),
  touchPoseCancel: document.getElementById('touchPoseCancel'),
  touchPoseModeToggle: document.getElementById('touchPoseModeToggle'),
  touchPosePose: document.getElementById('touchPosePose'),
  touchPoseClips: document.getElementById('touchPoseClips'),
  touchPoseDockHandle: document.getElementById('touchPoseDockHandle'),
  poseEditDock: document.getElementById('poseEditDock'),
  poseBoneSearch: document.getElementById('poseBoneSearch'),
  poseBoneSelect: document.getElementById('poseBoneSelect'),
  poseModeIk: document.getElementById('poseModeIk'),
  poseModeFk: document.getElementById('poseModeFk'),
  poseSpaceGlobal: document.getElementById('poseSpaceGlobal'),
  poseSpaceLocal: document.getElementById('poseSpaceLocal'),
  poseNudgeX: document.getElementById('poseNudgeX'),
  poseNudgeY: document.getElementById('poseNudgeY'),
  poseNudgeZ: document.getElementById('poseNudgeZ'),
  poseRotX: document.getElementById('poseRotX'),
  poseRotY: document.getElementById('poseRotY'),
  poseRotZ: document.getElementById('poseRotZ'),
  poseScale: document.getElementById('poseScale'),
  poseUseScale: document.getElementById('poseUseScale'),
  poseNudgeXValue: document.getElementById('poseNudgeXValue'),
  poseNudgeYValue: document.getElementById('poseNudgeYValue'),
  poseNudgeZValue: document.getElementById('poseNudgeZValue'),
  poseRotXValue: document.getElementById('poseRotXValue'),
  poseRotYValue: document.getElementById('poseRotYValue'),
  poseRotZValue: document.getElementById('poseRotZValue'),
  poseScaleValue: document.getElementById('poseScaleValue'),
  poseSaveKey: document.getElementById('poseSaveKey'),
  poseResetKey: document.getElementById('poseResetKey'),
  poseResetClip: document.getElementById('poseResetClip'),
  poseCompareOverlay: document.getElementById('poseCompareOverlay'),
  poseEditStatus: document.getElementById('poseEditStatus'),
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

function screenPointForWorld(world, camera, rect) {
  const projected = world.clone().project(camera);
  return {
    x: rect.left + ((projected.x + 1) * 0.5 * rect.width),
    y: rect.top + ((1 - projected.y) * 0.5 * rect.height),
    z: projected.z,
  };
}

function distanceToScreenSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clampValue(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1);
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  return Math.hypot(point.x - x, point.y - y);
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

function pinnedHingeTarget(anchorWorld, endpointWorld, targetWorld) {
  const restVector = endpointWorld.clone().sub(anchorWorld);
  const length = restVector.length();
  if (!Number.isFinite(length) || length < 0.000001) return endpointWorld.clone();
  const targetVector = targetWorld.clone().sub(anchorWorld);
  if (!Number.isFinite(targetVector.lengthSq()) || targetVector.lengthSq() < 0.000001) return endpointWorld.clone();
  return anchorWorld.clone().add(targetVector.normalize().multiplyScalar(length));
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

function lerpValue(a, b, t) {
  return Number(a || 0) + (Number(b || 0) - Number(a || 0)) * clampValue(t, 0, 1);
}

function smoothStepValue(t) {
  const x = clampValue(t, 0, 1);
  return x * x * (3 - (2 * x));
}

function isEndpointBoneName(name) {
  return isIkControlBoneName(name);
}

function isIkControlBoneName(name) {
  const value = String(name || '').toLowerCase();
  if (!/hand|foot/.test(value)) return false;
  if (/toe|finger|thumb|index|middle|ring|pinky|hitbox|end/.test(value)) return false;
  const token = value.split(/[:_.\-\s]+/).filter(Boolean).pop() || value;
  return token === 'hand' || token === 'lefthand' || token === 'righthand' || token === 'foot' || token === 'leftfoot' || token === 'rightfoot';
}

function isTouchPoseSelectableBoneName(name) {
  const value = String(name || '').toLowerCase();
  if (!value) return false;
  if (/toe|finger|thumb|index|middle|ring|pinky|hitbox|end/.test(value)) return false;
  return true;
}

function fkBoneRole(name) {
  const value = String(name || '').toLowerCase().replace(/^mixamorig[:_]?/, '');
  if (/upleg|upperleg|thigh/.test(value)) return 'upperLeg';
  if (/(^|[^a-z])leg$|lowerleg|shin|calf/.test(value)) return 'lowerLeg';
  if (/foot/.test(value)) return 'foot';
  if (/(^|[^a-z])arm$|upperarm/.test(value)) return 'upperArm';
  if (/forearm|lowerarm/.test(value)) return 'forearm';
  if (/hand/.test(value)) return 'hand';
  if (/spine|chest|hips|pelvis/.test(value)) return 'spine';
  if (/neck|head/.test(value)) return 'head';
  return 'generic';
}

function safeNormalizedVector(vector) {
  if (!vector || vector.lengthSq() < 0.000001) return null;
  return vector.clone().normalize();
}

function orthogonalizeAgainstTwist(axis, twist) {
  if (!axis || !twist) return null;
  const projection = axis.clone().sub(twist.clone().multiplyScalar(axis.dot(twist)));
  return safeNormalizedVector(projection);
}

function synthesizeOrthogonalAxis(twist) {
  const referenceVectors = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  let best = null;
  let bestDot = Infinity;
  for (const reference of referenceVectors) {
    const dot = Math.abs(reference.dot(twist));
    if (dot < bestDot) {
      bestDot = dot;
      best = reference;
    }
  }
  if (!best) return null;
  return safeNormalizedVector(best.clone().cross(twist)) || safeNormalizedVector(twist.clone().cross(best));
}

function avoidLongitudinalTwist(axis, twistAxisWorld, fallbackAxis = null) {
  const normalized = safeNormalizedVector(axis);
  const twist = safeNormalizedVector(twistAxisWorld);
  if (!normalized) {
    const fallback = safeNormalizedVector(fallbackAxis);
    return fallback && twist ? orthogonalizeAgainstTwist(fallback, twist) || synthesizeOrthogonalAxis(twist) : fallback;
  }
  if (!twist) return normalized;
  const projected = orthogonalizeAgainstTwist(normalized, twist);
  if (projected) return projected;
  const fallback = safeNormalizedVector(fallbackAxis);
  if (fallback) {
    const projectedFallback = orthogonalizeAgainstTwist(fallback, twist);
    if (projectedFallback) return projectedFallback;
  }
  return synthesizeOrthogonalAxis(twist);
}

function createRigifyOutlineGeometry(points) {
  return new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point[0], point[1], point[2] || 0)));
}

function createRigifyCircleGeometry(radius = 0.145, segments = 40) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0]);
  }
  return createRigifyOutlineGeometry(points);
}

function createRigifyFootGeometry(width = 0.27, height = 0.12) {
  const w = width / 2;
  const h = height / 2;
  return createRigifyOutlineGeometry([[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]]);
}

function poseEditDefaults() {
  return {
    mode: 'fk',
    space: 'local',
    x: 0,
    y: 0,
    z: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    worldQuat: null,
    axisMode: '',
    axisWorld: null,
    angle: 0,
    gestureKind: '',
    scale: 100,
    useScale: false,
  };
}

function blendPoseEdit(left = {}, right = {}, alpha = 0) {
  const t = smoothStepValue(alpha);
  const base = poseEditDefaults();
  return {
    ...base,
    ...left,
    mode: right.mode || left.mode || base.mode,
    space: right.space || left.space || base.space,
    x: lerpValue(left.x, right.x, t),
    y: lerpValue(left.y, right.y, t),
    z: lerpValue(left.z, right.z, t),
    rotX: lerpValue(left.rotX, right.rotX, t),
    rotY: lerpValue(left.rotY, right.rotY, t),
    rotZ: lerpValue(left.rotZ, right.rotZ, t),
    worldQuat: t >= 0.5 ? (right.worldQuat || null) : (left.worldQuat || null),
    axisMode: t >= 0.5 ? (right.axisMode || '') : (left.axisMode || ''),
    axisWorld: t >= 0.5 ? (right.axisWorld || null) : (left.axisWorld || null),
    angle: lerpValue(left.angle, right.angle, t),
    gestureKind: t >= 0.5 ? (right.gestureKind || '') : (left.gestureKind || ''),
    scale: lerpValue(left.scale ?? 100, right.scale ?? 100, t),
    useScale: Boolean(left.useScale || right.useScale),
  };
}


function poseEditHasMeaningfulValue(edit = {}) {
  if (!edit) return false;
  if (edit.mode === 'hinge' && String(edit.axisMode || '') === 'pinned-parent-screen-target') return true;
  if (Array.isArray(edit.worldQuat) && edit.worldQuat.length === 4) return true;
  if (Math.abs(Number(edit.x || 0)) > 0.000001) return true;
  if (Math.abs(Number(edit.y || 0)) > 0.000001) return true;
  if (Math.abs(Number(edit.z || 0)) > 0.000001) return true;
  if (Math.abs(Number(edit.rotX || 0)) > 0.000001) return true;
  if (Math.abs(Number(edit.rotY || 0)) > 0.000001) return true;
  if (Math.abs(Number(edit.rotZ || 0)) > 0.000001) return true;
  if (Math.abs(Number(edit.angle || 0)) > 0.000001) return true;
  if (edit.useScale) return true;
  return false;
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
function wrapRadians(value) { return THREE.MathUtils.euclideanModulo(Number(value) + Math.PI, Math.PI * 2) - Math.PI; }
function setStatus(text) { const next = STATUS_PREFIX + ' ' + LAB_BUILD + ' | ' + text; UI.status.textContent = next; UI.loadState.textContent = next; }
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
    this.showDebugHelpers = false;
    this.bones = [];
    this.boneByName = new Map();
    this.boneRest = new Map();
    this.boneEdits = new Map();
    this.boneHandles = new Map();
    this.boneLines = new Map();
    this.touchRigControls = new Map();
    this.showTouchRigControls = false;
    this.touchRigControlGroup = new THREE.Group();
    this.touchRigControlGroup.name = this.key + '-touch-rig-controls';
    this.root.add(this.touchRigControlGroup);
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
    this.createTouchRigControls();
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

  setTouchRigControlsVisible(visible) {
    this.showTouchRigControls = Boolean(visible);
    this.updateTouchRigControls();
  }

  createTouchRigControls() {
    const handHitGeometry = new THREE.SphereGeometry(0.18, 12, 8);
    const footHitGeometry = new THREE.BoxGeometry(0.32, 0.18, 0.12);
    const handOutlineGeometry = createRigifyCircleGeometry(0.145, 40);
    const footOutlineGeometry = createRigifyFootGeometry(0.28, 0.13);
    for (const bone of this.bones) {
      if (!isIkControlBoneName(bone.name)) continue;
      const isFoot = /foot/i.test(bone.name || '');
      const color = isFoot ? 0x62f2b5 : 0xffcc3d;
      const hitMaterial = new THREE.MeshBasicMaterial({
        color,
        depthTest: false,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
      });
      const outlineMaterial = new THREE.LineBasicMaterial({
        color,
        depthTest: false,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
      });
      const control = new THREE.Mesh(isFoot ? footHitGeometry : handHitGeometry, hitMaterial);
      control.name = this.key + '-ik-hit-' + bone.name;
      control.userData.actorKey = this.key;
      control.userData.boneName = bone.name;
      control.userData.controlKind = 'ik';
      control.userData.rigifyControl = isFoot ? 'foot-square' : 'hand-circle';
      control.renderOrder = 86;
      const outline = new THREE.LineLoop(isFoot ? footOutlineGeometry : handOutlineGeometry, outlineMaterial);
      outline.name = this.key + '-ik-outline-' + bone.name;
      outline.userData.actorKey = this.key;
      outline.userData.boneName = bone.name;
      outline.userData.controlKind = 'ik-outline';
      outline.renderOrder = 87;
      control.add(outline);
      this.touchRigControlGroup.add(control);
      this.touchRigControls.set(bone.name, control);
    }
    this.updateTouchRigControls();
  }

  updateTouchRigControls() {
    for (const [name, control] of this.touchRigControls) {
      const bone = this.boneByName.get(name);
      if (!bone) {
        control.visible = false;
        continue;
      }
      const world = bone.getWorldPosition(new THREE.Vector3());
      const offset = /left/i.test(name) ? -0.16 : /right/i.test(name) ? 0.16 : 0.12;
      world.x += offset;
      world.y += /foot/i.test(name) ? 0.055 : 0.035;
      control.position.copy(this.root.worldToLocal(world));
      control.visible = this.showTouchRigControls;
      if (!this.showTouchRigControls) continue;
      const selected = name === this.selectedBoneName && this.selectedTouchControl?.kind === 'ik';
      control.scale.setScalar(selected ? 1.85 : 1.55);
      control.material.opacity = selected ? 0.72 : 0.5;
      const outline = control.children.find((child) => child.isLineLoop);
      if (outline?.material) {
        outline.material.opacity = selected ? 1 : 0.88;
        outline.material.linewidth = selected ? 3 : 2;
      }
    }
  }

  selectBone(name) {
    if (!this.boneByName.has(name)) return false;
    this.selectedBoneName = name;
    this.refreshBoneOverlayMaterials();
    return true;
  }

  deselectBone() {
    this.selectedBoneName = '';
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
    if (!this.activeAction) {
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion);
      bone.scale.copy(rest.scale);
    }
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

  ikChainForEndpoint(name) {
    const endpoint = this.boneByName.get(name);
    if (!endpoint?.parent?.isBone || !endpoint.parent.parent?.isBone) return null;
    const lower = endpoint.parent;
    const upper = lower.parent;
    if (!upper?.isBone || !lower?.isBone) return null;
    return { upper, lower, endpoint };
  }

  poseOffsetVector(edit = {}, bone = null) {
    const offset = new THREE.Vector3(Number(edit.x || 0) / 100, Number(edit.y || 0) / 100, Number(edit.z || 0) / 100);
    if (edit.space === 'local' && bone) offset.applyQuaternion(worldQuaternionOf(bone));
    return offset;
  }

  applyPoseFkEdit(name, edit = {}) {
    const bone = this.boneByName.get(name);
    if (!bone) return false;
    const offset = new THREE.Vector3(Number(edit.x || 0) / 100, Number(edit.y || 0) / 100, Number(edit.z || 0) / 100);
    if (offset.lengthSq() > 0.0000001) {
      if (edit.space === 'global' && bone.parent) {
        const targetWorld = worldPositionOf(bone).add(offset);
        bone.parent.worldToLocal(targetWorld);
        bone.position.copy(targetWorld);
      } else {
        bone.position.add(offset);
      }
    }
    if (Array.isArray(edit.worldQuat) && edit.worldQuat.length === 4) {
      const worldQuat = new THREE.Quaternion().fromArray(edit.worldQuat).normalize();
      setBoneWorldQuaternion(bone, worldQuat);
    } else {
      const rotation = new THREE.Euler(degToRad(edit.rotX || 0), degToRad(edit.rotY || 0), degToRad(edit.rotZ || 0), bone.rotation.order || 'XYZ');
      const delta = new THREE.Quaternion().setFromEuler(rotation);
      if (Math.abs(delta.x) + Math.abs(delta.y) + Math.abs(delta.z) > 0.000001) {
        if (edit.space === 'global') setBoneWorldQuaternion(bone, delta.multiply(worldQuaternionOf(bone)).normalize());
        else bone.quaternion.multiply(delta).normalize();
      }
    }
    if (edit.useScale) bone.scale.multiplyScalar(Math.max(0.01, Number(edit.scale || 100) / 100));
    bone.updateMatrixWorld(true);
    return true;
  }

  applyPoseIkEdit(name, edit = {}) {
    const chain = this.ikChainForEndpoint(name);
    if (!chain) return this.applyPoseFkEdit(name, { ...edit, mode: 'fk' });
    this.model.updateMatrixWorld(true);
    const target = worldPositionOf(chain.endpoint).add(this.poseOffsetVector(edit, chain.endpoint));
    solveTwoBoneIk(this.model, chain.upper, chain.lower, chain.endpoint, target, 7);
    this.model.updateMatrixWorld(true);
    return true;
  }

  applyPosePinnedHingeEdit(name, edit = {}) {
    const endpoint = this.boneByName.get(name);
    const driver = endpoint?.parent?.isBone ? endpoint.parent : null;
    if (!endpoint || !driver) return this.applyPoseFkEdit(name, { ...edit, mode: 'fk' });
    this.model.updateMatrixWorld(true);
    const anchorWorld = worldPositionOf(driver);
    const endpointWorld = worldPositionOf(endpoint);
    const targetWorld = endpointWorld.clone().add(this.poseOffsetVector(edit, endpoint));
    const clampedTarget = pinnedHingeTarget(anchorWorld, endpointWorld, targetWorld);
    rotateIkJointToward(driver, endpoint, clampedTarget, 1);
    this.model.updateMatrixWorld(true);
    return true;
  }

  resetPoseCorrectionBase() {
    if (this.activeAction) {
      const clip = this.activeAction._clip;
      const duration = Math.max(0.001, clip?.duration || 0.001);
      this.activeAction.time = clampValue(this.activeAction.time || 0, 0, duration);
      this.mixer.update(0);
    }
    this.reapplyBoneEdits();
    this.applyGrounding();
    this.model.updateMatrixWorld(true);
  }

  applyPoseCorrection(correction = {}) {
    const edits = correction.edits || {};
    for (const [name, edit] of Object.entries(edits)) {
      if (!isTouchPoseSelectableBoneName(name)) continue;
      if (!poseEditHasMeaningfulValue(edit)) continue;
      if (edit.mode === 'hinge') this.applyPosePinnedHingeEdit(name, edit);
      else if (edit.mode === 'ik') this.applyPoseIkEdit(name, edit);
      else this.applyPoseFkEdit(name, edit);
    }
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
      marker.visible = false;
      this.root.add(marker);
      this.debugMarkers.set(spec.name, marker);

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: spec.color, depthTest: false, transparent: true, opacity: 0.85 })
      );
      line.name = this.key + '-' + spec.label + '-drop-line';
      line.renderOrder = 19;
      line.visible = false;
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
      marker.visible = this.showDebugHelpers;
      line.visible = this.showDebugHelpers;
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
    this.updateTouchRigControls();
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
    if (!this.applyCritiqueClipState(next._clip)) this.resetAllBoneEdits();
    this.mixer.setTime(0);
    this.applyGrounding();
    this.updateDebugHelpers();
    this.updateBoneOverlay();
    this.rememberClip(name);
  }

  applyCritiqueClipState(clip) {
    const critique = clip?.userData?.critique;
    const edits = Array.isArray(critique?.boneEdits) ? critique.boneEdits : [];
    if (!edits.length) return false;
    this.resetAllBoneEdits();
    for (const entry of edits) {
      const boneName = entry?.boneName || entry?.name;
      if (!boneName) continue;
      this.applyBoneEdit(boneName, entry);
    }
    return true;
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
    this.labMode = LAB_MODE;
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
    this.critiqueTransportMode = 'step';
    this.critiqueFrameKey = '';
    this.critiqueNotes = this.readCritiqueNotes();
    this.poseCorrections = this.readPoseCorrections();
    this.poseHistory = this.readPoseHistory();
    this.poseEditorMode = 'fk';
    this.poseEditorSpace = 'global';
    this.poseCorrectionSessionActive = false;
    this.poseOverlayEnabled = false;
    this.startupReady = false;
    this.critiqueNoteSaveTimer = null;
    this.critiqueCompareState = null;
    this.selectedTouchControl = null;
    this.touchPoseDrag = null;
    this.activeTouchPointers = new Map();
    this.multiTouchPoseGesture = null;
    this.touchPoseDockDrag = null;
    this.lastTouchPoseTap = null;
    this.mergeLastPairKey = '';
    this.mergeLastSuggestedName = '';
    this.mergeTimelineDrag = null;
    this.poseIndexStore = new Map();
    this.poseIndexStatusText = 'waiting';
    this.attackMetadata = new Map();
    this.selected = 'player';
    this.viewMode = 'orbit';
    this.activePanel = this.labMode === 'critique' ? 'none' : 'clips';
    this.isRestoringState = false;
    this.stateSaveTimer = null;
    this.savedState = this.visualQa?.enabled ? {} : this.readSavedState();
    this.debugBridge = debugBridgeConfig();
    this.debugBridgeState = { enabled: this.debugBridge.enabled, connected: false, clientId: '', lastCommand: '', lastCommandId: '', lastResult: null, lastError: '', syncAt: 0 };
    this.installDebugConsole();
  }

  async start() {
    document.title = this.labMode === 'critique' ? 'Pose Critique' : 'Pose Lab';
    document.body.classList.toggle('critique-mode', this.labMode === 'critique');
    document.body.classList.toggle('phone-controls', true);
    this.setupScene();
    this.setupUi();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
    await this.loadActors();
    await this.loadAttackMetadata();
    this.renderActorTabs();
    this.renderCritiqueFrames();
    this.updateCritiqueDock(true);
    this.isRestoringState = true;
    this.selectStartupActor();
    this.applySavedLayoutState();
    this.isRestoringState = false;
    this.startupReady = true;
    this.saveState();
    void this.startDebugBridge();
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
    if (this.labMode === 'critique') return fallback === 'clips' ? 'clips' : 'none';
    const panel = this.savedState?.activeSheet || this.savedState?.activePanel || this.savedState?.panel || '';
    if (panel === 'none' || UI.panels[this.panelElementName(panel)]) return panel;
    return fallback;
  }

  applySavedActorState(actor) {
    if (!actor || this.visualQa?.enabled) return;
    const searches = this.savedState?.clipSearches || {};
    if (Object.prototype.hasOwnProperty.call(searches, actor.key)) actor.clipSearch = String(searches[actor.key] || '');
    else if (this.savedState?.actorKey === actor.key && this.savedState?.clipSearch) actor.clipSearch = String(this.savedState.clipSearch || '');
  }

  applySavedLayoutState() {
    if (this.visualQa?.enabled || !this.savedState) return;
    if (['step', 'live', 'loop', 'pingpong'].includes(this.savedState.critiqueTransportMode)) {
      this.critiqueTransportMode = this.savedState.critiqueTransportMode;
      this.critiqueApplyPlaybackMode();
      this.updateCritiqueTransportUi('restored ' + this.critiqueTransportMode);
    }
    const dockState = this.savedState.dockState || {};
    if (UI.critiqueDock && typeof dockState.critiqueDockOpen === 'boolean') UI.critiqueDock.open = dockState.critiqueDockOpen;
    if (UI.poseEditDock && typeof dockState.poseEditDockOpen === 'boolean') UI.poseEditDock.open = dockState.poseEditDockOpen;
    this.applyTouchPoseDockPosition(dockState.touchPoseDockPosition);
    if (this.savedState?.actorKey === this.selected) this.applySavedViewAngle(this.savedState.viewAngle);
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
      activeSheet: this.activePanel || 'clips',
      viewMode: this.viewMode,
      viewAngle: this.captureViewAngle(),
      clipKey: clip ? clipKey(clip) : '',
      clipName: clip?.name || '',
      origin: clip?.userData?.origin || '',
      sourceName: clip?.userData?.sourceName || '',
      clipSearch: actor?.clipSearch || '',
      clipSearches: this.actorSearchState(),
      critiqueTransportMode: this.critiqueTransportMode || 'step',
      dockState: {
        critiqueDockOpen: Boolean(UI.critiqueDock?.open),
        poseEditDockOpen: Boolean(UI.poseEditDock?.open),
        touchPoseDockPosition: this.captureTouchPoseDockPosition(),
      },
      critiqueFrameKey: this.critiqueFrameKey || '',
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
    const fallbackPanel = this.labMode === 'critique' ? 'none' : (actor.info?.startupPanel || (UI.panels.cleanup?.classList.contains('open') ? 'cleanup' : 'clips'));
    this.setPanel(options.restoreSavedUi ? this.savedPanelForActor(key, fallbackPanel) : fallbackPanel);
    if (options.restoreSavedUi && this.savedState?.actorKey === key) this.applySavedViewAngle(this.savedState.viewAngle);
    this.updateCleanupUi(clip ? 'loaded ' + actor.info.label + ' | ' + clipLabel(clip) : 'loaded ' + actor.info.label);
    this.critiqueLoadSavedStateFromClip(actor, clip);
    this.updateCritiqueTransportUi();
    this.updatePlayerTransportUi();
    this.updatePoseEditorUi();
    this.updateCritiqueDock(true);
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
    for (const details of document.querySelectorAll('details.exclusive-accordion')) {
      details.addEventListener('toggle', () => {
        this.queueStateSave();
        if (!details.open) return;
        for (const other of document.querySelectorAll('details.exclusive-accordion')) {
          if (other !== details) other.open = false;
        }
      });
    }
    this.primeExclusiveAccordionState();
    UI.playerPlayPause?.addEventListener('click', () => (this.labMode === 'critique' ? this.critiqueTogglePlayback() : this.toggleCleanupPlayback()));
    UI.playerPrevFrame?.addEventListener('click', () => this.stepActiveClipFrames(-1));
    UI.playerNextFrame?.addEventListener('click', () => this.stepActiveClipFrames(1));
    UI.playerClipPanel?.addEventListener('click', () => this.setPanel(this.activePanel === 'clips' ? 'none' : 'clips'));
    UI.playerPoseControls?.addEventListener('click', () => this.openCorrectPose());
    UI.playerStop?.addEventListener('click', () => { const actor = this.actors.get(this.selected); if (!actor) return; actor.stop(); this.renderClipButtons(); this.updateCleanupUi('stopped'); this.updateCritiqueTransportUi('stopped'); this.updatePlayerTransportUi('stopped'); this.updateReadout(); });
    UI.critiqueStepMode?.addEventListener('click', () => this.critiqueSetTransportMode('step'));
    UI.critiqueLiveMode?.addEventListener('click', () => this.critiqueSetTransportMode('live'));
    UI.critiqueLoopMode?.addEventListener('click', () => this.critiqueSetTransportMode('loop'));
    UI.critiquePingPongMode?.addEventListener('click', () => this.critiqueSetTransportMode('pingpong'));
    UI.critiquePrevFrame?.addEventListener('click', () => this.critiqueSeekFrame((this.critiqueTimelineState()?.currentFrame || 0) - 1));
    UI.critiqueNextFrame?.addEventListener('click', () => this.critiqueSeekFrame((this.critiqueTimelineState()?.currentFrame || 0) + 1));
    UI.critiquePrevKeyframe?.addEventListener('click', () => this.critiqueStepKeyframe(-1));
    UI.critiqueNextKeyframe?.addEventListener('click', () => this.critiqueStepKeyframe(1));
    UI.critiquePlayPause?.addEventListener('click', () => this.critiqueTogglePlayback());
    UI.critiqueJumpStart?.addEventListener('click', () => this.critiqueJumpSemantic('start'));
    UI.critiqueJumpAnticipation?.addEventListener('click', () => this.critiqueJumpSemantic('anticipation'));
    UI.critiqueJumpContact?.addEventListener('click', () => this.critiqueJumpSemantic('contact'));
    UI.critiqueJumpRecovery?.addEventListener('click', () => this.critiqueJumpSemantic('recovery'));
    UI.critiqueJumpEnd?.addEventListener('click', () => this.critiqueJumpSemantic('end'));
    UI.critiqueScrub?.addEventListener('input', () => this.critiqueSeekFrame(Math.round(Number(UI.critiqueScrub.value || 0) * CRITIQUE_STEP_FPS)));
    UI.critiqueResetPose?.addEventListener('click', () => this.openCorrectPose());
    UI.critiqueNewKey?.addEventListener('click', () => this.critiquePromoteCurrentFrame());
    UI.critiqueCompare?.addEventListener('click', () => this.critiqueToggleCompare());
    UI.poseBoneSearch?.addEventListener('input', () => this.updatePoseEditorUi('filter bones'));
    UI.poseBoneSelect?.addEventListener('change', () => this.selectPoseEditBone(UI.poseBoneSelect.value));
    UI.poseModeIk?.addEventListener('click', () => this.setPoseEditorMode('ik'));
    UI.poseModeFk?.addEventListener('click', () => this.setPoseEditorMode('fk'));
    UI.poseSpaceGlobal?.addEventListener('click', () => this.setPoseEditorSpace('global'));
    UI.poseSpaceLocal?.addEventListener('click', () => this.setPoseEditorSpace('local'));
    for (const input of [UI.poseNudgeX, UI.poseNudgeY, UI.poseNudgeZ, UI.poseRotX, UI.poseRotY, UI.poseRotZ, UI.poseScale, UI.poseUseScale]) {
      input?.addEventListener('input', () => this.applyPoseEditorEdit());
      input?.addEventListener('change', () => this.applyPoseEditorEdit());
    }
    UI.poseSaveKey?.addEventListener('click', () => this.savePoseCorrectionKey());
    UI.poseResetKey?.addEventListener('click', () => this.resetCurrentPoseCorrectionKey());
    UI.poseResetClip?.addEventListener('click', () => this.resetActiveClipPoseCorrections());
    UI.poseCompareOverlay?.addEventListener('click', () => this.togglePoseOverlayCompare());
    UI.touchPoseUndo?.addEventListener('click', () => this.undoPoseCorrection());
    UI.touchPoseRedo?.addEventListener('click', () => this.redoPoseCorrection());
    UI.touchPoseSave?.addEventListener('click', () => this.savePoseCorrectionKey('saved touch pose'));
    UI.touchPoseReset?.addEventListener('click', () => this.resetCurrentPoseCorrectionKey());
    UI.touchPoseCancel?.addEventListener('click', () => this.clearBoneSelection('deselected bone'));
    UI.touchPoseModeToggle?.addEventListener('click', () => this.toggleSelectedTouchEditMode());
    UI.touchPosePose?.addEventListener('click', () => this.openCorrectPose());
    UI.touchPoseClips?.addEventListener('click', () => this.setPanel(this.activePanel === 'clips' ? 'none' : 'clips'));
    UI.touchPoseDockHandle?.addEventListener('pointerdown', (event) => this.beginTouchPoseDockDrag(event));
    window.addEventListener('pointermove', (event) => this.updateTouchPoseDockDrag(event));
    window.addEventListener('pointerup', (event) => this.finishTouchPoseDockDrag(event));
    window.addEventListener('pointercancel', (event) => this.finishTouchPoseDockDrag(event));
    UI.critiqueSaveNote?.addEventListener('click', () => { this.critiquePersistCurrentNote('saved note'); this.saveActiveCleanupDraft('manual'); });
    UI.critiqueClearNote?.addEventListener('click', () => this.critiquePersistCurrentNote('cleared note'));
    UI.critiqueCopyNote?.addEventListener('click', () => this.critiqueCopyCurrentNote());
    for (const input of [UI.critiqueComment, UI.critiqueMarks, UI.critiqueBones]) {
      input?.addEventListener('input', () => this.queueCritiqueNoteSave());
      input?.addEventListener('change', () => this.queueCritiqueNoteSave());
    }
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
    this.updatePlayerTransportUi('stopped');
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
      this.handleTouchPosePointerDown(event);
    });
    UI.canvas.addEventListener('pointermove', (event) => this.handleTouchPosePointerMove(event));
    UI.canvas.addEventListener('pointerup', (event) => this.handleTouchPosePointerUp(event));
    UI.canvas.addEventListener('pointercancel', (event) => this.handleTouchPosePointerCancel(event));
    UI.canvas.addEventListener('lostpointercapture', (event) => this.handleTouchPosePointerCancel(event));
    window.addEventListener('blur', (event) => this.cancelAllTouchPoseGestures(event, true));
    document.addEventListener('visibilitychange', (event) => {
      if (document.hidden) this.cancelAllTouchPoseGestures(event, true);
    });
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
        this.setPanel(this.labMode === 'critique' ? 'edit' : 'cleanup');
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
    this.setPanel(this.labMode === 'critique' ? 'none' : (this.actors.get(this.selected)?.info?.startupPanel || 'clips'));
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
    else UI.boneSelect.selectedIndex = -1;
  }

  syncPoseEditorBoneSelection(actor = this.actors.get(this.selected), statusText = '') {
    if (!actor) return;
    if (UI.boneSelect) {
      if (actor.selectedBoneName) UI.boneSelect.value = actor.selectedBoneName;
      else UI.boneSelect.selectedIndex = -1;
    }
    if (UI.poseBoneSelect) {
      if (actor.selectedBoneName) UI.poseBoneSelect.value = actor.selectedBoneName;
      else UI.poseBoneSelect.selectedIndex = -1;
    }
    this.setBoneUiValues(actor.currentBoneEdit());
    this.updateBoneUi();
    this.updatePoseEditorUi(statusText);
  }

  selectBone(name, kind = '', editMode = '') {
    const actor = this.actors.get(this.selected);
    if (!actor || !actor.selectBone(name)) return;
    const endpoint = isEndpointBoneName(actor.selectedBoneName);
    const mode = kind === 'ik' && endpoint ? 'ik' : 'fk';
    const previous = this.selectedTouchControl?.boneName === actor.selectedBoneName ? this.selectedTouchControl : null;
    const nextEditMode = editMode || previous?.editMode || (mode === 'ik' ? 'hinge' : 'hinge');
    this.selectedTouchControl = { actorKey: actor.key, boneName: actor.selectedBoneName, kind: mode, editMode: nextEditMode };
    this.poseEditorMode = mode;
    this.poseEditorSpace = nextEditMode === 'hinge' || this.poseEditorMode === 'ik' ? 'global' : 'local';
    this.syncPoseEditorBoneSelection(actor, 'selected ' + shortBoneName(actor.selectedBoneName));
    this.showTouchPoseHud(this.selectedTouchControl);
    setStatus('selected bone: ' + shortBoneName(actor.selectedBoneName) + ' ' + nextEditMode);
  }

  clearBoneSelection(statusText = 'deselected bone') {
    const actor = this.actors.get(this.selected);
    if (!actor) return;
    actor.deselectBone();
    if (statusText === 'deselected bone') {
      this.poseOverlayEnabled = false;
      actor.seek(actor.activeAction?.time || 0);
    }
    this.selectedTouchControl = null;
    this.hideTouchPoseHud();
    this.syncPoseEditorBoneSelection(actor, statusText);
    setStatus(statusText);
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

  bonePickObjects(actor = this.actors.get(this.selected)) {
    if (!actor?.showBoneOverlay) return [];
    return [
      ...actor.boneHandles.values(),
      ...actor.boneLines.values(),
    ].filter((object) => object.visible && isTouchPoseSelectableBoneName(object.userData?.boneName));
  }

  pickBoneHandleHits(event, actor = this.actors.get(this.selected)) {
    if (!actor?.showBoneOverlay) return [];
    const rect = UI.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.params.Line.threshold = 0.1;
    return this.raycaster.intersectObjects(this.bonePickObjects(actor), false);
  }

  pickTouchRigControlHits(event, actor = this.actors.get(this.selected)) {
    if (!actor?.touchRigControls || !actor.showTouchRigControls) return [];
    const rect = UI.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects([...actor.touchRigControls.values()].filter((control) => control.visible), false);
  }

  pickNearestScreenBone(event, actor = this.actors.get(this.selected)) {
    if (!actor) return null;
    const rect = UI.canvas.getBoundingClientRect();
    const point = { x: event.clientX, y: event.clientY };
    const threshold = Math.max(22, Math.min(42, Math.min(rect.width, rect.height) * 0.045));
    let best = null;
    for (const bone of actor.bones || []) {
      if (!bone?.parent?.isBone || !isTouchPoseSelectableBoneName(bone.name)) continue;
      const start = screenPointForWorld(bone.parent.getWorldPosition(new THREE.Vector3()), this.camera, rect);
      const end = screenPointForWorld(bone.getWorldPosition(new THREE.Vector3()), this.camera, rect);
      if (start.z < -1 || start.z > 1 || end.z < -1 || end.z > 1) continue;
      const distance = distanceToScreenSegment(point, start, end);
      if (distance <= threshold && (!best || distance < best.distance)) best = { boneName: bone.name, distance };
    }
    return best;
  }

  touchControlScreenDistance(event, control) {
    if (!control) return Number.POSITIVE_INFINITY;
    const rect = UI.canvas.getBoundingClientRect();
    const screen = screenPointForWorld(control.getWorldPosition(new THREE.Vector3()), this.camera, rect);
    if (screen.z < -1 || screen.z > 1) return Number.POSITIVE_INFINITY;
    return Math.hypot(event.clientX - screen.x, event.clientY - screen.y);
  }

  pickTouchPoseTarget(event, actor = this.actors.get(this.selected)) {
    if (!actor) return null;
    const controlHits = this.pickTouchRigControlHits(event, actor);
    const control = controlHits[0]?.object || null;
    const controlDistance = this.touchControlScreenDistance(event, control);
    const handleHits = control ? [] : this.pickBoneHandleHits(event, actor);
    const handle = handleHits[0]?.object || null;
    const screenHit = this.pickNearestScreenBone(event, actor);
    if (screenHit && (!control || screenHit.distance + 10 < controlDistance)) {
      return { boneName: screenHit.boneName, kind: 'fk', source: 'screen-bone', distance: screenHit.distance };
    }
    if (control?.userData?.boneName) {
      return { boneName: control.userData.boneName, kind: control.userData.controlKind || 'fk', source: 'touch-control', distance: controlDistance };
    }
    if (handle?.userData?.boneName) {
      return { boneName: handle.userData.boneName, kind: 'fk', source: 'bone-handle', distance: 0 };
    }
    return null;
  }

  pickBoneHandle(event) {
    if (!this.pointerDown) return;
    const dx = event.clientX - this.pointerDown.x;
    const dy = event.clientY - this.pointerDown.y;
    this.pointerDown = null;
    if (Math.hypot(dx, dy) > 12) return;
    const actor = this.actors.get(this.selected);
    if (!actor) return;
    const target = this.pickTouchPoseTarget(event, actor);
    if (!target) {
      if (actor.selectedBoneName) this.clearBoneSelection('deselected bone');
      return;
    }
    const { boneName, kind } = target;
    if (boneName && isTouchPoseSelectableBoneName(boneName)) {
      this.selectBone(boneName, kind);
    }
  }

  showTouchPoseHud(control = this.selectedTouchControl) {
    const actor = this.actors.get(control?.actorKey || this.selected);
    const boneName = control?.boneName || actor?.selectedBoneName || '';
    if (!UI.touchPoseHud) return;
    UI.touchPoseHud.classList.toggle('active', true);
    if (UI.touchPoseLabel) UI.touchPoseLabel.textContent = boneName ? shortBoneName(boneName) : 'Pose: tap FK bone or IK handle';
    if (UI.touchPoseMode) UI.touchPoseMode.textContent = String(control?.editMode || control?.kind || this.poseEditorMode || 'fk').toUpperCase();
    this.updateUndoRedoUi();
  }

  hideTouchPoseHud() {
    UI.touchPoseHud?.classList.toggle('active', false);
  }


  captureTouchPoseDockPosition() {
    const style = UI.touchPoseHud?.style;
    if (!style) return null;
    const x = Number.parseFloat(style.getPropertyValue('--touch-pose-dock-x') || '');
    const y = Number.parseFloat(style.getPropertyValue('--touch-pose-dock-y') || '');
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  applyTouchPoseDockPosition(position = null) {
    if (!UI.touchPoseHud || !position) return false;
    const x = clampValue(Number(position.x || 0), -48, window.innerWidth + 48);
    const y = clampValue(Number(position.y || 0), -48, window.innerHeight + 48);
    UI.touchPoseHud.style.setProperty('--touch-pose-dock-x', x.toFixed(1) + 'px');
    UI.touchPoseHud.style.setProperty('--touch-pose-dock-y', y.toFixed(1) + 'px');
    UI.touchPoseHud.classList.toggle('dock-dragged', true);
    return true;
  }

  beginTouchPoseDockDrag(event) {
    if (!UI.touchPoseHud) return false;
    const rect = UI.touchPoseHud.getBoundingClientRect();
    this.touchPoseDockDrag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    UI.touchPoseDockHandle?.setPointerCapture?.(event.pointerId);
    UI.touchPoseHud.classList.toggle('dock-dragging', true);
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }

  updateTouchPoseDockDrag(event) {
    const drag = this.touchPoseDockDrag;
    if (!drag || event.pointerId !== drag.pointerId) return false;
    this.applyTouchPoseDockPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY });
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }

  finishTouchPoseDockDrag(event) {
    const drag = this.touchPoseDockDrag;
    if (!drag || event.pointerId !== drag.pointerId) return false;
    UI.touchPoseDockHandle?.releasePointerCapture?.(drag.pointerId);
    this.touchPoseDockDrag = null;
    UI.touchPoseHud?.classList.toggle('dock-dragging', false);
    this.queueStateSave();
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }

  touchWorldPlaneVectors() {
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    return { right: right.normalize(), up: up.normalize() };
  }


  isTouchPoseDoubleTap(boneName, event) {
    const last = this.lastTouchPoseTap;
    const now = Date.now();
    this.lastTouchPoseTap = { boneName, x: event.clientX, y: event.clientY, time: now };
    if (!last || last.boneName !== boneName) return false;
    if (now - last.time > TOUCH_POSE_DOUBLE_TAP_MS) return false;
    return Math.hypot(event.clientX - last.x, event.clientY - last.y) <= TOUCH_POSE_DOUBLE_TAP_PX;
  }

  toggleSelectedTouchEditMode(statusText = '') {
    const control = this.selectedTouchControl;
    if (!control?.boneName) return null;
    const nextMode = control.editMode === 'twist' ? 'hinge' : 'twist';
    this.selectedTouchControl = { ...control, kind: control.kind || 'fk', editMode: nextMode };
    this.poseEditorSpace = nextMode === 'hinge' ? 'global' : 'local';
    this.showTouchPoseHud(this.selectedTouchControl);
    this.updatePoseEditorUi(statusText || ('mode ' + nextMode + ' ' + shortBoneName(control.boneName)));
    this.updateCritiqueTransportUi(statusText || ('mode ' + nextMode));
    setStatus('selected bone: ' + shortBoneName(control.boneName) + ' ' + nextMode);
    return this.selectedTouchControl;
  }

  screenPlaneWorldDelta(dx, dy, scale = 0.004) {
    const { right, up } = this.touchWorldPlaneVectors();
    return right.multiplyScalar(dx * scale).add(up.multiplyScalar(-dy * scale));
  }

  hingeTargetDelta(event, drag = this.touchPoseDrag) {
    if (!drag?.startEdit) return null;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const world = this.screenPlaneWorldDelta(dx, dy);
    return {
      x: Number(drag.startEdit.x || 0) + world.x * 100,
      y: Number(drag.startEdit.y || 0) + world.y * 100,
      z: Number(drag.startEdit.z || 0) + world.z * 100,
      worldDelta: world,
    };
  }

  hingeEditMetadata(control = this.selectedTouchControl) {
    const actor = this.actors.get(control?.actorKey || this.selected);
    const endpoint = actor?.boneByName?.get(control?.boneName || '');
    const driver = endpoint?.parent?.isBone ? endpoint.parent : null;
    return {
      drivenBoneName: endpoint?.name || control?.boneName || '',
      anchorBoneName: driver?.name || '',
    };
  }

  touchEditForControl(control = this.selectedTouchControl, create = true) {
    const actor = this.actors.get(control?.actorKey || this.selected);
    if (!actor || !control?.boneName) return null;
    const key = this.currentPoseCorrectionKey(create);
    if (!key) return null;
    if (!key.edits) key.edits = {};
    if (!key.edits[control.boneName]) key.edits[control.boneName] = {
      ...poseEditDefaults(),
      mode: control.kind === 'ik' ? 'ik' : 'fk',
      space: control.kind === 'ik' ? 'global' : 'local',
    };
    return { actor, key, edit: key.edits[control.boneName] };
  }

  inferFkAxis(actor, boneName) {
    const bone = actor?.boneByName?.get(boneName);
    if (!actor || !bone) return null;
    actor.model.updateMatrixWorld(true);
    const role = fkBoneRole(boneName);
    const origin = worldPositionOf(bone);
    const childBone = (bone.children || []).find((child) => child.isBone && isTouchPoseSelectableBoneName(child.name));
    const childWorld = childBone ? worldPositionOf(childBone) : null;
    const parentWorld = bone.parent?.isBone ? worldPositionOf(bone.parent) : null;
    const boneDirWorld = safeNormalizedVector(childWorld ? childWorld.clone().sub(origin) : (parentWorld ? origin.clone().sub(parentWorld) : null));
    const parentDirWorld = safeNormalizedVector(parentWorld ? origin.clone().sub(parentWorld) : null);
    const chainPlaneNormalWorld = safeNormalizedVector(parentDirWorld && boneDirWorld ? parentDirWorld.clone().cross(boneDirWorld) : null);
    const twistAxisWorld = boneDirWorld;
    const cameraAxis = new THREE.Vector3();
    this.camera.getWorldDirection(cameraAxis).normalize();
    const cameraUp = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(cameraRight, cameraUp, new THREE.Vector3());
    const swingFallback = avoidLongitudinalTwist(cameraAxis, twistAxisWorld, chainPlaneNormalWorld || cameraUp || cameraRight);
    if ((role === 'lowerLeg' || role === 'forearm') && chainPlaneNormalWorld) {
      const axis = avoidLongitudinalTwist(chainPlaneNormalWorld, twistAxisWorld, swingFallback);
      if (axis) return { role, axisMode: 'inferred-hinge', axisWorld: axis.toArray(), boneDirWorld: boneDirWorld?.toArray() || null, parentDirWorld: parentDirWorld?.toArray() || null, chainPlaneNormalWorld: chainPlaneNormalWorld.toArray(), twistAxisWorld: twistAxisWorld?.toArray() || null };
    }
    if (role === 'upperLeg' || role === 'upperArm' || role === 'foot' || role === 'hand' || role === 'spine' || role === 'head') {
      const axis = avoidLongitudinalTwist(chainPlaneNormalWorld || swingFallback, twistAxisWorld, swingFallback);
      if (axis) return { role, axisMode: 'inferred-swing', axisWorld: axis.toArray(), boneDirWorld: boneDirWorld?.toArray() || null, parentDirWorld: parentDirWorld?.toArray() || null, chainPlaneNormalWorld: chainPlaneNormalWorld?.toArray() || null, twistAxisWorld: twistAxisWorld?.toArray() || null };
    }
    const axis = avoidLongitudinalTwist(swingFallback || cameraAxis, twistAxisWorld, cameraUp || cameraRight);
    if (!axis) return null;
    return { role, axisMode: 'fallback-screen', axisWorld: axis.toArray(), boneDirWorld: boneDirWorld?.toArray() || null, parentDirWorld: parentDirWorld?.toArray() || null, chainPlaneNormalWorld: chainPlaneNormalWorld?.toArray() || null, twistAxisWorld: twistAxisWorld?.toArray() || null };
  }

  screenPlaneFkContext(actor, boneName, event) {
    const bone = actor?.boneByName?.get(boneName);
    if (!actor || !bone) return null;
    const rect = UI.canvas.getBoundingClientRect();
    const originWorld = bone.getWorldPosition(new THREE.Vector3());
    let endWorld = null;
    const childBone = (bone.children || []).find((child) => child.isBone && isTouchPoseSelectableBoneName(child.name));
    if (childBone) endWorld = childBone.getWorldPosition(new THREE.Vector3());
    else if (bone.parent?.isBone) endWorld = originWorld.clone().add(originWorld.clone().sub(bone.parent.getWorldPosition(new THREE.Vector3())));
    else endWorld = originWorld.clone().add(new THREE.Vector3(0, 0.12, 0));
    const originScreen = screenPointForWorld(originWorld, this.camera, rect);
    const endScreen = screenPointForWorld(endWorld, this.camera, rect);
    const start = { x: endScreen.x - originScreen.x, y: endScreen.y - originScreen.y };
    const radius = Math.hypot(start.x, start.y);
    if (!Number.isFinite(radius) || radius < TOUCH_POSE_FK_MIN_RADIUS) return null;
    return {
      actorKey: actor.key,
      boneName,
      originWorld: originWorld.toArray(),
      endWorld: endWorld.toArray(),
      originScreen,
      endScreen,
      start,
      radius,
      pointerStart: { x: event.clientX, y: event.clientY },
      startWorldQuat: worldQuaternionOf(bone).toArray(),
      axisInfo: this.inferFkAxis(actor, boneName),
    };
  }

  screenPlaneFkDelta(event) {
    const fk = this.touchPoseDrag?.fk;
    if (!fk) return null;
    const current = { x: event.clientX - fk.originScreen.x, y: event.clientY - fk.originScreen.y };
    const radius = Math.hypot(current.x, current.y);
    if (!Number.isFinite(radius) || radius < TOUCH_POSE_FK_MIN_RADIUS) return null;
    const start = fk.start;
    const angle = Math.atan2(current.y, current.x) - Math.atan2(start.y, start.x);
    const axisWorld = fk.axisInfo?.axisWorld ? new THREE.Vector3().fromArray(fk.axisInfo.axisWorld).normalize() : null;
    if (!axisWorld || axisWorld.lengthSq() < 0.000001) return null;
    const delta = new THREE.Quaternion().setFromAxisAngle(axisWorld, angle);
    const startWorld = new THREE.Quaternion().fromArray(fk.startWorldQuat).normalize();
    return { worldQuat: delta.multiply(startWorld).normalize(), axisMode: fk.axisInfo?.axisMode || 'fallback-screen', axisWorld: axisWorld.toArray(), angle };
  }


  trackTouchPointer(event) {
    if (event?.pointerId === undefined) return;
    if (event.pointerType && event.pointerType !== 'touch') return;
    this.activeTouchPointers.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
  }

  updateTrackedTouchPointer(event) {
    if (event?.pointerId === undefined) return;
    if (!this.activeTouchPointers.has(event.pointerId)) return;
    this.activeTouchPointers.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
  }

  releaseTrackedTouchPointer(event) {
    if (event?.pointerId === undefined) return;
    this.activeTouchPointers.delete(event.pointerId);
  }

  activeTouchPointList() {
    return [...this.activeTouchPointers.values()].sort((a, b) => a.id - b.id);
  }

  allowCameraMultiTouch(event = null) {
    if (this.touchPoseDrag) this.cancelTouchPoseDrag(event, false);
    if (this.multiTouchPoseGesture) this.cancelMultiTouchPoseGesture(event, false);
    this.pointerDown = null;
    this.controls.enabled = true;
    return false;
  }

  multiTouchMetrics(points = this.activeTouchPointList()) {
    if (points.length < 2) return null;
    const a = points[0];
    const b = points[1];
    const center = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return {
      center,
      distance: Math.max(1, Math.hypot(dx, dy)),
      angle: Math.atan2(dy, dx),
    };
  }

  fkBoneLongAxisWorld(actor, boneName) {
    const bone = actor?.boneByName?.get(boneName);
    if (!actor || !bone) return null;
    actor.model.updateMatrixWorld(true);
    const origin = worldPositionOf(bone);
    const childBone = (bone.children || []).find((child) => child.isBone && isTouchPoseSelectableBoneName(child.name));
    if (childBone) return safeNormalizedVector(worldPositionOf(childBone).sub(origin));
    if (bone.parent?.isBone) return safeNormalizedVector(origin.sub(worldPositionOf(bone.parent)));
    return null;
  }

  beginMultiTouchPoseGesture(event = null) {
    const points = this.activeTouchPointList();
    if (points.length < 2) return false;
    const actor = this.actors.get(this.selected);
    const boneName = this.selectedTouchControl?.boneName || actor?.selectedBoneName;
    if (!actor || !boneName || !isTouchPoseSelectableBoneName(boneName)) return false;
    const bone = actor.boneByName?.get(boneName);
    if (!bone) return false;
    const start = this.multiTouchMetrics(points);
    if (!start) return false;
    if (this.touchPoseDrag) this.cancelTouchPoseDrag(event, false);
    actor.pauseActive(true);
    actor.seek(actor.activeAction?.time || 0);
    this.applyPoseCorrectionOverlay(actor);
    this.selectBone(boneName, this.selectedTouchControl?.kind || 'fk', this.selectedTouchControl?.editMode || 'hinge');
    const { right, up } = this.touchWorldPlaneVectors();
    const control = { actorKey: actor.key, boneName, kind: this.selectedTouchControl?.kind || 'fk', editMode: this.selectedTouchControl?.editMode || 'hinge' };
    const touchEdit = this.touchEditForControl(control, true);
    if (!touchEdit) return false;
    this.multiTouchPoseGesture = {
      pointerIds: points.slice(0, 2).map((point) => point.id),
      control,
      start,
      startEdit: { ...touchEdit.edit },
      startWorldQuat: worldQuaternionOf(bone).toArray(),
      cameraRight: right.toArray(),
      cameraUp: up.toArray(),
      boneLongAxisWorld: this.fkBoneLongAxisWorld(actor, boneName)?.toArray() || null,
      editing: true,
    };
    this.controls.enabled = false;
    for (const point of points.slice(0, 2)) UI.canvas.setPointerCapture?.(point.id);
    event?.preventDefault?.();
    return true;
  }

  multiTouchFkDelta() {
    const gesture = this.multiTouchPoseGesture;
    if (!gesture?.editing) return null;
    const current = this.multiTouchMetrics();
    if (!current) return null;
    const centerDelta = {
      x: current.center.x - gesture.start.center.x,
      y: current.center.y - gesture.start.center.y,
    };
    const panDistance = Math.hypot(centerDelta.x, centerDelta.y);
    const rotationDelta = wrapRadians(current.angle - gesture.start.angle);
    const startWorld = new THREE.Quaternion().fromArray(gesture.startWorldQuat).normalize();
    if (Math.abs(rotationDelta) >= TOUCH_POSE_ROLL_DEADZONE && panDistance <= TOUCH_POSE_ROLL_PAN_DEADZONE && gesture.boneLongAxisWorld) {
      const axisWorld = new THREE.Vector3().fromArray(gesture.boneLongAxisWorld).normalize();
      const roll = new THREE.Quaternion().setFromAxisAngle(axisWorld, rotationDelta);
      return {
        worldQuat: roll.multiply(startWorld).normalize(),
        axisMode: 'phalanx-two-finger-roll',
        axisWorld: axisWorld.toArray(),
        angle: rotationDelta,
        gestureKind: 'roll',
      };
    }
    const cameraUp = new THREE.Vector3().fromArray(gesture.cameraUp).normalize();
    const cameraRight = new THREE.Vector3().fromArray(gesture.cameraRight).normalize();
    const horizontal = new THREE.Quaternion().setFromAxisAngle(cameraUp, -centerDelta.x * TOUCH_POSE_ROTATION_PAN_SPEED);
    const vertical = new THREE.Quaternion().setFromAxisAngle(cameraRight, centerDelta.y * TOUCH_POSE_ROTATION_PAN_SPEED);
    const worldQuat = horizontal.multiply(vertical).multiply(startWorld).normalize();
    const axisWorld = safeNormalizedVector(cameraUp.clone().multiplyScalar(Math.abs(centerDelta.x)).add(cameraRight.clone().multiplyScalar(Math.abs(centerDelta.y)))) || cameraUp;
    return {
      worldQuat,
      axisMode: 'phalanx-two-finger-pan',
      axisWorld: axisWorld.toArray(),
      angle: Math.hypot(centerDelta.x, centerDelta.y) * TOUCH_POSE_ROTATION_PAN_SPEED,
      gestureKind: 'pan',
    };
  }

  applyMultiTouchPoseDelta(event = null) {
    const gesture = this.multiTouchPoseGesture;
    if (!gesture?.editing) return null;
    const beforeHistory = gesture.historyPushed ? null : this.poseHistorySnapshot('two-finger pose drag');
    const touchEdit = this.touchEditForControl(gesture.control, true);
    if (!touchEdit) return null;
    if (!gesture.historyPushed) {
      this.pushPoseHistory('two-finger pose drag', beforeHistory);
      gesture.historyPushed = true;
    }
    const editMode = gesture.control.editMode || 'hinge';
    let next = { ...gesture.startEdit };
    if (editMode === 'twist') {
      const fkDelta = this.multiTouchFkDelta();
      if (!fkDelta) return null;
      next = {
        ...next,
        mode: 'fk',
        space: 'screen',
        axisMode: fkDelta.axisMode,
        axisWorld: fkDelta.axisWorld,
        angle: fkDelta.angle,
        gestureKind: 'twist',
        worldQuat: fkDelta.worldQuat.toArray(),
        rotX: 0,
        rotY: 0,
        rotZ: 0,
      };
    } else {
      const current = this.multiTouchMetrics();
      if (!current) return null;
      const dx = current.center.x - gesture.start.center.x;
      const dy = current.center.y - gesture.start.center.y;
      const world = this.screenPlaneWorldDelta(dx, dy);
      next = {
        ...next,
        ...this.hingeEditMetadata(gesture.control),
        mode: 'hinge',
        space: 'global',
        x: Number(gesture.startEdit.x || 0) + world.x * 100,
        y: Number(gesture.startEdit.y || 0) + world.y * 100,
        z: Number(gesture.startEdit.z || 0) + world.z * 100,
        axisMode: 'pinned-parent-screen-target',
        gestureKind: 'hinge-pan',
        worldQuat: null,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
      };
    }
    touchEdit.key.edits[gesture.control.boneName] = next;
    this.annotatePoseCorrectionKey(touchEdit.key, touchEdit.actor, touchEdit.actor.activeClip());
    this.poseCorrectionSessionActive = true;
    this.poseOverlayEnabled = true;
    this.writePoseCorrections();
    this.applyPoseCorrectionOverlay(touchEdit.actor);
    this.updatePoseEditorUi('edited ' + shortBoneName(gesture.control.boneName));
    this.updateCritiqueTransportUi('edited ' + shortBoneName(gesture.control.boneName));
    this.showTouchPoseHud(gesture.control);
    event?.preventDefault?.();
    return next;
  }

  cancelMultiTouchPoseGesture(event = null, renderIfEdited = false) {
    if (!this.multiTouchPoseGesture) return false;
    const wasEditing = Boolean(this.multiTouchPoseGesture.editing);
    for (const pointerId of this.multiTouchPoseGesture.pointerIds || []) UI.canvas.releasePointerCapture?.(pointerId);
    this.multiTouchPoseGesture = null;
    this.lastTouchPoseTap = null;
    this.controls.enabled = true;
    if (renderIfEdited && wasEditing) this.renderCritiqueFrames();
    event?.preventDefault?.();
    return true;
  }

  finishMultiTouchPoseGesture(event = null, renderIfEdited = true) {
    return this.cancelMultiTouchPoseGesture(event, renderIfEdited);
  }

  cancelAllTouchPoseGestures(event = null, renderIfEdited = false) {
    this.cancelMultiTouchPoseGesture(event, renderIfEdited);
    this.cancelTouchPoseDrag(event, renderIfEdited);
    this.activeTouchPointers.clear();
  }

  handleTouchPosePointerDown(event) {
    this.trackTouchPointer(event);
    if (this.activeTouchPointers.size >= 2) return this.allowCameraMultiTouch(event);
    return this.beginTouchPoseDrag(event);
  }

  handleTouchPosePointerMove(event) {
    this.updateTrackedTouchPointer(event);
    if (this.multiTouchPoseGesture) return;
    if (this.activeTouchPointers.size >= 2) {
      this.allowCameraMultiTouch(event);
      return;
    }
    this.updateTouchPoseDrag(event);
  }

  handleTouchPosePointerUp(event) {
    const wasMulti = Boolean(this.multiTouchPoseGesture);
    this.releaseTrackedTouchPointer(event);
    if (wasMulti) {
      if (this.activeTouchPointers.size < 2) return this.finishMultiTouchPoseGesture(event, true);
      return true;
    }
    if (event?.pointerType === 'touch' && this.activeTouchPointers.size > 0 && !this.touchPoseDrag) return false;
    if (this.finishTouchPoseDrag(event)) return true;
    this.pickBoneHandle(event);
    return false;
  }

  handleTouchPosePointerCancel(event) {
    this.releaseTrackedTouchPointer(event);
    if (this.multiTouchPoseGesture) return this.cancelMultiTouchPoseGesture(event, true);
    return this.cancelTouchPoseDrag(event, true);
  }

  beginTouchPoseDrag(event) {
    if (this.touchPoseDrag) this.cancelTouchPoseDrag(event, false);
    if (this.multiTouchPoseGesture) this.cancelMultiTouchPoseGesture(event, true);
    if (this.activeTouchPointers.size >= 2) return false;
    const actor = this.actors.get(this.selected);
    if (!actor) return false;
    const target = this.pickTouchPoseTarget(event, actor);
    const boneName = target?.boneName || '';
    if (!boneName || !isTouchPoseSelectableBoneName(boneName)) return false;
    const dragKind = target.kind === 'ik' ? 'ik' : 'fk';
    const selectKind = dragKind === 'ik' ? 'ik' : 'fk';
    actor.pauseActive(true);
    actor.seek(actor.activeAction?.time || 0);
    const isDoubleTap = this.isTouchPoseDoubleTap(boneName, event);
    this.selectBone(boneName, selectKind, this.selectedTouchControl?.boneName === boneName ? this.selectedTouchControl?.editMode : 'hinge');
    this.applyPoseCorrectionOverlay(actor);
    if (isDoubleTap) {
      this.toggleSelectedTouchEditMode();
      event.preventDefault?.();
      return true;
    }
    const editMode = this.selectedTouchControl?.editMode || 'hinge';
    this.touchPoseDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startEdit: null,
      control: { actorKey: actor.key, boneName, kind: dragKind, editMode },
      fk: this.screenPlaneFkContext(actor, boneName, event),
      editing: false,
    };
    this.controls.enabled = false;
    UI.canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault?.();
    return true;
  }

  startTouchPoseEditDrag() {
    if (!this.touchPoseDrag?.control) return null;
    if (this.touchPoseDrag.control.kind !== 'ik' && this.touchPoseDrag.control.kind !== 'fk') return null;
    if (this.touchPoseDrag.control.kind === 'fk' && this.touchPoseDrag.control.editMode === 'twist' && !this.touchPoseDrag.fk) return null;
    const beforeHistory = this.poseHistorySnapshot('touch pose drag');
    const touchEdit = this.touchEditForControl(this.touchPoseDrag.control, true);
    if (!touchEdit) return null;
    this.pushPoseHistory('touch pose drag', beforeHistory);
    this.touchPoseDrag.historyPushed = true;
    this.touchPoseDrag.startEdit = { ...touchEdit.edit };
    this.touchPoseDrag.editing = true;
    return touchEdit;
  }

  applyTouchPoseDelta(event) {
    if (!this.touchPoseDrag?.editing || !this.touchPoseDrag.startEdit) return null;
    if (event?.pointerId !== undefined && event.pointerId !== this.touchPoseDrag.pointerId) return null;
    const { control, startEdit, startX, startY } = this.touchPoseDrag;
    const touchEdit = this.touchEditForControl(control, true);
    if (!touchEdit) return null;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const next = { ...startEdit, mode: control.kind === 'ik' ? 'ik' : 'fk', space: control.kind === 'ik' ? 'global' : 'screen' };
    if (control.kind === 'fk' && control.editMode === 'twist') {
      const fkDelta = this.screenPlaneFkDelta(event);
      if (!fkDelta) return null;
      next.mode = 'fk';
      next.axisMode = 'selected-bone-twist';
      next.axisWorld = fkDelta.axisWorld;
      next.angle = fkDelta.angle;
      next.gestureKind = 'twist';
      next.worldQuat = fkDelta.worldQuat.toArray();
      next.rotX = 0;
      next.rotY = 0;
      next.rotZ = 0;
    } else if (control.kind === 'fk' || control.kind === 'ik') {
      const hinge = this.hingeTargetDelta(event);
      if (!hinge) return null;
      Object.assign(next, this.hingeEditMetadata(control));
      next.mode = 'hinge';
      next.space = 'global';
      next.x = hinge.x;
      next.y = hinge.y;
      next.z = hinge.z;
      next.axisMode = 'pinned-parent-screen-target';
      next.gestureKind = 'hinge-pan';
      next.worldQuat = null;
      next.rotX = 0;
      next.rotY = 0;
      next.rotZ = 0;
    } else return null;
    touchEdit.key.edits[control.boneName] = next;
    this.annotatePoseCorrectionKey(touchEdit.key, touchEdit.actor, touchEdit.actor.activeClip());
    this.poseCorrectionSessionActive = true;
    this.poseOverlayEnabled = true;
    this.writePoseCorrections();
    this.applyPoseCorrectionOverlay(touchEdit.actor);
    this.updatePoseEditorUi('edited ' + shortBoneName(control.boneName));
    this.updateCritiqueTransportUi('edited ' + shortBoneName(control.boneName));
    this.showTouchPoseHud(control);
    return next;
  }

  updateTouchPoseDrag(event) {
    if (!this.touchPoseDrag) return;
    if (event.pointerId !== this.touchPoseDrag.pointerId) return;
    if (event.buttons === 0) {
      this.cancelTouchPoseDrag(event, false);
      return;
    }
    const dx = event.clientX - this.touchPoseDrag.startX;
    const dy = event.clientY - this.touchPoseDrag.startY;
    if (!this.touchPoseDrag.editing) {
      if (Math.hypot(dx, dy) < TOUCH_POSE_DRAG_THRESHOLD) {
        event.preventDefault?.();
        return;
      }
      if (!this.startTouchPoseEditDrag()) {
        this.cancelTouchPoseDrag(event, false);
        return;
      }
    }
    this.applyTouchPoseDelta(event);
    event.preventDefault?.();
  }

  cancelTouchPoseDrag(event = null, renderIfEdited = false) {
    if (!this.touchPoseDrag) return false;
    const wasEditing = Boolean(this.touchPoseDrag.editing);
    UI.canvas.releasePointerCapture?.(this.touchPoseDrag.pointerId);
    this.touchPoseDrag = null;
    this.controls.enabled = true;
    if (renderIfEdited && wasEditing) this.renderCritiqueFrames();
    event?.preventDefault?.();
    return true;
  }

  finishTouchPoseDrag(event) {
    if (!this.touchPoseDrag) return false;
    if (event?.pointerId !== undefined && event.pointerId !== this.touchPoseDrag.pointerId) return false;
    const wasEditing = Boolean(this.touchPoseDrag.editing);
    this.cancelTouchPoseDrag(event, true);
    return wasEditing;
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

  critiqueStateSnapshot(actor, clip = actor?.activeClip()) {
    const frame = this.currentCritiqueFrameSlot(actor);
    const noteKey = this.critiqueNoteKey(actor, clip, frame);
    const savedNote = noteKey ? (this.critiqueNotes.entries?.[noteKey] || null) : null;
    const liveComment = String(UI.critiqueComment?.value || '').trim();
    const liveMarks = this.critiqueReadTextField(UI.critiqueMarks?.value || '');
    const liveBones = this.critiqueReadTextField(UI.critiqueBones?.value || '');
    const liveNote = liveComment || liveMarks.length || liveBones.length ? {
      actorKey: actor?.key || '',
      actorLabel: actor?.info?.label || actor?.key || '',
      clipKey: clip ? clipKey(clip) : '',
      clipName: clip?.name || '',
      frameKey: frame?.frameKey || '',
      tag: frame?.tag || '',
      spriteFrame: frame?.spriteFrame,
      sourceTime: Number(frame?.time || 0),
      comment: liveComment,
      marks: liveMarks,
      bones: liveBones,
      mode: 'grease-pencil-comment-v1',
    } : null;
    return {
      schema: 'pose-lab-critique-state-v1',
      savedAt: new Date().toISOString(),
      actorKey: actor?.key || '',
      actorLabel: actor?.info?.label || actor?.key || '',
      clipKey: clip ? clipKey(clip) : '',
      clipName: clip?.name || '',
      frameKey: frame?.frameKey || '',
      frameTag: frame?.tag || '',
      spriteFrame: Number(frame?.spriteFrame || 0),
      sourceTime: Number(frame?.time || 0),
      note: liveNote || (savedNote ? { ...savedNote } : null),
      boneEdits: actor ? [...actor.boneEdits.entries()].map(([boneName, edit]) => ({ boneName, ...edit })) : [],
    };
  }

  critiqueLoadSavedStateFromClip(actor, clip) {
    const critique = clip?.userData?.critique;
    if (!actor || !critique) return false;
    const edits = Array.isArray(critique.boneEdits) ? critique.boneEdits : [];
    if (!edits.length) return false;
    actor.resetAllBoneEdits();
    for (const entry of edits) {
      const boneName = entry?.boneName || entry?.name;
      if (!boneName) continue;
      actor.applyBoneEdit(boneName, entry);
    }
    return true;
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
    const draftClip = serializeAnimationClip(clip);
    draftClip.userData = { ...(draftClip.userData || {}), critique: this.critiqueStateSnapshot(actor, clip) };
    const draft = { id: 'draft-' + savedAt, actorKey: actor.key, actorLabel: actor.info?.label || actor.key, savedAt, reason, clip: draftClip };
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
    this.critiquePersistCurrentNote('saved note');
    const ok = this.saveCleanupDraft(actor, clip, reason);
    this.updateCleanupUi(ok ? 'saved draft: ' + clip.name : 'draft save failed');
    this.updatePlayerTransportUi(ok ? 'saved draft' : 'draft save failed');
  }

  restoreCleanupDrafts(actor) {
    if (!actor) return 0;
    const store = this.readCleanupDraftStore();
    const list = Array.isArray(store[actor.key]) ? store[actor.key] : [];
    let restored = 0;
    for (const entry of list.slice().reverse()) {
      const clip = deserializeAnimationClip(entry.clip);
      if (!clip) continue;
      clip.userData = { ...(clip.userData || {}), origin: clip.userData?.origin || ('cleanup:' + actor.key + ':restored-' + restored), cleanupActor: actor.key, restoredDraft: true, critique: clip.userData?.critique || entry.clip?.userData?.critique || null };
      const key = clipKey(clip);
      if (actor.actions.has(key)) continue;
      actor.clips.push(clip);
      actor.actions.set(key, actor.mixer.clipAction(clip));
      restored += 1;
    }
    if (restored) {
      actor.cleanupClipCount = actor.clips.filter((entry) => (entry.userData?.origin || '').startsWith('cleanup:')).length;
      if (UI.cleanupSaveStatus) UI.cleanupSaveStatus.textContent = 'restored drafts=' + restored;
      this.updatePlayerTransportUi('restored drafts=' + restored);
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
    const payloadClip = serializeAnimationClip(clip);
    payloadClip.userData = { ...(payloadClip.userData || {}), critique: this.critiqueStateSnapshot(actor, clip) };
    const payload = { exportedAt: new Date().toISOString(), actorKey: actor.key, actorLabel: actor.info?.label || actor.key, clip: payloadClip };
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
    const time = this.cleanupXToTime(event.clientX, metrics);
    if (this.labMode === 'critique') {
      this.cleanupTimelineDrag = { mode: 'scrub', anchor: time };
    } else {
      const range = this.cleanupBlendRange(clip);
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
    }
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
    if (this.cleanupTimelineDrag.mode === 'scrub') {
      this.scrubCleanupClip(t);
      return;
    }
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
    const keyFrames = this.visualQaReadFrames(clip);
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
    for (const frame of keyFrames) {
      const x = this.timeToCleanupX(frame.time, metrics);
      const isImportant = /start|anticipation|contact|recovery|recoil|settle/i.test(String(frame.tag || ''));
      ctx.strokeStyle = isImportant ? '#d6a642' : 'rgba(141,218,255,0.9)';
      ctx.lineWidth = isImportant ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y - (isImportant ? 7 : 4));
      ctx.lineTo(x, y + h + (isImportant ? 7 : 4));
      ctx.stroke();
      if (isImportant) {
        ctx.fillStyle = '#d6a642';
        ctx.fillRect(x - 2, y - 10, 4, 4);
      }
    }
    if (this.labMode !== 'critique') {
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
      ctx.fillStyle = '#d7f6ff';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('blend', xBlendStart + 2, y - 9);
      ctx.fillStyle = '#ffb2a3';
      ctx.fillText('cut', xStart + 2, y + h + 18);
    }
    ctx.strokeStyle = '#f8f1dd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, y - 12);
    ctx.lineTo(playX, y + h + 12);
    ctx.stroke();
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
    this.updateCritiqueDock(true);
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

  stepActiveClipFrames(deltaFrames = 1) {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!actor?.activeAction || !clip) return;
    const duration = Math.max(0.001, clip.duration || 0.001);
    const frameCount = Math.max(1, Math.ceil(duration * CRITIQUE_STEP_FPS));
    const currentFrame = this.poseFrameForTime(actor.activeAction.time || 0);
    const nextFrame = ((currentFrame + Number(deltaFrames || 0)) % (frameCount + 1) + (frameCount + 1)) % (frameCount + 1);
    actor.seek(clampValue(nextFrame / CRITIQUE_STEP_FPS, 0, duration));
    this.updateCleanupUi('frame step ' + deltaFrames);
    this.updateCritiqueTransportUi('frame step ' + deltaFrames);
    this.updatePlayerTransportUi();
    this.updateReadout();
  }

  primeExclusiveAccordionState() {
    for (const details of document.querySelectorAll('details.exclusive-accordion')) {
      details.open = false;
    }
  }

  updatePlayerTransportUi(statusText = '') {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!UI.playerTransportLabel) return;
    if (!actor || !clip) {
      UI.playerTransportLabel.textContent = statusText || 'No active clip';
      if (UI.playerPlayPause) UI.playerPlayPause.textContent = 'Play';
      if (UI.playerStop) UI.playerStop.disabled = true;
      return;
    }
    const duration = Math.max(0.001, clip.duration || 0.001);
    const time = clampValue(actor.activeAction?.time || 0, 0, duration);
    UI.playerTransportLabel.textContent = clipLabel(clip) + ' | ' + fmt(time) + ' / ' + fmt(duration);
    if (UI.playerPlayPause) UI.playerPlayPause.textContent = actor.activeAction?.paused ? 'Play' : 'Pause';
    if (UI.playerStop) UI.playerStop.disabled = false;
    if (UI.playerPrevFrame) UI.playerPrevFrame.disabled = false;
    if (UI.playerNextFrame) UI.playerNextFrame.disabled = false;
  }

  cleanupRange(clip) {
    const duration = Math.max(0.001, clip?.duration || 0.001);
    const start = clampValue(UI.cleanupStart?.value, 0, duration);
    const end = clampValue(UI.cleanupEnd?.value, 0, duration);
    return { start: Math.min(start, end), end: Math.max(start, end), duration };
  }

  critiqueTimelineState(actor = this.actors.get(this.selected), clip = actor?.activeClip()) {
    const duration = Math.max(0.001, Number(clip?.duration || 0.001));
    const currentTime = clampValue(actor?.activeAction?.time || 0, 0, duration);
    const currentFrame = Math.round(currentTime * CRITIQUE_STEP_FPS);
    const currentReadFrame = Math.round(currentTime * CRITIQUE_LIVE_FPS);
    const keyframes = this.mergedCritiqueKeyframes(actor, clip);
    return {
      actor,
      clip,
      duration,
      currentTime,
      currentFrame,
      currentReadFrame,
      frameCount: Math.max(1, Math.ceil(duration * CRITIQUE_STEP_FPS)),
      stepFps: CRITIQUE_STEP_FPS,
      liveFps: CRITIQUE_LIVE_FPS,
      keyframes,
      mode: this.critiqueTransportMode || 'step',
    };
  }

  critiqueSetTransportMode(mode = 'step') {
    const nextMode = ['step', 'live', 'loop', 'pingpong'].includes(mode) ? mode : 'step';
    this.critiqueTransportMode = nextMode;
    this.critiqueApplyPlaybackMode();
    this.updateCritiqueTransportUi('mode ' + nextMode);
    this.saveState();
  }

  critiqueApplyPlaybackMode(actor = this.actors.get(this.selected)) {
    if (!actor?.activeAction) return;
    const action = actor.activeAction;
    if (this.critiqueTransportMode === 'step') {
      actor.pauseActive(true);
      return;
    }
    actor.pauseActive(false);
    if (this.critiqueTransportMode === 'pingpong') action.setLoop(THREE.LoopPingPong, Infinity);
    else action.setLoop(THREE.LoopRepeat, Infinity);
  }

  critiqueSeekFrame(frameIndex = 0) {
    const actor = this.actors.get(this.selected);
    const state = this.critiqueTimelineState(actor);
    if (!actor?.activeAction) return;
    const frame = clampValue(Number(frameIndex || 0), 0, state.frameCount);
    actor.seek(frame / CRITIQUE_STEP_FPS);
    this.updateCritiqueTransportUi('frame ' + frame);
    this.updateCritiqueDock(true, 'selected ' + frame);
    this.updateReadout();
  }

  critiqueStepKeyframe(delta = 1) {
    const state = this.critiqueTimelineState();
    if (!state.clip) return;
    const frames = (state.keyframes || []).filter((frame) => Number.isFinite(Number(frame.time))).sort((a, b) => Number(a.time) - Number(b.time));
    const epsilon = 0.0005;
    let targetTime = null;
    if (frames.length) {
      if (delta < 0) targetTime = [...frames].reverse().find((frame) => Number(frame.time) < state.currentTime - epsilon)?.time ?? frames[frames.length - 1].time;
      else targetTime = frames.find((frame) => Number(frame.time) > state.currentTime + epsilon)?.time ?? frames[0].time;
    }
    if (targetTime == null) {
      this.stepActiveClipFrames(delta);
      return;
    }
    this.critiqueSeekFrame(Math.round(Number(targetTime) * CRITIQUE_STEP_FPS));
  }

  critiqueJumpSemantic(name = 'start') {
    const state = this.critiqueTimelineState();
    if (!state.clip) return;
    const frames = state.keyframes || [];
    const findTag = (tag) => frames.find((frame) => String(frame.tag || '').toLowerCase() === tag);
    let targetTime = 0;
    if (name === 'start') targetTime = 0;
    else if (name === 'end') targetTime = state.duration;
    else if (name === 'anticipation') targetTime = findTag('anticipation')?.time ?? Math.min(state.duration * 0.2, state.duration);
    else if (name === 'contact') targetTime = findTag('contact')?.time ?? Math.min(state.duration * 0.5, state.duration);
    else if (name === 'recovery') targetTime = findTag('recoil')?.time ?? findTag('recovery')?.time ?? Math.min(state.duration * 0.8, state.duration);
    this.critiqueSeekFrame(Math.round(targetTime * CRITIQUE_STEP_FPS));
  }

  setCritiqueFrameSlot(frame) {
    if (!frame) return;
    const actor = this.actors.get(this.selected);
    if (!actor?.activeAction) return;
    actor.seek(Number(frame.time || 0));
    this.updateCritiqueTransportUi('slot ' + (frame.frameKey || frame.tag || 'frame'));
    this.updateCritiqueDock(true, 'selected ' + (frame.frameKey || frame.tag || 'frame'));
    this.renderCritiqueFrames();
    this.updateCritiqueDock(true);
    this.updateReadout();
  }

  renderCritiqueFrames() {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    if (!UI.critiqueFrameButtons) return;
    UI.critiqueFrameButtons.replaceChildren();
    const frames = this.mergedCritiqueKeyframes(actor, clip);
    if (!frames.length) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'empty-clip';
      empty.disabled = true;
      empty.textContent = this.labMode === 'critique' ? 'Critique frames pending' : 'Frame rail idle';
      UI.critiqueFrameButtons.append(empty);
      return;
    }
    for (const frame of frames) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.frameKey = frame.frameKey || ('f' + String(frame.spriteFrame).padStart(3, '0'));
      button.textContent = button.dataset.frameKey + (frame.tag ? ' ' + frame.tag : '');
      const note = this.critiqueNoteForFrame(frame, actor, clip);
      button.classList.toggle('active', Math.round((actor?.activeAction?.time || 0) * 60) === Number(frame.spriteFrame || 0));
      button.classList.toggle('noted', Boolean(note));
      if (note?.comment) button.title = note.comment;
      button.addEventListener('click', () => this.setCritiqueFrameSlot(frame));
      UI.critiqueFrameButtons.append(button);
    }
  }

  readPoseCorrections() {
    try {
      const parsed = JSON.parse(localStorage.getItem(POSE_CORRECTIONS_KEY) || '{}') || {};
      return { schema: 'pose-lab-pose-corrections-v1', entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {} };
    } catch (_err) {
      return { schema: 'pose-lab-pose-corrections-v1', entries: {} };
    }
  }

  writePoseCorrections() {
    try { localStorage.setItem(POSE_CORRECTIONS_KEY, JSON.stringify(this.poseCorrections)); } catch (_err) {}
    this.updateUndoRedoUi();
  }

  clonePoseCorrections(corrections = this.poseCorrections) {
    try {
      const copy = JSON.parse(JSON.stringify(corrections || {})) || {};
      return { schema: 'pose-lab-pose-corrections-v1', entries: copy.entries && typeof copy.entries === 'object' ? copy.entries : {} };
    } catch (_err) {
      return { schema: 'pose-lab-pose-corrections-v1', entries: {} };
    }
  }

  readPoseHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(POSE_HISTORY_KEY) || '{}') || {};
      return { schema: 'pose-lab-pose-history-v1', undo: Array.isArray(parsed.undo) ? parsed.undo : [], redo: Array.isArray(parsed.redo) ? parsed.redo : [] };
    } catch (_err) {
      return { schema: 'pose-lab-pose-history-v1', undo: [], redo: [] };
    }
  }

  writePoseHistory() {
    try { localStorage.setItem(POSE_HISTORY_KEY, JSON.stringify(this.poseHistory)); } catch (_err) {}
    this.updateUndoRedoUi();
  }

  poseHistorySnapshot(label = 'pose edit') {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    return {
      schema: 'pose-lab-pose-history-snapshot-v1',
      label,
      savedAt: Date.now(),
      actorKey: actor?.key || this.selected || '',
      clipKey: clip ? clipKey(clip) : '',
      frame: this.currentPoseFrame(actor),
      boneName: actor?.selectedBoneName || this.selectedTouchControl?.boneName || '',
      editMode: this.selectedTouchControl?.editMode || this.poseEditorMode || 'fk',
      poseCorrections: this.clonePoseCorrections(),
    };
  }

  pushPoseHistory(label = 'pose edit', snapshot = null) {
    const item = snapshot || this.poseHistorySnapshot(label);
    this.poseHistory.undo.push(item);
    if (this.poseHistory.undo.length > POSE_HISTORY_LIMIT) this.poseHistory.undo.splice(0, this.poseHistory.undo.length - POSE_HISTORY_LIMIT);
    this.poseHistory.redo = [];
    this.writePoseHistory();
    return item;
  }

  hasPoseCorrectionEntries(corrections = this.poseCorrections) {
    return Object.values(corrections?.entries || {}).some((entry) => Object.values(entry?.keys || {}).some((key) => Object.keys(key?.edits || {}).length));
  }

  restorePoseHistorySnapshot(snapshot, statusText = 'restored pose edit') {
    if (!snapshot?.poseCorrections) return false;
    this.poseCorrections = this.clonePoseCorrections(snapshot.poseCorrections);
    this.writePoseCorrections();
    this.poseCorrectionSessionActive = this.hasPoseCorrectionEntries();
    this.poseOverlayEnabled = this.poseCorrectionSessionActive;
    const actor = this.actors.get(this.selected);
    actor?.seek(actor.activeAction?.time || 0);
    this.applyPoseCorrectionOverlay(actor);
    this.renderCritiqueFrames();
    this.updatePoseEditorUi(statusText);
    this.updateCritiqueTransportUi(statusText);
    this.updatePlayerTransportUi(statusText);
    this.showTouchPoseHud();
    return true;
  }

  undoPoseCorrection() {
    const snapshot = this.poseHistory?.undo?.pop();
    if (!snapshot) return false;
    this.poseHistory.redo.push(this.poseHistorySnapshot('redo pose edit'));
    const restored = this.restorePoseHistorySnapshot(snapshot, 'undo pose edit');
    this.writePoseHistory();
    return restored;
  }

  redoPoseCorrection() {
    const snapshot = this.poseHistory?.redo?.pop();
    if (!snapshot) return false;
    this.poseHistory.undo.push(this.poseHistorySnapshot('undo pose edit'));
    if (this.poseHistory.undo.length > POSE_HISTORY_LIMIT) this.poseHistory.undo.splice(0, this.poseHistory.undo.length - POSE_HISTORY_LIMIT);
    const restored = this.restorePoseHistorySnapshot(snapshot, 'redo pose edit');
    this.writePoseHistory();
    return restored;
  }

  updateUndoRedoUi() {
    if (UI.touchPoseUndo) UI.touchPoseUndo.disabled = !this.poseHistory?.undo?.length;
    if (UI.touchPoseRedo) UI.touchPoseRedo.disabled = !this.poseHistory?.redo?.length;
    UI.touchPoseHud?.classList.toggle('can-undo', Boolean(this.poseHistory?.undo?.length));
    UI.touchPoseHud?.classList.toggle('can-redo', Boolean(this.poseHistory?.redo?.length));
  }

  poseCorrectionEntryKey(actor = this.actors.get(this.selected), clip = actor?.activeClip()) {
    if (!actor || !clip) return '';
    return [actor.key || this.selected || 'actor', clipKey(clip)].join('::');
  }

  poseCorrectionEntry(actor = this.actors.get(this.selected), clip = actor?.activeClip(), create = false) {
    const key = this.poseCorrectionEntryKey(actor, clip);
    if (!key) return null;
    if (!this.poseCorrections.entries[key] && create) {
      this.poseCorrections.entries[key] = {
        schema: 'pose-lab-pose-correction-entry-v1',
        kind: 'critique-guidance',
        destructive: false,
        sourceClipMutation: 'forbidden',
        learningGoal: 'infer correction intent and principles; do not copy corrected frames verbatim',
        actorKey: actor.key,
        actorLabel: actor.info?.label || actor.key,
        clipKey: clipKey(clip),
        clipName: clip.name || '',
        keys: {},
      };
    }
    return this.poseCorrections.entries[key] || null;
  }

  poseFrameForTime(time = 0) {
    return Math.max(0, Math.round(Number(time || 0) * CRITIQUE_STEP_FPS));
  }

  currentPoseFrame(actor = this.actors.get(this.selected)) {
    return this.poseFrameForTime(actor?.activeAction?.time || 0);
  }

  poseCorrectionFrames(actor = this.actors.get(this.selected), clip = actor?.activeClip()) {
    const entry = this.poseCorrectionEntry(actor, clip, false);
    const keys = Object.values(entry?.keys || {})
      .map((key) => ({
        frame: Number(key.frame || 0),
        time: Number(key.time ?? (Number(key.frame || 0) / CRITIQUE_STEP_FPS)),
        frameKey: 'k' + String(Number(key.frame || 0)).padStart(3, '0'),
        spriteFrame: Math.round(Number(key.time ?? (Number(key.frame || 0) / CRITIQUE_STEP_FPS)) * CRITIQUE_LIVE_FPS),
        tag: key.tag || 'key',
        source: 'pose-correction',
      }))
      .filter((key) => Number.isFinite(key.frame))
      .sort((a, b) => a.time - b.time);
    return keys;
  }

  mergedCritiqueKeyframes(actor = this.actors.get(this.selected), clip = actor?.activeClip()) {
    const seen = new Set();
    return [...this.visualQaReadFrames(clip), ...this.poseCorrectionFrames(actor, clip)]
      .filter((frame) => {
        const key = String(Math.round(Number(frame.time || 0) * CRITIQUE_STEP_FPS)) + ':' + String(frame.tag || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
  }

  currentPoseCorrectionKey(create = false) {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    const entry = this.poseCorrectionEntry(actor, clip, create);
    if (!entry) return null;
    const frame = this.currentPoseFrame(actor);
    const frameId = String(frame);
    if (!entry.keys[frameId] && create) {
      entry.keys[frameId] = {
        schema: 'pose-lab-pose-correction-key-v1',
        kind: 'critique-guidance',
        destructive: false,
        sourceClipMutation: 'forbidden',
        learningGoal: 'infer correction intent and principles; do not copy corrected frames verbatim',
        frame,
        time: frame / CRITIQUE_STEP_FPS,
        tag: 'key',
        edits: {},
      };
    }
    return entry.keys[frameId] || null;
  }

  correctionForActorTime(actor = this.actors.get(this.selected), clip = actor?.activeClip()) {
    if (!this.poseCorrectionSessionActive || !this.poseOverlayEnabled) return null;
    const entry = this.poseCorrectionEntry(actor, clip, false);
    const keys = Object.values(entry?.keys || {}).sort((a, b) => Number(a.frame || 0) - Number(b.frame || 0));
    if (!keys.length) return null;
    const frame = this.currentPoseFrame(actor);
    const exact = keys.find((key) => Number(key.frame || 0) === frame);
    if (exact) return exact;
    const prev = [...keys].reverse().find((key) => Number(key.frame || 0) < frame);
    const next = keys.find((key) => Number(key.frame || 0) > frame);
    if (!prev && !next) return null;
    if (!prev) return next;
    if (!next) return prev;
    const span = Math.max(1, Number(next.frame || 0) - Number(prev.frame || 0));
    const alpha = (frame - Number(prev.frame || 0)) / span;
    const names = new Set([...Object.keys(prev.edits || {}), ...Object.keys(next.edits || {})]);
    const edits = {};
    for (const name of names) edits[name] = blendPoseEdit(prev.edits?.[name] || poseEditDefaults(), next.edits?.[name] || poseEditDefaults(), alpha);
    return { schema: 'pose-lab-pose-correction-key-v1', frame, time: frame / CRITIQUE_STEP_FPS, tag: 'blend', edits };
  }

  applyPoseCorrectionOverlay(actor = this.actors.get(this.selected)) {
    if (!this.poseCorrectionSessionActive || !this.poseOverlayEnabled) return;
    const clip = actor?.activeClip();
    const correction = this.correctionForActorTime(actor, clip);
    if (!actor || !correction) return;
    actor.resetPoseCorrectionBase();
    actor.applyPoseCorrection(correction);
  }

  readCritiqueNotes() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CRITIQUE_NOTES_KEY) || '{}') || {};
      return { schema: 'pose-lab-critique-notes-v1', entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {} };
    } catch (_err) {
      return { schema: 'pose-lab-critique-notes-v1', entries: {} };
    }
  }

  writeCritiqueNotes() {
    try { localStorage.setItem(CRITIQUE_NOTES_KEY, JSON.stringify(this.critiqueNotes)); } catch (_err) {}
  }

  critiqueNoteKey(actor = this.actors.get(this.selected), clip = actor?.activeClip(), frame = this.currentCritiqueFrameSlot(actor)) {
    if (!actor || !clip || !frame) return '';
    return [actor.key || this.selected || 'actor', clipKey(clip), frame.frameKey || ('f' + String(frame.spriteFrame || 0).padStart(3, '0'))].join('::');
  }

  critiqueNoteForFrame(frame, actor = this.actors.get(this.selected), clip = actor?.activeClip()) {
    const key = this.critiqueNoteKey(actor, clip, frame);
    return key ? (this.critiqueNotes?.entries?.[key] || clip?.userData?.critique?.note || null) : (clip?.userData?.critique?.note || null);
  }

  currentCritiqueFrameSlot(actor = this.actors.get(this.selected)) {
    const state = this.critiqueTimelineState(actor);
    const frames = state.keyframes || [];
    const currentFrame = Number.isFinite(state.currentFrame) ? state.currentFrame : 0;
    if (!frames.length) return {
      frameKey: 'f' + String(currentFrame).padStart(3, '0'),
      tag: 'frame',
      spriteFrame: Number(state.currentReadFrame || currentFrame),
      time: Number(state.currentTime || 0),
    };
    const exact = frames.find((frame) => Number(frame.spriteFrame || 0) === Number(state.currentReadFrame || currentFrame));
    if (exact) return exact;
    return frames.reduce((best, frame) => {
      if (!best) return frame;
      const currentDelta = Math.abs(Number(frame.spriteFrame || 0) - Number(state.currentReadFrame || currentFrame));
      const bestDelta = Math.abs(Number(best.spriteFrame || 0) - Number(state.currentReadFrame || currentFrame));
      return currentDelta < bestDelta ? frame : best;
    }, null);
  }

  critiqueReadTextField(value) {
    return String(value || '')
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  critiqueLoadFrameNote(note) {
    if (!note) {
      if (UI.critiqueComment) UI.critiqueComment.value = '';
      if (UI.critiqueMarks) UI.critiqueMarks.value = '';
      if (UI.critiqueBones) UI.critiqueBones.value = '';
      return;
    }
    if (UI.critiqueComment) UI.critiqueComment.value = String(note.comment || '');
    if (UI.critiqueMarks) UI.critiqueMarks.value = (note.marks || []).join(', ');
    if (UI.critiqueBones) UI.critiqueBones.value = (note.bones || []).join(', ');
  }

  critiquePersistCurrentNote(statusText = 'saved note') {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    const frame = this.currentCritiqueFrameSlot(actor);
    if (!actor || !clip || !frame) {
      this.updateCritiqueDock(true, 'no frame selected');
      return null;
    }
    const key = this.critiqueNoteKey(actor, clip, frame);
    if (!key) return null;
    const comment = String(UI.critiqueComment?.value || '').trim();
    const marks = this.critiqueReadTextField(UI.critiqueMarks?.value || '');
    const bones = this.critiqueReadTextField(UI.critiqueBones?.value || '');
    const now = new Date().toISOString();
    const existing = this.critiqueNotes.entries[key] || null;
    if (!comment && !marks.length && !bones.length) {
      delete this.critiqueNotes.entries[key];
      this.writeCritiqueNotes();
      this.renderCritiqueFrames();
      this.updateCritiqueDock(true);
      this.updateCritiqueDock(true, statusText || 'cleared note');
      return { removed: true, key };
    }
    this.critiqueNotes.entries[key] = {
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      actorKey: actor.key,
      actorLabel: actor.info?.label || actor.key,
      clipKey: clipKey(clip),
      clipName: clip.name || '',
      frameKey: frame.frameKey || '',
      tag: frame.tag || '',
      spriteFrame: frame.spriteFrame,
      sourceTime: Number(frame.time || 0),
      comment,
      marks,
      bones,
      mode: 'grease-pencil-comment-v1',
    };
    this.critiqueFrameKey = key;
    this.writeCritiqueNotes();
    this.renderCritiqueFrames();
    this.updateCritiqueDock(true);
    this.updateCritiqueDock(true, statusText || 'saved note');
    return this.critiqueNotes.entries[key];
  }

  critiqueCopyCurrentNote() {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    const frame = this.currentCritiqueFrameSlot(actor);
    if (!actor || !clip || !frame) return;
    const key = this.critiqueNoteKey(actor, clip, frame);
    const note = key ? (this.critiqueNotes.entries[key] || clip?.userData?.critique?.note || null) : (clip?.userData?.critique?.note || null);
    const payload = note || {
      actorKey: actor.key,
      actorLabel: actor.info?.label || actor.key,
      clipKey: clipKey(clip),
      clipName: clip.name || '',
      frameKey: frame.frameKey || '',
      tag: frame.tag || '',
      spriteFrame: frame.spriteFrame,
      sourceTime: Number(frame.time || 0),
      comment: String(UI.critiqueComment?.value || '').trim(),
      marks: this.critiqueReadTextField(UI.critiqueMarks?.value || ''),
      bones: this.critiqueReadTextField(UI.critiqueBones?.value || ''),
      mode: 'grease-pencil-comment-v1',
    };
    const text = JSON.stringify(payload, null, 2);
    if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => this.updateCritiqueDock(false, 'copied note json')).catch(() => this.updateCritiqueDock(false, 'copy failed'));
  }

  poseEditableBones(actor = this.actors.get(this.selected)) {
    const query = String(UI.poseBoneSearch?.value || '').toLowerCase().trim();
    return (actor?.bones || []).filter((bone) => {
      if (!query) return true;
      return String(bone.name || '').toLowerCase().includes(query) || shortBoneName(bone.name).toLowerCase().includes(query);
    });
  }

  populatePoseBoneSelect(actor = this.actors.get(this.selected)) {
    if (!UI.poseBoneSelect) return;
    const previous = actor?.selectedBoneName || '';
    UI.poseBoneSelect.replaceChildren();
    for (const bone of this.poseEditableBones(actor)) {
      const option = document.createElement('option');
      option.value = bone.name;
      option.textContent = shortBoneName(bone.name);
      option.title = bone.name;
      UI.poseBoneSelect.append(option);
    }
    if (previous && [...UI.poseBoneSelect.options].some((option) => option.value === previous)) UI.poseBoneSelect.value = previous;
    else UI.poseBoneSelect.selectedIndex = -1;
  }

  poseEditForSelectedBone(create = false) {
    const actor = this.actors.get(this.selected);
    const boneName = UI.poseBoneSelect?.value || actor?.selectedBoneName || '';
    const key = this.currentPoseCorrectionKey(create);
    if (!key || !boneName) return { key: null, boneName, edit: poseEditDefaults() };
    if (!key.edits) key.edits = {};
    if (!key.edits[boneName] && create) {
      key.edits[boneName] = {
        ...poseEditDefaults(),
        mode: 'fk',
        space: 'local',
      };
    }
    return { key, boneName, edit: { ...poseEditDefaults(), ...(key.edits[boneName] || {}) } };
  }

  setPoseEditorValues(edit = poseEditDefaults()) {
    const fields = [
      [UI.poseNudgeX, UI.poseNudgeXValue, edit.x || 0, ''],
      [UI.poseNudgeY, UI.poseNudgeYValue, edit.y || 0, ''],
      [UI.poseNudgeZ, UI.poseNudgeZValue, edit.z || 0, ''],
      [UI.poseRotX, UI.poseRotXValue, edit.rotX || 0, ''],
      [UI.poseRotY, UI.poseRotYValue, edit.rotY || 0, ''],
      [UI.poseRotZ, UI.poseRotZValue, edit.rotZ || 0, ''],
      [UI.poseScale, UI.poseScaleValue, edit.scale || 100, '%'],
    ];
    for (const [input, label, value, suffix] of fields) {
      if (input) input.value = String(Math.round(Number(value || 0)));
      if (label) label.textContent = String(Math.round(Number(value || 0))) + suffix;
    }
    if (UI.poseUseScale) UI.poseUseScale.checked = Boolean(edit.useScale);
  }

  getPoseEditorValues() {
    return {
      ...poseEditDefaults(),
      mode: this.poseEditorMode,
      space: this.poseEditorSpace,
      x: Number(UI.poseNudgeX?.value || 0),
      y: Number(UI.poseNudgeY?.value || 0),
      z: Number(UI.poseNudgeZ?.value || 0),
      rotX: Number(UI.poseRotX?.value || 0),
      rotY: Number(UI.poseRotY?.value || 0),
      rotZ: Number(UI.poseRotZ?.value || 0),
      scale: Number(UI.poseScale?.value || 100),
      useScale: Boolean(UI.poseUseScale?.checked),
    };
  }

  updatePoseEditorUi(statusText = '') {
    const actor = this.actors.get(this.selected);
    this.populatePoseBoneSelect(actor);
    const { boneName, edit } = this.poseEditForSelectedBone(false);
    const endpoint = isEndpointBoneName(boneName);
    if (!this.poseEditorMode || (this.poseEditorMode === 'ik' && !endpoint)) this.poseEditorMode = 'fk';
    if (!this.poseEditorSpace || this.poseEditorMode === 'fk') this.poseEditorSpace = 'local';
    const current = { ...edit, mode: this.poseEditorMode, space: this.poseEditorSpace };
    this.setPoseEditorValues(current);
    UI.poseModeIk?.classList.toggle('active', this.poseEditorMode === 'ik');
    UI.poseModeFk?.classList.toggle('active', this.poseEditorMode === 'fk');
    UI.poseSpaceGlobal?.classList.toggle('active', this.poseEditorSpace === 'global');
    UI.poseSpaceLocal?.classList.toggle('active', this.poseEditorSpace === 'local');
    if (UI.poseModeIk) UI.poseModeIk.disabled = !endpoint;
    if (UI.poseEditStatus) UI.poseEditStatus.textContent = statusText || (boneName ? [shortBoneName(boneName), this.poseEditorMode.toUpperCase(), this.poseEditorSpace, 'frame ' + this.currentPoseFrame(actor)].join(' | ') : 'select a bone');
  }

  selectPoseEditBone(name) {
    const actor = this.actors.get(this.selected);
    if (actor?.selectBone(name)) {
      if (UI.boneSelect) UI.boneSelect.value = actor.selectedBoneName;
      this.poseEditorMode = 'fk';
      this.poseEditorSpace = 'local';
      this.updatePoseEditorUi('selected ' + shortBoneName(actor.selectedBoneName));
    }
  }

  setPoseEditorMode(mode) {
    const boneName = UI.poseBoneSelect?.value || '';
    this.poseEditorMode = mode === 'ik' && isEndpointBoneName(boneName) ? 'ik' : 'fk';
    this.applyPoseEditorEdit('mode ' + this.poseEditorMode);
  }

  setPoseEditorSpace(space) {
    this.poseEditorSpace = space === 'global' ? 'global' : 'local';
    this.applyPoseEditorEdit('space ' + this.poseEditorSpace);
  }

  currentCritiqueLearningContext(actor = this.actors.get(this.selected), clip = actor?.activeClip()) {
    const frame = this.currentCritiqueFrameSlot(actor);
    const key = this.critiqueNoteKey(actor, clip, frame);
    const saved = key ? this.critiqueNotes.entries[key] || null : null;
    const liveComment = String(UI.critiqueComment?.value || '').trim();
    const liveMarks = this.critiqueReadTextField(UI.critiqueMarks?.value || '');
    const liveBones = this.critiqueReadTextField(UI.critiqueBones?.value || '');
    return {
      schema: 'pose-lab-correction-learning-context-v1',
      frameKey: frame?.frameKey || '',
      frameTag: frame?.tag || '',
      spriteFrame: Number(frame?.spriteFrame || 0),
      sourceTime: Number(frame?.time || actor?.activeAction?.time || 0),
      comment: liveComment || saved?.comment || '',
      marks: liveMarks.length ? liveMarks : (saved?.marks || []),
      bones: liveBones.length ? liveBones : (saved?.bones || []),
    };
  }

  annotatePoseCorrectionKey(key, actor = this.actors.get(this.selected), clip = actor?.activeClip()) {
    if (!key) return null;
    key.kind = 'critique-guidance';
    key.destructive = false;
    key.sourceClipMutation = 'forbidden';
    key.learningGoal = 'infer correction intent and principles; do not copy corrected frames verbatim';
    key.learningContext = this.currentCritiqueLearningContext(actor, clip);
    return key;
  }

  applyPoseEditorEdit(statusText = 'edited pose') {
    const actor = this.actors.get(this.selected);
    const boneName = UI.poseBoneSelect?.value || actor?.selectedBoneName || '';
    if (!actor || !boneName) return null;
    this.pushPoseHistory(statusText || 'edited pose');
    const key = this.currentPoseCorrectionKey(true);
    if (!key) return null;
    const edit = this.getPoseEditorValues();
    edit.mode = edit.mode === 'ik' && isEndpointBoneName(boneName) ? 'ik' : 'fk';
    key.edits[boneName] = edit;
    this.annotatePoseCorrectionKey(key, actor, actor.activeClip());
    this.poseCorrectionSessionActive = true;
    this.poseOverlayEnabled = true;
    this.writePoseCorrections();
    this.applyPoseCorrectionOverlay(actor);
    this.updatePoseEditorUi(statusText);
    this.updateCritiqueTransportUi(statusText);
    return key;
  }

  savePoseCorrectionKey(statusText = 'saved pose key') {
    const key = this.applyPoseEditorEdit(statusText);
    if (!key) return null;
    key.tag = 'key';
    key.updatedAt = new Date().toISOString();
    this.annotatePoseCorrectionKey(key);
    this.writePoseCorrections();
    this.renderCritiqueFrames();
    this.updateCritiqueDock(true, statusText);
    return key;
  }

  resetCurrentPoseCorrectionKey() {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    const entry = this.poseCorrectionEntry(actor, clip, false);
    const frame = this.currentPoseFrame(actor);
    if (entry?.keys?.[String(frame)]) this.pushPoseHistory('reset pose frame ' + frame);
    if (entry?.keys) delete entry.keys[String(frame)];
    this.writePoseCorrections();
    this.setPoseEditorValues(poseEditDefaults());
    actor?.seek(actor.activeAction?.time || 0);
    this.updatePoseEditorUi('reset pose frame ' + frame);
    this.renderCritiqueFrames();
  }

  resetActiveClipPoseCorrections() {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    const key = this.poseCorrectionEntryKey(actor, clip);
    if (key && this.poseCorrections.entries[key]) this.pushPoseHistory('reset clip edits');
    if (key) delete this.poseCorrections.entries[key];
    this.writePoseCorrections();
    actor?.seek(actor.activeAction?.time || 0);
    this.updatePoseEditorUi('reset clip edits');
    this.renderCritiqueFrames();
  }

  togglePoseOverlayCompare() {
    this.poseOverlayEnabled = !this.poseOverlayEnabled;
    const actor = this.actors.get(this.selected);
    actor?.seek(actor.activeAction?.time || 0);
    UI.poseCompareOverlay?.classList.toggle('active', this.poseOverlayEnabled);
    this.updatePoseEditorUi(this.poseOverlayEnabled ? 'corrections on' : 'corrections off');
  }

  openCorrectPose() {
    const actor = this.actors.get(this.selected);
    this.poseCorrectionSessionActive = true;
    this.poseOverlayEnabled = false;
    if (actor) {
      actor.setBoneOverlayVisible(true);
      actor.setTouchRigControlsVisible(true);
      actor.seek(actor.activeAction?.time || 0);
    }
    document.body.classList.toggle('pose-correction-active', true);
    this.populatePoseBoneSelect(actor);
    if (UI.poseEditDock) UI.poseEditDock.open = false;
    this.showTouchPoseHud({ actorKey: actor?.key || this.selected, boneName: '', kind: 'fk' });
    this.updatePoseEditorUi('FK skeleton and IK handles active. Drag a bone for FK or a large hand/foot control for IK.');
    this.updateCritiqueDock(true, 'IK handles active; FK bones remain selectable');
  }

  critiquePromoteCurrentFrame() {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    const frame = this.currentCritiqueFrameSlot(actor);
    if (!actor || !clip || !frame) {
      this.updateCritiqueDock(true, 'no frame selected');
      return null;
    }
    const key = this.critiqueNoteKey(actor, clip, frame);
    if (!key) return null;
    const poseKey = this.currentPoseCorrectionKey(true);
    if (poseKey) {
      poseKey.tag = frame.tag || 'key';
      poseKey.updatedAt = new Date().toISOString();
      this.annotatePoseCorrectionKey(poseKey, actor, clip);
      this.writePoseCorrections();
    }
    const now = new Date().toISOString();
    const existing = this.critiqueNotes.entries[key] || null;
    const comment = String(UI.critiqueComment?.value || existing?.comment || frame.tag || 'key pose').trim() || 'key pose';
    const marks = new Set(this.critiqueReadTextField(UI.critiqueMarks?.value || ''));
    for (const mark of existing?.marks || []) marks.add(mark);
    marks.add('key');
    const bones = existing?.bones?.length ? [...existing.bones] : this.critiqueReadTextField(UI.critiqueBones?.value || '');
    this.critiqueNotes.entries[key] = {
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      actorKey: actor.key,
      actorLabel: actor.info?.label || actor.key,
      clipKey: clipKey(clip),
      clipName: clip.name || '',
      frameKey: frame.frameKey || '',
      tag: frame.tag || '',
      spriteFrame: frame.spriteFrame,
      sourceTime: Number(frame.time || 0),
      comment,
      marks: [...marks],
      bones,
      mode: 'pose-keyframe-v1',
    };
    this.critiqueFrameKey = key;
    this.writeCritiqueNotes();
    this.renderCritiqueFrames();
    this.updateCritiqueDock(true, 'marked key pose');
    return this.critiqueNotes.entries[key];
  }

  critiqueToggleCompare() {
    const actor = this.actors.get(this.selected);
    const activeClip = actor?.activeClip();
    if (!actor || !activeClip) return;
    if (this.critiqueCompareState?.actorKey === actor.key && this.critiqueCompareState?.clipKey) {
      const restore = this.critiqueCompareState;
      const restoreClip = this.findClipByKey(actor, restore.clipKey);
      if (restoreClip) {
        actor.play(clipKey(restoreClip));
        actor.seek(clampValue(restore.time || 0, 0, Math.max(0.001, restoreClip.duration || 0.001)));
      }
      this.critiqueCompareState = null;
      this.updateCritiqueDock(true, 'compare off');
      return;
    }
    const sourceKey = activeClip.userData?.sourceKey;
    if (!sourceKey || !actor.actions.has(sourceKey)) {
      this.updateCritiqueDock(true, 'no source clip to compare');
      return;
    }
    this.critiqueCompareState = {
      actorKey: actor.key,
      clipKey: clipKey(activeClip),
      clipName: activeClip.name || '',
      time: Number(actor.activeAction?.time || 0),
      sourceKey,
    };
    const sourceClip = actor.actions.get(sourceKey)?._clip || this.findClipByKey(actor, sourceKey);
    if (sourceClip) {
      actor.play(sourceKey);
      actor.seek(clampValue(this.critiqueCompareState.time, 0, Math.max(0.001, sourceClip.duration || 0.001)));
    }
    this.updateCritiqueDock(true, 'compare source');
  }

  updateCritiqueDock(force = false, statusText = '') {
    return this.critiqueUpdateDock(force, statusText);
  }

  critiqueUpdateDock(force = false, statusText = '') {
    const actor = this.actors.get(this.selected);
    const clip = actor?.activeClip();
    const frame = this.currentCritiqueFrameSlot(actor);
    const clipLabelText = clip ? clipLabel(clip) : 'no clip';
    const frameKey = this.critiqueNoteKey(actor, clip, frame);
    const note = frameKey ? this.critiqueNotes.entries[frameKey] || clip?.userData?.critique?.note || null : clip?.userData?.critique?.note || null;
    if (UI.critiqueFrameSummary) {
      const noteCount = Object.keys(this.critiqueNotes.entries || {}).length;
      UI.critiqueFrameSummary.textContent = (actor?.info?.label || 'Pose Critique') + ' | ' + clipLabelText + ' | notes=' + noteCount;
    }
    if (UI.critiqueFrameLabel) {
      UI.critiqueFrameLabel.textContent = frame ? (frame.frameKey || 'frame') + ' • ' + (frame.tag || 'frame') + ' • ' + String(frame.spriteFrame || 0) : 'No active frame';
    }
    if (UI.critiqueFrameStatus) UI.critiqueFrameStatus.textContent = note ? (note.comment || 'saved note') : 'Pick a frame, then note the pose';
    if (force || this.critiqueFrameKey !== frameKey) {
      this.critiqueFrameKey = frameKey;
      this.critiqueLoadFrameNote(note);
    }
    if (UI.critiqueLog) {
      if (statusText) UI.critiqueLog.textContent = statusText;
      else if (note?.comment) UI.critiqueLog.textContent = note.comment;
      else UI.critiqueLog.textContent = 'notes idle';
    }
    if (UI.critiqueFrameStatus && this.critiqueCompareState?.actorKey === actor?.key) UI.critiqueFrameStatus.textContent = 'Compare mode active';
    if (UI.critiqueSaveNote) UI.critiqueSaveNote.disabled = !(actor && clip && frame);
    if (UI.critiqueClearNote) UI.critiqueClearNote.disabled = !(actor && clip && frame) && !note;
    if (UI.critiqueCopyNote) UI.critiqueCopyNote.disabled = !(actor && clip && frame);
    if (UI.critiqueCompare) UI.critiqueCompare.classList.toggle('active', Boolean(this.critiqueCompareState));
  }

  queueCritiqueNoteSave() {
    if (this.critiqueNoteSaveTimer) window.clearTimeout(this.critiqueNoteSaveTimer);
    this.critiqueNoteSaveTimer = window.setTimeout(() => {
      this.critiqueNoteSaveTimer = null;
      this.critiquePersistCurrentNote();
    }, 180);
  }

  critiqueTogglePlayback() {
    const actor = this.actors.get(this.selected);
    if (!actor?.activeAction) return;
    actor.pauseActive(!actor.activeAction.paused);
    this.critiqueTransportMode = actor.activeAction.paused ? 'step' : 'live';
    this.critiqueApplyPlaybackMode(actor);
    this.updateCritiqueTransportUi(actor.activeAction.paused ? 'paused' : 'playing');
    this.updateCritiqueDock(false);
  }

  updateCritiqueTransportUi(statusText = '') {
    const actor = this.actors.get(this.selected);
    const state = this.critiqueTimelineState(actor);
    if (!UI.critiqueScrub || !actor?.activeAction || !state.clip) {
      if (UI.critiquePlayPause) UI.critiquePlayPause.textContent = 'Pause';
      this.updateCritiqueDock(false);
      if (UI.critiqueScrub) {
        UI.critiqueScrub.value = '0';
        UI.critiqueScrub.max = '0';
      }
      return;
    }
    const currentTime = state.currentTime;
    UI.critiqueScrub.max = state.duration.toFixed(3);
    UI.critiqueScrub.step = '0.001';
    UI.critiqueScrub.value = currentTime.toFixed(3);
    if (UI.critiquePlayPause) UI.critiquePlayPause.textContent = actor.activeAction.paused ? 'Play' : 'Pause';
    for (const [button, mode] of [
      [UI.critiqueStepMode, 'step'],
      [UI.critiqueLiveMode, 'live'],
      [UI.critiqueLoopMode, 'loop'],
      [UI.critiquePingPongMode, 'pingpong'],
    ]) {
      button?.classList.toggle('active', this.critiqueTransportMode === mode);
    }
    if (UI.critiqueScrub && !statusText) UI.critiqueScrub.title = 'step frame ' + state.currentFrame + ' / read ' + state.currentReadFrame;
    if (UI.critiqueScrub) UI.critiqueScrub.step = String(1 / CRITIQUE_STEP_FPS);
    this.updateCritiqueDock(false, statusText);
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
    if (UI.cleanupPlayPause) UI.cleanupPlayPause.textContent = actor.activeAction?.paused ? 'Play' : 'Pause';
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
    this.updatePlayerTransportUi();
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
    this.updatePlayerTransportUi(actor.activeAction.paused ? 'paused' : 'playing');
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
    this.updateCritiqueDock(true);
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
    this.updateCritiqueDock(true);
    this.cleanupLastClipKey = '';
    this.updateCleanupUi('restored original');
    this.updateReadout();
  }

  normalizePanelName(panel) {
    const requested = panel || 'none';
    if (requested === 'view') return 'view';
    if (requested === 'advanced') return 'advanced';
    if (requested === 'edit') return 'edit';
    if (requested === 'pose') return 'pose';
    if (requested === 'cleanup') return this.labMode === 'critique' ? 'edit' : 'cleanup';
    return (UI.panels[requested] || requested === 'none') ? requested : 'none';
  }

  panelElementName(panel) {
    if (CLEANUP_SHEET_PANELS.has(panel)) return 'cleanup';
    if (panel === 'view') return 'info';
    return panel;
  }

  setPanel(panel) {
    const nextPanel = this.normalizePanelName(panel);
    const elementPanel = this.panelElementName(nextPanel);
    this.activePanel = nextPanel;
    for (const button of UI.panelButtons) button.classList.toggle('active', button.dataset.panel === nextPanel);
    for (const [name, element] of Object.entries(UI.panels)) {
      if (element) element.classList.toggle('open', nextPanel !== 'none' && name === elementPanel);
    }
    for (const name of PHONE_SHEET_PANELS) document.body.classList.toggle('sheet-' + name, nextPanel === name);
    document.body.dataset.sheet = nextPanel;
    document.body.classList.toggle('panel-open-info', elementPanel === 'info');
    document.body.classList.toggle('has-open-panel', nextPanel !== 'none');
    if (elementPanel === 'cleanup') this.updateCleanupUi();
    if (nextPanel === 'pose' || this.labMode === 'critique') this.updateCritiqueDock(true);
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
        actor.pauseActive(false);
        this.critiqueTransportMode = 'live';
        this.saveState();
        this.renderClipButtons();
        this.updateCleanupUi('playing ' + entry.label);
        this.updatePlayerTransportUi('playing ' + entry.label);
        this.updateCritiqueTransportUi('playing ' + entry.label);
        this.updateReadout();
      });
      UI.clipButtons.append(button);
    }
    this.renderCritiqueFrames();
    this.updateCritiqueDock(true);
    this.updateCritiqueDock(true);
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
    this.updateCritiqueTransportUi();
    this.updateCritiqueDock(true);
  }

  installDebugConsole() {
    if (typeof window === 'undefined') return;
    const api = {
      help: () => this.debugHelpText(),
      helpText: () => this.debugHelpText(),
      commands: () => this.debugCommandNames(),
      status: () => this.debugSnapshot(),
      snapshot: () => this.debugSnapshot(),
      readout: () => this.debugReadout(),
      diagnostic: () => this.debugDiagnostic(),
      exec: (input) => this.executeDebugCommand(input),
      run: (input) => this.executeDebugCommand(input),
      beacon: () => this.debugEmitBeacon('manual'),
      capture: () => this.debugEmitCapture('manual'),
    };
    window.poseLab = this;
    window.poseLabDebug = api;
    window.__poseLabDebug = api;
    window.poseLabDebugState = this.debugBridgeState;
  }

  debugCommandNames() {
    return ['help', 'status', 'snapshot', 'inspect', 'state', 'readout', 'diagnostic', 'actor', 'clip', 'bone', 'view', 'panel', 'play', 'pause', 'stop', 'seek', 'frame', 'beacon', 'capture', 'qa'];
  }

  debugHelpText() {
    return [
      'Pose Lab debug commands:',
      this.debugCommandNames().join(', '),
      'Examples:',
      '  status',
      '  actor orc',
      '  clip standing_melee_attack_horizontal [smooth]',
      '  bone mixamorig:LeftHand',
      '  view firstPerson',
      '  panel bones',
      '  pause',
      '  seek 0.25',
      '  qa capture',
    ].join('\n');
  }

  debugCurrentActor() {
    return this.actors.get(this.selected) || null;
  }

  debugCurrentClip(actor = this.debugCurrentActor()) {
    return actor?.activeClip() || null;
  }

  debugReadout(actor = this.debugCurrentActor()) {
    return {
      readout: actor?.readout?.() || '',
      diagnostic: actor?.diagnosticLine?.() || '',
    };
  }

  debugSnapshot() {
    const actor = this.debugCurrentActor();
    const clip = this.debugCurrentClip(actor);
    const readout = this.debugReadout(actor);
    return {
      schema: 'pose-lab-debug-snapshot-v1',
      build: LAB_BUILD,
      labMode: this.labMode,
      startupReady: this.startupReady,
      selectedActor: this.selected || '',
      actorLabel: actor?.info?.label || '',
      activePanel: this.activePanel || 'none',
      viewMode: this.viewMode,
      selectedBone: actor?.selectedBoneName || '',
      selectedBoneStatus: actor?.selectedBoneStatus?.() || '',
      selectedBoneEdit: actor?.selectedBoneName ? { ...(actor?.currentBoneEdit?.(actor.selectedBoneName) || {}), boneName: actor.selectedBoneName } : null,
      selectedBoneLocalQuaternion: actor?.selectedBoneName && actor?.boneByName?.has(actor.selectedBoneName)
        ? actor.boneByName.get(actor.selectedBoneName).quaternion.toArray()
        : null,
      selectedBoneRestQuaternion: actor?.selectedBoneName && actor?.boneRest?.has(actor.selectedBoneName)
        ? actor.boneRest.get(actor.selectedBoneName).quaternion.toArray()
        : null,
      selectedBoneWorldQuaternion: actor?.selectedBoneName && actor?.boneByName?.has(actor.selectedBoneName)
        ? worldQuaternionOf(actor.boneByName.get(actor.selectedBoneName)).toArray()
        : null,
      boneEditCount: actor?.boneEdits?.size || 0,
      activeClip: clip ? {
        name: clip.name || '',
        key: clipKey(clip),
        origin: clip?.userData?.origin || '',
        sourceName: clip?.userData?.sourceName || '',
        duration: Number(clip.duration || 0),
        time: Number(actor?.activeAction?.time || 0),
        paused: Boolean(actor?.activeAction?.paused),
      } : null,
      readout: readout.readout,
      diagnostic: readout.diagnostic,
      statusText: UI.status?.textContent || '',
      loadStateText: UI.loadState?.textContent || '',
      visualQa: this.visualQa ? {
        enabled: Boolean(this.visualQa.enabled),
        beacon: Boolean(this.visualQa.beacon),
        capture: Boolean(this.visualQa.capture),
        actor: this.visualQa.actor || '',
        clip: this.visualQa.clip || '',
        frameMode: this.visualQa.frameMode || '',
        rendered: Boolean(this.visualQaState?.rendered),
        captured: Number(this.visualQaState?.captured || 0),
      } : null,
      debugBridge: {
        enabled: Boolean(this.debugBridge?.enabled),
        url: this.debugBridge?.url || '',
        connected: Boolean(this.debugBridgeState?.connected),
        clientId: this.debugBridgeState?.clientId || '',
        lastCommand: this.debugBridgeState?.lastCommand || '',
        lastCommandId: this.debugBridgeState?.lastCommandId || '',
        lastError: this.debugBridgeState?.lastError || '',
        syncAt: Number(this.debugBridgeState?.syncAt || 0),
      },
    };
  }

  debugEmitBeacon(stage = 'manual') {
    const snapshot = this.debugSnapshot();
    const actor = this.debugCurrentActor();
    const clip = this.debugCurrentClip(actor);
    const meta = {
      actor: snapshot.selectedActor,
      clip: clip?.name || '',
      clipKey: clip ? clipKey(clip) : '',
      origin: clip?.userData?.origin || '',
      sourceName: clip?.userData?.sourceName || '',
      frameMode: this.visualQa?.frameMode || '',
    };
    if (this.visualQa?.enabled) postVisualQaBeacon(stage, meta);
    return { ok: true, command: 'beacon', stage, sent: Boolean(this.visualQa?.enabled), meta, snapshot };
  }

  debugEmitCapture(stage = 'manual') {
    const snapshot = this.debugSnapshot();
    const actor = this.debugCurrentActor();
    const clip = this.debugCurrentClip(actor);
    const meta = {
      actor: snapshot.selectedActor,
      clip: clip?.name || '',
      clipKey: clip ? clipKey(clip) : '',
      origin: clip?.userData?.origin || '',
      sourceName: clip?.userData?.sourceName || '',
      tag: 'debug',
      spriteFrame: '',
      poseclipTime: '',
      frameMode: this.visualQa?.frameMode || '',
    };
    if (this.visualQa?.enabled) postVisualQaCapture(this.renderer.domElement, meta);
    return { ok: true, command: 'capture', stage, sent: Boolean(this.visualQa?.enabled), meta, snapshot };
  }

  async executeDebugCommand(input) {
    const spec = normalizeDebugCommand(input);
    const actor = this.debugCurrentActor();
    const respond = (extra = {}) => ({ ok: true, command: spec.name, args: spec.args, ...extra, snapshot: this.debugSnapshot() });
    if (!spec.name) return { ok: false, command: '', error: 'debug command required', commands: this.debugCommandNames(), snapshot: this.debugSnapshot() };

    switch (spec.name) {
      case 'help':
        return { ok: true, command: spec.name, help: this.debugHelpText(), commands: this.debugCommandNames(), snapshot: this.debugSnapshot() };
      case 'status':
      case 'snapshot':
      case 'inspect':
      case 'state':
        return respond();
      case 'readout': {
        const readout = this.debugReadout(actor);
        return { ok: true, command: spec.name, text: readout.readout, diagnostic: readout.diagnostic, snapshot: this.debugSnapshot() };
      }
      case 'diagnostic': {
        const readout = this.debugReadout(actor);
        return { ok: true, command: spec.name, text: readout.diagnostic, snapshot: this.debugSnapshot() };
      }
      case 'actor': {
        const target = String(spec.args[0] || '').trim();
        if (!target) return { ok: false, command: spec.name, error: 'actor name required', snapshot: this.debugSnapshot() };
        if (!this.actors.has(target)) {
          if (!ACTORS[target]) return { ok: false, command: spec.name, error: 'unknown actor: ' + target, snapshot: this.debugSnapshot() };
          await this.loadActorProfile(target, ACTORS[target]);
        }
        this.activateActor(target, { preferSaved: false, restoreSavedUi: false });
        return respond({ message: 'selected actor ' + target });
      }
      case 'clip': {
        const target = spec.args.join(' ').trim();
        if (!target) return { ok: false, command: spec.name, error: 'clip name required', snapshot: this.debugSnapshot() };
        if (!actor) return { ok: false, command: spec.name, error: 'no active actor', snapshot: this.debugSnapshot() };
        const clip = this.findClipByName(actor, target);
        if (!clip) return { ok: false, command: spec.name, error: 'clip not found: ' + target, available: actor.clips.slice(0, 16).map((entry) => entry.name), snapshot: this.debugSnapshot() };
        const previousClipKey = actor.activeAction ? clipKey(actor.activeAction._clip) : '';
        actor.play(clipKey(clip));
        actor.pauseActive(false);
        this.critiqueTransportMode = 'live';
        this.updateCleanupUi('debug clip ' + clipLabel(clip));
        this.updatePlayerTransportUi('debug clip ' + clipLabel(clip));
        this.updateCritiqueTransportUi('debug clip ' + clipLabel(clip));
        this.updateReadout();
        const snapshot = this.debugSnapshot();
        return respond({ message: 'playing ' + clipLabel(clip), activeClipChanged: previousClipKey !== clipKey(clip), paused: false, snapshot });
      }
      case 'bone': {
        if (!actor) return { ok: false, command: spec.name, error: 'no active actor', snapshot: this.debugSnapshot() };
        const subcommand = String(spec.args[0] || '').trim().toLowerCase();
        const rest = spec.args.slice(1);
        const isShortcutName = subcommand && !['select', 'status', 'state', 'reset', 'rotate'].includes(subcommand);
        const selectBoneByName = (name) => {
          const boneName = String(name || '').trim();
          if (!boneName || boneName === 'clear' || boneName === 'none') {
            this.clearBoneSelection('deselected bone');
            return { ok: true, cleared: true };
          }
          if (!actor.selectBone(boneName)) return { ok: false, error: 'bone not found: ' + boneName };
          this.updateBoneUi();
          this.updateReadout();
          return { ok: true, boneName };
        };
        if (subcommand === 'state' || subcommand === 'status') {
          const boneName = rest.join(' ').trim() || actor.selectedBoneName;
          const bone = boneName ? actor.boneByName.get(boneName) : null;
          const restPose = boneName ? actor.boneRest.get(boneName) : null;
          if (!bone || !restPose) return { ok: false, command: spec.name, error: 'bone not found: ' + (boneName || ''), snapshot: this.debugSnapshot() };
          return {
            ok: true,
            command: spec.name,
            action: subcommand,
            bone: {
              name: bone.name,
              selected: bone.name === actor.selectedBoneName,
              localQuaternion: bone.quaternion.toArray(),
              restQuaternion: restPose.quaternion.toArray(),
              worldQuaternion: worldQuaternionOf(bone).toArray(),
              edit: actor.currentBoneEdit?.(boneName) || null,
            },
            snapshot: this.debugSnapshot(),
          };
        }
        if (subcommand === 'reset') {
          const boneName = rest.join(' ').trim() || actor.selectedBoneName;
          if (!boneName) return { ok: false, command: spec.name, error: 'bone name required', snapshot: this.debugSnapshot() };
          if (!actor.boneByName.has(boneName)) return { ok: false, command: spec.name, error: 'bone not found: ' + boneName, snapshot: this.debugSnapshot() };
          actor.resetBoneEdit?.(boneName);
          actor.selectBone?.(boneName);
          this.updateBoneUi();
          this.updateReadout();
          return respond({ message: 'reset bone ' + boneName });
        }
        if (subcommand === 'rotate') {
          let boneName = actor.selectedBoneName;
          let rotationArgs = rest;
          if (rotationArgs.length >= 4 && !Number.isFinite(Number(rotationArgs[0]))) {
            boneName = String(rotationArgs[0] || '').trim();
            rotationArgs = rotationArgs.slice(1);
          }
          const rotX = Number(rotationArgs[0]);
          const rotY = Number(rotationArgs[1]);
          const rotZ = Number(rotationArgs[2]);
          if (!boneName) return { ok: false, command: spec.name, error: 'bone name required', snapshot: this.debugSnapshot() };
          if (!Number.isFinite(rotX) || !Number.isFinite(rotY) || !Number.isFinite(rotZ)) return { ok: false, command: spec.name, error: 'rotate expects numeric x y z degrees', snapshot: this.debugSnapshot() };
          if (!actor.boneByName.has(boneName)) return { ok: false, command: spec.name, error: 'bone not found: ' + boneName, snapshot: this.debugSnapshot() };
          actor.selectBone?.(boneName);
          if (typeof actor.applyBoneEdit !== 'function') return { ok: false, command: spec.name, error: 'actor cannot apply bone edits', snapshot: this.debugSnapshot() };
          actor.applyBoneEdit(boneName, { rotX, rotY, rotZ, useTranslate: false, useRotate: true, useScale: false });
          this.updateBoneUi();
          this.updateReadout();
          return respond({ message: 'rotated bone ' + boneName, bone: { name: boneName, rotX, rotY, rotZ } });
        }
        if (!subcommand || subcommand === 'select' || isShortcutName) {
          const target = subcommand === 'select' ? rest.join(' ').trim() : [subcommand, ...rest].join(' ').trim();
          const selected = selectBoneByName(target);
          if (!selected.ok) return { ok: false, command: spec.name, error: selected.error, snapshot: this.debugSnapshot() };
          return selected.cleared
            ? respond({ message: 'cleared bone selection' })
            : respond({ message: 'selected bone ' + selected.boneName });
        }
        return { ok: false, command: spec.name, error: 'unknown bone subcommand: ' + subcommand, snapshot: this.debugSnapshot() };
      }
      case 'view': {
        const mode = String(spec.args[0] || '').trim();
        if (!mode) return { ok: false, command: spec.name, error: 'view mode required', snapshot: this.debugSnapshot() };
        this.setViewMode(mode);
        return respond({ message: 'view ' + this.viewMode });
      }
      case 'panel': {
        const panel = String(spec.args[0] || '').trim();
        if (!panel) return { ok: false, command: spec.name, error: 'panel name required', snapshot: this.debugSnapshot() };
        this.setPanel(panel);
        return respond({ message: 'panel ' + this.activePanel });
      }
      case 'play': {
        if (!actor?.activeAction) return { ok: false, command: spec.name, error: 'no active clip', snapshot: this.debugSnapshot() };
        actor.pauseActive(false);
        this.updateCleanupUi('playing');
        this.updatePlayerTransportUi('playing');
        this.updateCritiqueTransportUi('playing');
        return respond({ message: 'playing' });
      }
      case 'pause': {
        if (!actor?.activeAction) return { ok: false, command: spec.name, error: 'no active clip', snapshot: this.debugSnapshot() };
        actor.pauseActive(true);
        this.updateCleanupUi('paused');
        this.updatePlayerTransportUi('paused');
        this.updateCritiqueTransportUi('paused');
        return respond({ message: 'paused' });
      }
      case 'stop': {
        if (!actor?.activeAction) return { ok: false, command: spec.name, error: 'no active clip', snapshot: this.debugSnapshot() };
        actor.stop();
        this.updateCleanupUi('stopped');
        this.updatePlayerTransportUi('stopped');
        this.updateCritiqueTransportUi('stopped');
        return respond({ message: 'stopped' });
      }
      case 'seek':
      case 'time': {
        if (!actor?.activeClip()) return { ok: false, command: spec.name, error: 'no active clip', snapshot: this.debugSnapshot() };
        const value = Number(spec.args[0]);
        if (!Number.isFinite(value)) return { ok: false, command: spec.name, error: 'seek time must be numeric', snapshot: this.debugSnapshot() };
        actor.seek(value);
        return respond({ message: 'seek ' + value });
      }
      case 'frame': {
        if (!actor?.activeClip()) return { ok: false, command: spec.name, error: 'no active clip', snapshot: this.debugSnapshot() };
        const value = Number(spec.args[0]);
        if (!Number.isFinite(value)) return { ok: false, command: spec.name, error: 'frame must be numeric', snapshot: this.debugSnapshot() };
        actor.seek(value / CRITIQUE_STEP_FPS);
        return respond({ message: 'frame ' + value });
      }
      case 'beacon':
        return this.debugEmitBeacon(spec.args[0] || 'manual');
      case 'capture':
        return this.debugEmitCapture(spec.args[0] || 'manual');
      case 'qa': {
        const sub = String(spec.args[0] || 'status').trim();
        if (sub === 'beacon') return this.debugEmitBeacon(spec.args[1] || 'qa');
        if (sub === 'capture') return this.debugEmitCapture(spec.args[1] || 'qa');
        return { ok: true, command: spec.name, subcommand: sub, snapshot: this.debugSnapshot() };
      }
      default:
        return { ok: false, command: spec.name, error: 'unknown debug command: ' + spec.name, commands: this.debugCommandNames(), snapshot: this.debugSnapshot() };
    }
  }

  async startDebugBridge() {
    if (!this.debugBridge?.enabled || !this.debugBridge.url) {
      if (this.debugBridgeState) this.debugBridgeState.lastError = this.debugBridge?.enabled ? 'missing debugBridgeUrl' : '';
      return null;
    }
    if (this.debugBridgePromise) return this.debugBridgePromise;
    const baseUrl = this.debugBridge.url.replace(/\/$/, '');
    const bridge = this.debugBridgeState;
    bridge.lastError = '';
    const run = async () => {
      const register = await fetch(baseUrl + '/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: this.debugBridge.label, build: LAB_BUILD, labMode: this.labMode, url: window.location.href }),
      });
      if (!register.ok) throw new Error('bridge register HTTP ' + register.status);
      const registered = await register.json();
      bridge.connected = true;
      bridge.clientId = String(registered.clientId || '');
      bridge.syncAt = Date.now();
      while (bridge.connected) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), this.debugBridge.timeoutMs);
        try {
          const next = await fetch(baseUrl + '/next?clientId=' + encodeURIComponent(bridge.clientId), { signal: controller.signal });
          if (!next.ok) throw new Error('bridge next HTTP ' + next.status);
          const payload = await next.json();
          if (!payload || !payload.id) continue;
          bridge.lastCommand = String(payload.command?.name || payload.command?.command || '');
          bridge.lastCommandId = String(payload.id || '');
          const result = await this.executeDebugCommand(payload.command);
          bridge.lastResult = result;
          bridge.syncAt = Date.now();
          await fetch(baseUrl + '/result', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clientId: bridge.clientId, commandId: payload.id, result }),
          });
        } catch (error) {
          if (String(error?.name || '') === 'AbortError') continue;
          bridge.lastError = error?.message || String(error);
          await new Promise((resolve) => window.setTimeout(resolve, this.debugBridge.pollMs));
        } finally {
          window.clearTimeout(timer);
        }
      }
    };
    this.debugBridgePromise = run().catch((error) => {
      bridge.connected = false;
      bridge.lastError = error?.message || String(error);
      return null;
    });
    return this.debugBridgePromise;
  }

  updateDiagnosticOverlay() {
    const actor = this.actors.get(this.selected);
    if (!actor || !UI.diagnostic) return;
    UI.diagnostic.textContent = actor.diagnosticLine();
    if (UI.panels.info?.classList.contains('open')) UI.readout.textContent = 'view=' + this.viewMode + '\n' + actor.readout();
    if (UI.panels.cleanup?.classList.contains('open')) this.updateCleanupUi();
    this.updateCritiqueTransportUi();
    this.updateCritiqueDock(true);
  }


  visualQaReadFrames(clip) {
    const frames = clip?.userData?.sourceReduction?.spriteFrames || [];
    if (frames.length) {
      return frames.map((frame) => {
        const spriteFrame = Number(frame.spriteFrame || 0);
        return {
          frameKey: 'f' + String(spriteFrame).padStart(3, '0'),
          tag: frame.tag || '',
          spriteFrame,
          time: Number.isFinite(Number(frame.spriteFrame)) ? spriteFrame / 60 : Number(frame.sourceTime || 0),
        };
      }).filter((frame) => Number.isFinite(frame.time));
    }
    const duration = Math.max(0, Number(clip?.duration || 0));
    const fps = 30;
    const sampleCount = Math.max(2, Math.ceil(duration * 30) + 1);
    const framesOut = [];
    for (let i = 0; i < sampleCount; i += 1) {
      const time = (duration * i) / (sampleCount - 1);
      const spriteFrame = Math.round(time * fps);
      framesOut.push({
        frameKey: 'f' + String(spriteFrame).padStart(3, '0'),
        tag: i === 0 ? 'start' : (i === sampleCount - 1 ? 'settle' : 'frame'),
        spriteFrame,
        time,
      });
    }
    return framesOut.filter((frame) => Number.isFinite(frame.time));
  }

  handleVisualQaFrame() {
    if (!this.visualQa?.enabled) return;
    if (!this.actors.size) return;
    if (!this.startupReady) return;
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
    for (const actor of this.actors.values()) {
      actor.update(dt);
      if (actor.key === this.selected) this.applyPoseCorrectionOverlay(actor);
    }
    this.updateDiagnosticOverlay();
    if (this.labMode === 'critique') this.updateCleanupUi();
    this.updateCritiqueTransportUi();
    this.updateCritiqueDock(true);
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
