import { createPoseLabDebugBridgeServer, sendPoseLabDebugCommand } from './pose_lab_debug.mjs';

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
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
  toArray() { return [this.x, this.y, this.z]; }
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
  setFromAxisAngle(axis, angle) { const half = angle / 2; const s = Math.sin(half); this.x = axis.x * s; this.y = axis.y * s; this.z = axis.z * s; this.w = Math.cos(half); return this; }
  toArray() { return [this.x, this.y, this.z, this.w]; }
  angleTo(other) { const dot = Math.abs(this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w); return 2 * Math.acos(Math.min(1, dot)); }
}

class Bone {
  constructor(name) {
    this.name = name;
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

function multiplyAxisAngle(quaternion, axis, degrees) {
  const delta = new Quat().setFromAxisAngle(axis, degrees * Math.PI / 180).normalize();
  quaternion.multiply(delta).normalize();
}

function toSnapshot(selectedBoneName, bones, boneRest) {
  const bone = bones.get(selectedBoneName);
  const rest = boneRest.get(selectedBoneName);
  const child = bone.children[0] || null;
  return {
    schema: 'pose-lab-debug-snapshot-v1',
    selectedBone: selectedBoneName,
    selectedBoneLocalQuaternion: bone.quaternion.toArray(),
    selectedBoneRestQuaternion: rest.quaternion.toArray(),
    selectedBoneWorldQuaternion: bone.getWorldQuaternion(new Quat()).toArray(),
    childWorldPosition: child ? child.getWorldPosition(new Vec3()).toArray() : null,
  };
}

const bridge = createPoseLabDebugBridgeServer({ host: '127.0.0.1', port: 0 });
const bridgeUrl = await bridge.listen();

const root = new Bone('root');
const spine = new Bone('mixamorig:Spine');
const hand = new Bone('mixamorig:LeftHand');
spine.position.y = 1;
hand.position.y = 1;
root.add(spine);
spine.add(hand);
root.updateMatrixWorld(true);

const bones = new Map([[spine.name, spine], [hand.name, hand]]);
const boneRest = new Map([
  [spine.name, { quaternion: spine.quaternion.clone() }],
  [hand.name, { quaternion: hand.quaternion.clone() }],
]);
let selectedBoneName = spine.name;
const selectBone = (name) => {
  if (!bones.has(name)) return false;
  selectedBoneName = name;
  return true;
};

const statusSnapshot = () => ({
  schema: 'pose-lab-debug-snapshot-v1',
  selectedBone: selectedBoneName,
  selectedBoneWorldQuaternion: bones.get(selectedBoneName).getWorldQuaternion(new Quat()).toArray(),
  selectedBoneLocalQuaternion: bones.get(selectedBoneName).quaternion.toArray(),
  childWorldPosition: bones.get(selectedBoneName).children[0]?.getWorldPosition(new Vec3()).toArray() || null,
});

const client = (async () => {
  const register = await fetch(new URL('/register', bridgeUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'Pose Lab Debug Integration Test', build: 'clean-sf2', labMode: 'critique', url: 'http://127.0.0.1:8797/pose-lab.html?debugBridge=1' }),
  });
  assert(register.ok, 'bridge should accept a live browser registration');
  const { clientId } = await register.json();
  assert(typeof clientId === 'string' && clientId.length > 8, 'bridge should issue a client id');

  while (true) {
    const nextResponse = await fetch(new URL('/next?clientId=' + encodeURIComponent(clientId), bridgeUrl));
    if (!nextResponse.ok) continue;
    const payload = await nextResponse.json();
    if (!payload?.id) continue;
    const command = String(payload.command || '').trim();
    const parts = command.split(/\s+/).filter(Boolean);
    const response = { ok: true, command: parts[0] || '', snapshot: statusSnapshot() };

    try {
      if (parts[0] === 'status') {
        response.snapshot = statusSnapshot();
      } else if (parts[0] === 'bone' && parts[1] === 'select') {
        const name = parts.slice(2).join(' ');
        if (!selectBone(name)) throw new Error('bone not found: ' + name);
        response.message = 'selected bone ' + name;
        response.snapshot = statusSnapshot();
      } else if (parts[0] === 'bone' && parts[1] === 'rotate') {
        const name = parts[2];
        const rotX = Number(parts[3]);
        const rotY = Number(parts[4]);
        const rotZ = Number(parts[5]);
        if (!bones.has(name)) throw new Error('bone not found: ' + name);
        selectBone(name);
        multiplyAxisAngle(bones.get(name).quaternion, new Vec3(1, 0, 0), rotX);
        multiplyAxisAngle(bones.get(name).quaternion, new Vec3(0, 1, 0), rotY);
        multiplyAxisAngle(bones.get(name).quaternion, new Vec3(0, 0, 1), rotZ);
        root.updateMatrixWorld(true);
        response.message = 'rotated bone ' + name;
        response.snapshot = statusSnapshot();
        response.bone = { name, rotX, rotY, rotZ };
      } else if (parts[0] === 'bone' && parts[1] === 'state') {
        const name = parts[2] || selectedBoneName;
        selectBone(name);
        response.bone = {
          name,
          selected: name === selectedBoneName,
          localQuaternion: bones.get(name).quaternion.toArray(),
          restQuaternion: boneRest.get(name).quaternion.toArray(),
          worldQuaternion: bones.get(name).getWorldQuaternion(new Quat()).toArray(),
          childWorldPosition: bones.get(name).children[0]?.getWorldPosition(new Vec3()).toArray() || null,
        };
        response.snapshot = statusSnapshot();
      } else {
        throw new Error('unknown command: ' + command);
      }
    } catch (error) {
      response.ok = false;
      response.error = error?.message || String(error);
    }

    await fetch(new URL('/result', bridgeUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, commandId: payload.id, result: response }),
    });
  }
})();

