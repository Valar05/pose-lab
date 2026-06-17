import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const glbPath = path.join(projectRoot, 'assets', 'models', 'gravity_fist', 'Ares.glb');
const poseclipPath = path.join(projectRoot, 'assets', 'pose_indexes', 'ares_jab_sf2.poseclip.json');

function readGlbJson(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB file');
  let offset = 12;
  while (offset < bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = bytes.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === 0x4e4f534a) return JSON.parse(chunk.toString('utf8').replace(/[\u0000\s]+$/g, ''));
  }
  throw new Error('GLB JSON chunk missing');
}

function threeSanitizeNodeName(name) {
  return String(name || '').replace(/\s/g, '_').replace(/[\[\]\.:/]/g, '');
}

function trackTargetName(trackName) {
  const match = String(trackName || '').match(/^(.*)\.(position|quaternion|scale|morphTargetInfluences)$/);
  return match ? match[1] : '';
}

const glb = readGlbJson(glbPath);
const runtimeNameMap = new Map();
for (const node of glb.nodes || []) {
  const original = node.name || '';
  if (!original) continue;
  const runtime = threeSanitizeNodeName(original);
  runtimeNameMap.set(runtime, runtime);
  runtimeNameMap.set(original, runtime);
}

const poseclipPayload = JSON.parse(fs.readFileSync(poseclipPath, 'utf8'));
const tracks = poseclipPayload.clip?.tracks || [];
const targets = [...new Set(tracks.map((track) => trackTargetName(track.name)).filter(Boolean))];
const mappedTargets = targets.filter((target) => runtimeNameMap.has(target));
const directRuntimeTargets = targets.filter((target) => runtimeNameMap.get(target) === target);

if (runtimeNameMap.get('mixamorig:Hips') !== 'mixamorigHips') {
  throw new Error('Expected GLTFLoader-style runtime mapping mixamorig:Hips -> mixamorigHips');
}

if (!targets.includes('mixamorig:Hips')) {
  throw new Error('Expected generated poseclip to contain original colon bone names');
}

if (mappedTargets.length !== targets.length) {
  const missing = targets.filter((target) => !runtimeNameMap.has(target));
  throw new Error(`Poseclip has ${missing.length} targets that cannot map to Ares runtime names: ${missing.join(', ')}`);
}

if (directRuntimeTargets.length === targets.length) {
  throw new Error('Regression test is invalid: poseclip targets already match runtime names directly');
}

console.log('PASS test_poseclip_track_binding');
console.log(JSON.stringify({ targetCount: targets.length, mappedTargetCount: mappedTargets.length, directRuntimeTargetCount: directRuntimeTargets.length, sample: { original: 'mixamorig:Hips', runtime: runtimeNameMap.get('mixamorig:Hips') } }, null, 2));
