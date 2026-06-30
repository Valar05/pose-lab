import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
function near(a, b, eps = 0.00008) { return Math.abs(a - b) <= eps; }
function nearArray(actual, expected, eps, label) {
  assert(actual.length === expected.length && actual.every((value, index) => near(value, expected[index], eps)), `${label} expected ${expected.join(', ')} got ${actual.join(', ')}`);
}
function shim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= { createElementNS() { const listeners = new Map(); return { style: {}, width: 1, height: 1, addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); }, set src(value) { this._src = value; setTimeout(() => listeners.get('load')?.({ type: 'load' }), 0); }, get src() { return this._src || ''; } }; } };
  globalThis.createImageBitmap ||= async () => ({ width: 1, height: 1, close() {} });
}
function threeDir() {
  const sandbox = path.join(os.tmpdir(), 'pose-lab-three-node');
  const dir = path.join(sandbox, 'node_modules', 'three');
  if (!fs.existsSync(path.join(dir, 'build', 'three.module.js'))) {
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
function parseArray(block, key) {
  const match = block.match(new RegExp(`${key}: \\[([^\\]]+)\\]`));
  if (!match) throw new Error(`missing ${key}`);
  return match[1].split(',').map((entry) => Number(entry.trim()));
}
function roundArray(values) { return values.map((value) => Number(value.toFixed(5))); }

shim();
const threeRoot = threeDir();
const THREE = await import(pathToFileURL(path.join(threeRoot, 'build', 'three.module.js')));
const { GLTFLoader } = await import(pathToFileURL(path.join(threeRoot, 'examples/jsm/loaders/GLTFLoader.js')));
const fpsFile = path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb');
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(fpsFile), path.dirname(fpsFile) + path.sep, resolve, reject));
const placeholder = gltf.scene.getObjectByName('placeholderWeapon');
assert(Boolean(placeholder), 'FPSPlayer.glb should include placeholderWeapon');
assert(placeholder?.parent?.name === 'WeaponR', `placeholderWeapon should be parented to WeaponR, got ${placeholder?.parent?.name || 'missing'}`);

const expectedPosition = [0, 0, 0];
const expectedGripLocal = [0.67888, -0.07803, -0.06249];
const expectedTipLocal = [-0.95561, 0.1368, 0];
const expectedScale = 0.323;
const expectedRotation = [-179.998, -4.747, 111.678];
const attachmentQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...expectedRotation.map(THREE.MathUtils.degToRad), 'XYZ'));
const expectedEffectivePosition = new THREE.Vector3().fromArray(expectedPosition).sub(new THREE.Vector3().fromArray(expectedGripLocal).multiplyScalar(expectedScale).applyQuaternion(attachmentQuat));
const solvedTipSocket = new THREE.Vector3().fromArray(expectedTipLocal).multiplyScalar(expectedScale).applyQuaternion(attachmentQuat).add(expectedEffectivePosition);

const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const playerStart = profiles.indexOf('  player: {');
const arcaneStart = profiles.indexOf('  arcane: {', playerStart);
const player = profiles.slice(playerStart, arcaneStart);
const attachmentStart = player.indexOf("name: 'Meshy French Revolution Gun Sword'");
const attachment = player.slice(attachmentStart, player.indexOf('    },', attachmentStart));
nearArray(parseArray(attachment, 'position'), expectedPosition, 0.00008, 'FPS attachment position should stay at WeaponR origin to avoid Meshy replacement drift');
nearArray(parseArray(attachment, 'rotationDeg'), expectedRotation, 0.00008, 'FPS source-tip solved attachment rotation');
assert(near(Number(attachment.match(/scale: ([0-9.]+)/)?.[1] || 0), expectedScale, 0.00008), 'FPS attachment scale should match source-tip solved Meshy span');
nearArray(parseArray(attachment, 'gripLocalPosition'), expectedGripLocal, 0.00008, 'FPS attachment basket hilt grip point');
nearArray(parseArray(attachment, 'tipLocalPosition'), expectedTipLocal, 0.00008, 'FPS attachment local blade tip');
assert(player.includes('semantic landmark hilt candidate'), 'FPS sourceAttachment should document that the grip target is the recovered semantic/manual hilt candidate');
const runtime = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
assert(runtime.includes('Array.isArray(config.gripLocalPosition)'), 'runtime should support attachment-local grip targets');
assert(runtime.includes('Array.isArray(config.tipLocalPosition)'), 'runtime should support attachment-local tip markers');
assert(runtime.includes('localTip.applyQuaternion(weaponRoot.quaternion)'), 'runtime should rotate attachment-local tip into socket space');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fps-placeholder-weapon-saber-handle-tip-solved', 'computedEffectivePosition', roundArray(expectedEffectivePosition.toArray()), 'computedTipSocket', roundArray(solvedTipSocket.toArray())] }, null, 2));
