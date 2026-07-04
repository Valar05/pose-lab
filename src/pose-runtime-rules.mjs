export function canonPoseNodeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findRuntimeNode(root, name) {
  const wanted = canonPoseNodeName(name);
  let found = null;
  root?.traverse?.((node) => {
    if (!found && canonPoseNodeName(node.name) === wanted) found = node;
  });
  return found;
}

export function requireRuntimeNode(root, name) {
  const node = findRuntimeNode(root, name);
  if (!node) throw new Error(`missing runtime node ${name}`);
  return node;
}

export function runtimeWorldPosition(THREE, object) {
  return object?.getWorldPosition ? object.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
}

export function applyClipPoseAtTime(THREE, root, clip, time = 0) {
  if (!root || !clip) return false;
  const duration = Math.max(0.001, Number(clip.duration || 0.001));
  const t = Math.max(0, Math.min(duration, Number(time || 0)));
  for (const track of clip.tracks || []) {
    const name = String(track.name || '');
    if (!name.endsWith('.quaternion')) continue;
    const node = findRuntimeNode(root, name.replace(/\.quaternion$/, ''));
    if (!node) continue;
    const result = track.createInterpolant(new Float32Array(4)).evaluate(t);
    node.quaternion.set(result[0], result[1], result[2], result[3]).normalize();
  }
  root.updateMatrixWorld(true);
  return true;
}

export function fitModelToHeight(THREE, model, height) {
  if (!model || !Number.isFinite(Number(height))) return null;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = Number(height) / Math.max(0.001, size.y);
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  const fitBox = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  fitBox.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= fitBox.min.y;
  model.updateMatrixWorld(true);
  return { scale, box: fitBox };
}

export function captureNamedBoneLandmarks(THREE, root, names = []) {
  const out = {};
  for (const name of names) {
    const node = findRuntimeNode(root, name);
    out[name] = node ? runtimeWorldPosition(THREE, node) : null;
  }
  return out;
}

export function collectPoseRuntimeChains(THREE, root, chains = []) {
  return chains.map((chain) => ({
    name: chain.name || chain.bones?.join('>') || '',
    bones: chain.bones || [],
    points: (chain.bones || []).map((name) => {
      const node = findRuntimeNode(root, name);
      return node ? runtimeWorldPosition(THREE, node) : null;
    }),
  }));
}

export function poseDistanceMetrics(THREE, landmarks = {}) {
  const distance = (a, b) => {
    const pa = landmarks[a];
    const pb = landmarks[b];
    return pa && pb ? pa.distanceTo(pb) : null;
  };
  return {
    shoulderSpan: distance('RightArm', 'LeftArm'),
    handSpan: distance('RightHand', 'LeftHand'),
    rightArmLength: [distance('RightArm', 'RightForeArm'), distance('RightForeArm', 'RightHand')]
      .filter(Number.isFinite)
      .reduce((sum, value) => sum + value, 0),
    leftArmLength: [distance('LeftArm', 'LeftForeArm'), distance('LeftForeArm', 'LeftHand')]
      .filter(Number.isFinite)
      .reduce((sum, value) => sum + value, 0),
    rightHandToHip: distance('RightHand', 'Hips'),
    leftHandToHip: distance('LeftHand', 'Hips'),
  };
}

export function serializablePoint(vector, digits = 5) {
  if (!vector) return null;
  const round = (value) => Number(Number(value || 0).toFixed(digits));
  return [round(vector.x), round(vector.y), round(vector.z)];
}

export function serializableLandmarks(landmarks, digits = 5) {
  return Object.fromEntries(Object.entries(landmarks || {}).map(([key, value]) => [key, serializablePoint(value, digits)]));
}