try {
  const before = await sendPoseLabDebugCommand(bridgeUrl, 'status');
  assert(before.ok === true, 'status should return ok');
  assert(before.snapshot.selectedBone === 'mixamorig:Spine', 'status should read the live selected bone');

  const selectResult = await sendPoseLabDebugCommand(bridgeUrl, 'bone select mixamorig:LeftHand');
  assert(selectResult.ok === true, 'bone select should succeed');
  assert(selectResult.snapshot.selectedBone === 'mixamorig:LeftHand', 'bone select should change the selected bone');

  const beforeRotate = await sendPoseLabDebugCommand(bridgeUrl, 'bone state mixamorig:Spine');
  const beforeQuat = beforeRotate.bone.worldQuaternion;
  const beforeChild = beforeRotate.bone.childWorldPosition;

  const rotateResult = await sendPoseLabDebugCommand(bridgeUrl, 'bone rotate mixamorig:Spine 35 0 0');
  assert(rotateResult.ok === true, 'bone rotate should succeed');
  assert(rotateResult.snapshot.selectedBone === 'mixamorig:Spine', 'bone rotate should keep the rotated bone selected');
  assert(Array.isArray(rotateResult.snapshot.selectedBoneWorldQuaternion), 'bone rotate should return structured quaternion data');
  assert(rotateResult.snapshot.selectedBoneWorldQuaternion.some((value, index) => Math.abs(value - beforeQuat[index]) > 0.0001), 'bone rotate should change the bone world quaternion');
  assert(rotateResult.snapshot.childWorldPosition.some((value, index) => Math.abs(value - beforeChild[index]) > 0.0001), 'bone rotate should move the child bone in world space');

  const stateResult = await sendPoseLabDebugCommand(bridgeUrl, 'bone state mixamorig:Spine');
  assert(stateResult.ok === true, 'bone state should succeed');
  assert(stateResult.bone.selected === true, 'bone state should confirm selected bone state');
  assert(stateResult.bone.localQuaternion.some((value, index) => Math.abs(value - beforeRotate.bone.localQuaternion[index]) > 0.0001), 'bone state should show the rotated bone quaternion');
} finally {
  await bridge.close();
}

await client.catch(() => {});
if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['debug-bridge-live-bone-select', 'debug-bridge-live-bone-rotate', 'structured-skeleton-readback'] }, null, 2));
