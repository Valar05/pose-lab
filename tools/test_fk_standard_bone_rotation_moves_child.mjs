import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  copy(other) { this.x = other.x; this.y = other.y; this.z = other.z; return this; }
  add(other) { this.x += other.x; this.y += other.y; this.z += other.z; return this; }
  sub(other) { this.x -= other.x; this.y -= other.y; this.z -= other.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const len = Math.sqrt(this.lengthSq()); if (!len) return this; this.x /= len; this.y /= len; this.z /= len; return this; }
  distanceTo(other) { return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2 + (this.z - other.z) ** 2); }
  dot(other) { return this.x * other.x + this.y * other.y + this.z * other.z; }
  cross(other) { const x = this.y * other.z - this.z * other.y; const y = this.z * other.x - this.x * other.z; const z = this.x * other.y - this.y * other.x; this.x = x; this.y = y; this.z = z; return this; }
  applyQuaternion(q) {
    const x = this.x, y = this.y, z = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }
}

class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  clone() { return new Quat(this.x, this.y, this.z, this.w); }
  copy(other) { this.x = other.x; this.y = other.y; this.z = other.z; this.w = other.w; return this; }
  multiply(other) {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    const bx = other.x, by = other.y, bz = other.z, bw = other.w;
    this.x = aw * bx + ax * bw + ay * bz - az * by;
    this.y = aw * by - ax * bz + ay * bw + az * bx;
    this.z = aw * bz + ax * by - ay * bx + az * bw;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
  normalize() { const len = Math.hypot(this.x, this.y, this.z, this.w); if (!len) return this; this.x /= len; this.y /= len; this.z /= len; this.w /= len; return this; }
  invert() { this.x *= -1; this.y *= -1; this.z *= -1; return this; }
  setFromAxisAngle(axis, angle) { const half = angle / 2; const s = Math.sin(half); this.x = axis.x * s; this.y = axis.y * s; this.z = axis.z * s; this.w = Math.cos(half); return this; }
  fromArray(values) { [this.x, this.y, this.z, this.w] = values; return this; }
  angleTo(other) { const dot = Math.abs(this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w); return 2 * Math.acos(Math.min(1, dot)); }
}

class Node {
  constructor() {
    this.parent = null;
    this.children = [];
    this.position = new Vec3();
    this.quaternion = new Quat();
  }
  add(child) { child.parent = this; this.children.push(child); return this; }
  getWorldQuaternion(target) {
    if (this.parent) {
      target.copy(this.parent.getWorldQuaternion(new Quat())).multiply(this.quaternion);
    } else {
      target.copy(this.quaternion);
    }
    return target;
  }
  getWorldPosition(target) {
    if (this.parent) {
      const parentQuat = this.parent.getWorldQuaternion(new Quat());
      const parentPos = this.parent.getWorldPosition(new Vec3());
      return target.copy(this.position.clone().applyQuaternion(parentQuat)).add(parentPos);
    }
    return target.copy(this.position);
  }
  updateMatrixWorld() { return this; }
}

const THREE = { Quaternion: Quat };
const worldQuaternionOfSrc = extractFunction('worldQuaternionOf');
const setBoneWorldQuaternionSrc = extractFunction('setBoneWorldQuaternion');
if (!worldQuaternionOfSrc || !setBoneWorldQuaternionSrc) {
  throw new Error('could not extract world quaternion helpers from src/pose-lab.js');
}

const { worldQuaternionOf, setBoneWorldQuaternion } = new Function('THREE', `${worldQuaternionOfSrc}
${setBoneWorldQuaternionSrc}
return { worldQuaternionOf, setBoneWorldQuaternion };`)(THREE);

const root = new Node();
const upper = new Node();
const lower = new Node();
upper.position.set?.(0, 1, 0);
upper.position.x = 0; upper.position.y = 1; upper.position.z = 0;
lower.position.x = 0; lower.position.y = 1; lower.position.z = 0;
root.add(upper);
upper.add(lower);
root.updateMatrixWorld(true);

const beforeUpperQuat = worldQuaternionOf(upper).clone();
const beforeLowerPos = lower.getWorldPosition(new Vec3());
const intendedWorldQuat = new Quat().setFromAxisAngle(new Vec3(1, 0, 0), Math.PI / 3);
setBoneWorldQuaternion(upper, intendedWorldQuat);
root.updateMatrixWorld(true);

const afterUpperQuat = worldQuaternionOf(upper);
const afterLowerPos = lower.getWorldPosition(new Vec3());

assert(afterUpperQuat.angleTo(beforeUpperQuat) > 0.01, 'standard FK rotation must change the target bone world quaternion');
assert(afterLowerPos.distanceTo(beforeLowerPos) > 0.01, 'standard FK rotation must move the child bone in world space');
assert(afterLowerPos.distanceTo(beforeLowerPos) < 5, 'standard FK rotation should move the child, not explode the chain');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fk-standard-bone-rotation-moves-child'] }, null, 2));
