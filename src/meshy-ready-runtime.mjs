function canon(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function trackTargetName(trackName) {
  const match = String(trackName || '').replace(/^\.bones\[(.+?)\]\.(position|quaternion|scale)$/, '$1.$2').match(/^(.*)\.(position|quaternion|scale|morphTargetInfluences)$/);
  return match ? match[1] : '';
}

function sourceClipQuaternionTrack(clip, boneName) {
  const wanted = canon(boneName);
  return (clip?.tracks || []).find((track) => String(track.name || '').endsWith('.quaternion') && canon(trackTargetName(track.name)) === wanted) || null;
}

function findNamedObject(root, name) {
  const wanted = canon(name);
  let found = null;
  root?.traverse?.((node) => {
    if (!found && canon(node.name) === wanted) found = node;
  });
  return found;
}

function findNamedBone(root, name) {
  const wanted = canon(name);
  let found = null;
  root?.traverse?.((node) => {
    if (!found && node.isBone && canon(node.name) === wanted) found = node;
  });
  return found;
}

function worldPosition(THREE, node) {
  return node.getWorldPosition(new THREE.Vector3());
}

function worldQuaternion(THREE, node) {
  return node.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

function worldDirection(THREE, node, local = [0, 0, 1]) {
  return new THREE.Vector3(Number(local[0] || 0), Number(local[1] || 0), Number(local[2] ?? 1)).applyQuaternion(worldQuaternion(THREE, node)).normalize();
}

function setWorldQuaternion(THREE, bone, targetWorld) {
  const parentWorld = bone.parent ? worldQuaternion(THREE, bone.parent).invert() : new THREE.Quaternion();
  bone.quaternion.copy(parentWorld.multiply(targetWorld).normalize());
}

function sampleQuaternionTrack(THREE, track, time) {
  const result = track.createInterpolant(new Float32Array(4)).evaluate(time);
  return new THREE.Quaternion(result[0], result[1], result[2], result[3]).normalize();
}

function applyClipPose(THREE, root, clip, time) {
  for (const track of clip?.tracks || []) {
    if (!String(track.name || '').endsWith('.quaternion')) continue;
    const node = findNamedObject(root, trackTargetName(track.name));
    if (node) node.quaternion.copy(sampleQuaternionTrack(THREE, track, time));
  }
  root.updateMatrixWorld(true);
}

function capturePose(root) {
  const pose = new Map();
  root.traverse((node) => {
    if (node.isBone || node.userData?.syntheticWeaponBone) {
      pose.set(node.uuid, { node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
    }
  });
  return pose;
}

function restorePose(root, pose) {
  for (const entry of pose.values()) {
    entry.node.position.copy(entry.position);
    entry.node.quaternion.copy(entry.quaternion);
    entry.node.scale.copy(entry.scale);
    entry.node.updateMatrix();
  }
  root.updateMatrixWorld(true);
}

function clipRestQuaternionMap(THREE, clip) {
  const out = new Map();
  for (const track of clip?.tracks || []) {
    if (!String(track.name || '').endsWith('.quaternion')) continue;
    const name = trackTargetName(track.name);
    if (!name || out.has(canon(name))) continue;
    out.set(canon(name), sampleQuaternionTrack(THREE, track, track.times?.[0] || 0));
  }
  return out;
}

function bindRestLocalMap(THREE, root) {
  const worldByBone = new Map();
  const out = new Map();
  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.skeleton?.bones?.length) return;
    node.skeleton.bones.forEach((bone, index) => {
      const inverse = node.skeleton.boneInverses[index];
      if (bone && inverse && !worldByBone.has(bone)) worldByBone.set(bone, inverse.clone().invert());
    });
  });
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (const [bone, world] of worldByBone.entries()) {
    const parentWorld = bone.parent?.isBone ? worldByBone.get(bone.parent) : null;
    const local = parentWorld ? parentWorld.clone().invert().multiply(world) : world.clone();
    local.decompose(p, q, s);
    out.set(canon(bone.name), q.clone().normalize());
  }
  return out;
}

function applyLocalRest(root, restMap) {
  root.traverse((node) => {
    const rest = restMap.get(canon(node.name));
    if (rest) node.quaternion.copy(rest).normalize();
  });
  root.updateMatrixWorld(true);
}

function frameVectorWorld(frame, local) {
  return frame.lateral.clone().multiplyScalar(local.x).add(frame.up.clone().multiplyScalar(local.y)).add(frame.forward.clone().multiplyScalar(local.z));
}

function makeVisualPoseFrame(THREE, root, config = {}) {
  const left = findNamedBone(root, config.leftShoulder || 'LeftArm') || findNamedBone(root, 'Arm.L') || findNamedBone(root, 'LeftShoulder');
  const right = findNamedBone(root, config.rightShoulder || 'RightArm') || findNamedBone(root, 'Arm.R') || findNamedBone(root, 'RightShoulder');
  const chest = findNamedBone(root, config.chest || 'ShoulderCenter') || findNamedBone(root, 'Spine02') || findNamedBone(root, 'Spine');
  const hips = findNamedBone(root, config.hips || 'Hips') || findNamedBone(root, 'Root') || chest?.parent || null;
  const leftPos = left ? worldPosition(THREE, left) : null;
  const rightPos = right ? worldPosition(THREE, right) : null;
  const chestPos = chest ? worldPosition(THREE, chest) : new THREE.Vector3();
  const hipPos = hips ? worldPosition(THREE, hips) : chestPos.clone().add(new THREE.Vector3(0, -1, 0));
  let lateral = rightPos && leftPos ? rightPos.clone().sub(leftPos) : new THREE.Vector3(1, 0, 0);
  if (lateral.lengthSq() < 1e-8) lateral.set(1, 0, 0);
  lateral.normalize();
  let up = chestPos.clone().sub(hipPos);
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  up.normalize();
  let forward = new THREE.Vector3().crossVectors(lateral, up);
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1);
  forward.normalize();
  up = new THREE.Vector3().crossVectors(forward, lateral).normalize();
  return { origin: chestPos, lateral, up, forward };
}

function visualPoseLocal(frame, pointWorld) {
  const v = pointWorld.clone().sub(frame.origin);
  return new pointWorld.constructor(v.dot(frame.lateral), v.dot(frame.up), v.dot(frame.forward));
}

function visualPoseWorld(frame, local) {
  return frame.origin.clone().add(frameVectorWorld(frame, local));
}

function mapDirectionBetweenFrames(THREE, direction, sourceFrame, targetFrame) {
  const sourceLocal = direction.clone().normalize().applyQuaternion(worldQuaternion(THREE, sourceFrame).invert()).normalize();
  return sourceLocal.applyQuaternion(worldQuaternion(THREE, targetFrame)).normalize();
}

function basisFromBladeUp(THREE, bladeDirection, upSeed = new THREE.Vector3(0, 1, 0)) {
  const zAxis = bladeDirection?.clone?.() || new THREE.Vector3(0, 0, 1);
  if (zAxis.lengthSq() < 1e-8) zAxis.set(0, 0, 1);
  zAxis.normalize();
  let yAxis = upSeed?.clone?.() || new THREE.Vector3(0, 1, 0);
  if (yAxis.lengthSq() < 1e-8 || Math.abs(yAxis.normalize().dot(zAxis)) > 0.96) {
    yAxis = Math.abs(zAxis.y) < 0.96 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  }
  yAxis.sub(zAxis.clone().multiplyScalar(yAxis.dot(zAxis)));
  if (yAxis.lengthSq() < 1e-8) yAxis = Math.abs(zAxis.y) < 0.96 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  yAxis.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
  return new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
}

function quaternionFromBladeFrame(THREE, bladeDirection, upSeed = new THREE.Vector3(0, 1, 0), localBlade = [0, 0, 1], localUp = [0, 1, 0]) {
  const worldBasis = basisFromBladeUp(THREE, bladeDirection, upSeed);
  const localBasis = basisFromBladeUp(
    THREE,
    new THREE.Vector3(Number(localBlade?.[0] || 0), Number(localBlade?.[1] || 0), Number(localBlade?.[2] ?? 1)),
    new THREE.Vector3(Number(localUp?.[0] || 0), Number(localUp?.[1] ?? 1), Number(localUp?.[2] || 0))
  );
  return new THREE.Quaternion().setFromRotationMatrix(worldBasis.multiply(localBasis.invert())).normalize();
}

export function deriveAttachmentBladeLocal(THREE, attachment = {}) {
  const grip = Array.isArray(attachment.gripLocalPosition) ? attachment.gripLocalPosition : [0.6535, -0.02302, -0.07317];
  const tip = Array.isArray(attachment.tipLocalPosition) ? attachment.tipLocalPosition : [-0.95561, 0.1368, 0];
  const rotationDeg = Array.isArray(attachment.rotationDeg) ? attachment.rotationDeg : [121.031, -41.564, -13.871];
  const blade = new THREE.Vector3(
    Number(tip[0] || 0) - Number(grip[0] || 0),
    Number(tip[1] || 0) - Number(grip[1] || 0),
    Number(tip[2] || 0) - Number(grip[2] || 0)
  );
  if (blade.lengthSq() < 1e-8) blade.set(0, 0, 1);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(Number(rotationDeg[0] || 0)),
    THREE.MathUtils.degToRad(Number(rotationDeg[1] || 0)),
    THREE.MathUtils.degToRad(Number(rotationDeg[2] || 0)),
    'XYZ'
  ));
  return blade.normalize().applyQuaternion(q).normalize();
}

function mapDirectionBetweenVisualFrames(direction, sourceFrame, targetFrame) {
  const local = new direction.constructor(direction.dot(sourceFrame.lateral), direction.dot(sourceFrame.up), direction.dot(sourceFrame.forward));
  return frameVectorWorld(targetFrame, local).normalize();
}

function visualFrameLocalDirection(THREE, frame, direction) {
  const v = direction.clone().normalize();
  return new THREE.Vector3(v.dot(frame.lateral), v.dot(frame.up), v.dot(frame.forward)).normalize();
}

function visualFrameWorldDirection(frame, localDirection) {
  return frameVectorWorld(frame, localDirection.clone().normalize()).normalize();
}

function projectedAroundAxis(THREE, direction, axis) {
  const projected = direction.clone().sub(axis.clone().multiplyScalar(direction.dot(axis)));
  return projected.lengthSq() > 1e-8 ? projected.normalize() : new THREE.Vector3(0, 1, 0);
}

function targetDownFromSourceRestDelta(THREE, sourceRestDownWorld, sourcePoseDownWorld, targetRestDownWorld, sourceRestFrame, sourcePoseFrame, targetRestFrame, targetPoseFrame) {
  const sourceRestLocal = visualFrameLocalDirection(THREE, sourceRestFrame, sourceRestDownWorld);
  const sourcePoseLocal = visualFrameLocalDirection(THREE, sourcePoseFrame, sourcePoseDownWorld);
  const targetRestLocal = visualFrameLocalDirection(THREE, targetRestFrame, targetRestDownWorld);
  const delta = new THREE.Quaternion().setFromUnitVectors(sourceRestLocal, sourcePoseLocal).normalize();
  return visualFrameWorldDirection(targetPoseFrame, targetRestLocal.applyQuaternion(delta).normalize());
}

function anyPerpendicularVector(THREE, direction) {
  const axis = Math.abs(direction.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const out = axis.sub(direction.clone().multiplyScalar(axis.dot(direction)));
  return out.lengthSq() > 1e-8 ? out.normalize() : new THREE.Vector3(0, 0, 1);
}

function constrainedTwoBoneWorldJoints(THREE, shoulderWorld, desiredElbowWorld, desiredHandWorld, upperLength, lowerLength, fallbackElbowWorld = null, reachScale = 0.999) {
  const upperLen = Math.max(1e-8, Number(upperLength || 0));
  const lowerLen = Math.max(1e-8, Number(lowerLength || 0));
  const minReach = Math.max(1e-6, Math.abs(upperLen - lowerLen) + 0.0001);
  const maxReach = Math.max(minReach, (upperLen + lowerLen) * clamp(Number(reachScale || 0.999), 0.001, 1));
  let handOffset = desiredHandWorld.clone().sub(shoulderWorld);
  if (handOffset.lengthSq() < 1e-8) handOffset = new THREE.Vector3(0, 0, maxReach);
  const rawDistance = handOffset.length();
  const clampedDistance = clamp(rawDistance, minReach, maxReach);
  const handDir = handOffset.normalize();
  const handWorld = shoulderWorld.clone().add(handDir.clone().multiplyScalar(clampedDistance));
  const along = clamp(((upperLen * upperLen) - (lowerLen * lowerLen) + (clampedDistance * clampedDistance)) / Math.max(1e-8, 2 * clampedDistance), 0, upperLen);
  const height = Math.sqrt(Math.max(0, (upperLen * upperLen) - (along * along)));
  let bend = desiredElbowWorld.clone().sub(shoulderWorld);
  bend.sub(handDir.clone().multiplyScalar(bend.dot(handDir)));
  if (bend.lengthSq() < 1e-8 && fallbackElbowWorld) {
    bend = fallbackElbowWorld.clone().sub(shoulderWorld);
    bend.sub(handDir.clone().multiplyScalar(bend.dot(handDir)));
  }
  if (bend.lengthSq() < 1e-8) bend = anyPerpendicularVector(THREE, handDir);
  else bend.normalize();
  return { elbowWorld: shoulderWorld.clone().add(handDir.clone().multiplyScalar(along)).add(bend.clone().multiplyScalar(height)), handWorld };
}

function rotateSegmentToWorldPoint(THREE, root, bone, child, targetWorld) {
  const boneWorld = worldPosition(THREE, bone);
  const current = worldPosition(THREE, child).sub(boneWorld);
  const desired = targetWorld.clone().sub(boneWorld);
  if (current.lengthSq() < 1e-8 || desired.lengthSq() < 1e-8) return;
  const turn = new THREE.Quaternion().setFromUnitVectors(current.normalize(), desired.normalize());
  setWorldQuaternion(THREE, bone, turn.multiply(worldQuaternion(THREE, bone)).normalize());
  root.updateMatrixWorld(true);
}

function solveArmToWorldJoints(THREE, root, upper, lower, hand, solved) {
  rotateSegmentToWorldPoint(THREE, root, upper, lower, solved.elbowWorld);
  rotateSegmentToWorldPoint(THREE, root, lower, hand, solved.handWorld);
  root.updateMatrixWorld(true);
}

function rolledWorldQuaternionToDownReference(THREE, lower, hand, baseHandWorld, targetLocalAxis, desiredWorldAxis, maxTwistDeg = 180, rollOffsetDeg = 0) {
  const rollAxis = worldPosition(THREE, hand).sub(worldPosition(THREE, lower));
  if (rollAxis.lengthSq() < 1e-8) return baseHandWorld.clone().normalize();
  rollAxis.normalize();
  const current = new THREE.Vector3(Number(targetLocalAxis?.[0] || 0), Number(targetLocalAxis?.[1] || 0), Number(targetLocalAxis?.[2] ?? 1)).normalize().applyQuaternion(baseHandWorld).normalize();
  const currentProjected = projectedAroundAxis(THREE, current, rollAxis);
  const desiredProjected = projectedAroundAxis(THREE, desiredWorldAxis.clone().normalize(), rollAxis);
  const signed = Math.atan2(new THREE.Vector3().crossVectors(currentProjected, desiredProjected).dot(rollAxis), currentProjected.dot(desiredProjected))
    + THREE.MathUtils.degToRad(Number(rollOffsetDeg || 0));
  const maxRad = THREE.MathUtils.degToRad(clamp(Number(maxTwistDeg || 180), 0, 180));
  return new THREE.Quaternion().setFromAxisAngle(rollAxis, clamp(signed, -maxRad, maxRad)).multiply(baseHandWorld).normalize();
}

function stabilizeQuaternionTrack(track) {
  let flips = 0;
  const values = track.values;
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

function buildCalibratedRestMap(THREE, sourceRoot, targetRoot, sourceRestMap, targetRestMap, config) {
  applyLocalRest(sourceRoot, sourceRestMap);
  applyLocalRest(targetRoot, targetRestMap);
  const sourceFrame = findNamedBone(sourceRoot, config.sourceFrame || 'ShoulderCenter');
  const targetFrame = findNamedBone(targetRoot, config.targetFrame || 'Spine02');
  const out = new Map(targetRestMap);
  for (const chain of config.chains || []) {
    for (const [sourceAName, sourceBName, targetAName, targetBName] of [
      [chain.sourceUpper, chain.sourceLower, chain.targetUpper, chain.targetLower],
      [chain.sourceLower, chain.sourceHand, chain.targetLower, chain.targetHand],
    ]) {
      const sourceA = findNamedBone(sourceRoot, sourceAName);
      const sourceB = findNamedBone(sourceRoot, sourceBName);
      const targetA = findNamedBone(targetRoot, targetAName);
      const targetB = findNamedBone(targetRoot, targetBName);
      if (!sourceA || !sourceB || !targetA || !targetB) continue;
      const desired = mapDirectionBetweenFrames(THREE, worldPosition(THREE, sourceB).sub(worldPosition(THREE, sourceA)).normalize(), sourceFrame, targetFrame);
      const current = worldPosition(THREE, targetB).sub(worldPosition(THREE, targetA)).normalize();
      const turn = new THREE.Quaternion().setFromUnitVectors(current, desired).normalize();
      setWorldQuaternion(THREE, targetA, turn.multiply(worldQuaternion(THREE, targetA)).normalize());
      targetRoot.updateMatrixWorld(true);
      out.set(canon(targetA.name), targetA.quaternion.clone().normalize());
    }
  }
  for (const pair of config.handDownReferencePairs || []) {
    const sourceHand = findNamedBone(sourceRoot, pair.sourceHand);
    const targetForearm = findNamedBone(targetRoot, pair.targetForearm);
    const targetHand = findNamedBone(targetRoot, pair.targetHand);
    if (!sourceHand || !targetForearm || !targetHand) continue;
    const desired = mapDirectionBetweenFrames(THREE, worldDirection(THREE, sourceHand, pair.sourceLocalAxis || [0, 0, 1]), sourceFrame, targetFrame);
    const q = rolledWorldQuaternionToDownReference(THREE, targetForearm, targetHand, worldQuaternion(THREE, targetHand), pair.targetLocalAxis || [0, 1, 0], desired, 180, pair.rollOffsetDeg || 0);
    setWorldQuaternion(THREE, targetHand, q);
    targetRoot.updateMatrixWorld(true);
    out.set(canon(targetHand.name), targetHand.quaternion.clone().normalize());
  }
  return out;
}

function buildWeaponTrack(THREE, sourceRoot, targetRoot, sourceClip, outputTimes, sampleTimes, tracks, config) {
  const sourceWeaponTrack = sourceClipQuaternionTrack(sourceClip, config.sourceWeapon || 'Weapon.R');
  const targetWeapon = findNamedObject(targetRoot, config.targetWeapon || 'WeaponR');
  const sourceWeapon = findNamedObject(sourceRoot, config.sourceWeapon || 'Weapon.R');
  const sourceFrame = findNamedBone(sourceRoot, config.sourceFrame || 'ShoulderCenter');
  const targetFrame = findNamedBone(targetRoot, config.targetFrame || 'Spine02');
  if (!sourceWeapon || !targetWeapon || !sourceFrame || !targetFrame) return null;
  const targetClip = new THREE.AnimationClip('meshy-ready-target-arms-for-weaponr', outputTimes[outputTimes.length - 1] || 0.001, tracks);
  const values = new Float32Array(outputTimes.length * 4);
  for (let i = 0; i < sampleTimes.length; i += 1) {
    applyClipPose(THREE, sourceRoot, sourceClip, sampleTimes[i]);
    applyClipPose(THREE, targetRoot, targetClip, outputTimes[i]);
    const sourceTipWorld = sourceWeapon.localToWorld(new THREE.Vector3(
      Number(config.sourceTipLocal?.[0] || 0),
      Number(config.sourceTipLocal?.[1] || 0),
      Number(config.sourceTipLocal?.[2] ?? 1)
    ));
    const sourceBladeWorld = sourceTipWorld.sub(worldPosition(THREE, sourceWeapon));
    const sourceUpWorld = worldDirection(THREE, sourceWeapon, config.sourceUpAxis || [0, 1, 0]);
    const targetWeaponWorld = quaternionFromBladeFrame(
      THREE,
      mapDirectionBetweenFrames(THREE, sourceBladeWorld, sourceFrame, targetFrame),
      mapDirectionBetweenFrames(THREE, sourceUpWorld, sourceFrame, targetFrame),
      config.targetBladeLocal || [0, 0, 1],
      config.targetUpLocal || [0, 1, 0]
    );
    setWorldQuaternion(THREE, targetWeapon, targetWeaponWorld);
    targetRoot.updateMatrixWorld(true);
    const q = targetWeapon.quaternion;
    values.set([q.x, q.y, q.z, q.w], i * 4);
  }
  const track = new THREE.QuaternionKeyframeTrack(targetWeapon.name + '.quaternion', outputTimes, values);
  track.userData = {
    orientationMode: 'fps-weaponr-frame-solve',
    weaponTargetBladeLocal: config.targetBladeLocal || [0, 0, 1],
    weaponTargetUpLocal: config.targetUpLocal || [0, 1, 0],
    synthesizedFromStaticSourcePose: !sourceWeaponTrack,
  };
  stabilizeQuaternionTrack(track);
  return track;
}

export function buildMeshyFpsVisualIkReadyClip(THREE, cloneSkinnedObject, sourceRoot, targetRoot, sourceClips, options = {}) {
  const sourceClip = sourceClips.find((clip) => clip.name === (options.sourceClipName || 'OneHandReady'));
  const restClip = sourceClips.find((clip) => clip.name === (options.sourceRestClip || '0T-Pose'));
  if (!sourceClip || !restClip) return { clip: null, generatedClipResolved: false, reason: 'missing-source-ready-or-rest' };
  const timeTrack = sourceClipQuaternionTrack(sourceClip, options.timeSourceBone || 'Hand.R');
  const sourceTimes = [...(timeTrack?.times || [])];
  const firstSourceIndex = options.dropInitialRestKey === false ? 0 : (sourceTimes.length > 1 ? 1 : 0);
  const sampleTimes = sourceTimes.slice(firstSourceIndex);
  const firstSampleTime = sampleTimes[0] || 0;
  const outputTimes = sampleTimes.map((time) => Math.max(0, time - firstSampleTime));
  if (!outputTimes.length) return { clip: null, generatedClipResolved: false, reason: 'missing-source-key-times' };

  const sourceClone = cloneSkinnedObject(sourceRoot);
  const targetClone = cloneSkinnedObject(targetRoot);
  const sourceInitialPose = capturePose(sourceClone);
  const targetInitialPose = capturePose(targetClone);
  const sourceRestMap = clipRestQuaternionMap(THREE, restClip);
  let targetRestMap = bindRestLocalMap(THREE, targetClone);
  const chains = options.chains || [
    { label: 'right', sourceUpper: 'Arm.R', sourceLower: 'Forearm.R', sourceHand: 'Hand.R', targetUpper: 'RightArm', targetLower: 'RightForeArm', targetHand: 'RightHand', sourceDownAxis: [0, -1, 0], targetDownAxis: [0, -1, 0], maxTwistDeg: 180, rollOffsetDeg: -120 },
    { label: 'left', sourceUpper: 'Arm.L', sourceLower: 'Forearm.L', sourceHand: 'Hand.L', targetUpper: 'LeftArm', targetLower: 'LeftForeArm', targetHand: 'LeftHand', sourceDownAxis: [0, -1, 0], targetDownAxis: [0, -1, 0], maxTwistDeg: 180, rollOffsetDeg: -90 },
  ];
  targetRestMap = buildCalibratedRestMap(THREE, sourceClone, targetClone, sourceRestMap, targetRestMap, {
    sourceFrame: 'ShoulderCenter',
    targetFrame: 'Spine02',
    chains,
    handDownReferencePairs: [
      { sourceHand: 'Hand.R', sourceLocalAxis: [0, 0, 1], targetForearm: 'RightForeArm', targetHand: 'RightHand', targetLocalAxis: [0, -1, 0], rollOffsetDeg: -120 },
    ],
  });
  restorePose(sourceClone, sourceInitialPose);
  restorePose(targetClone, targetInitialPose);
  applyLocalRest(sourceClone, sourceRestMap);
  applyLocalRest(targetClone, targetRestMap);
  const sourceRestFrame = makeVisualPoseFrame(THREE, sourceClone, { leftShoulder: 'Arm.L', rightShoulder: 'Arm.R', chest: 'ShoulderCenter', hips: 'Hips' });
  const targetRestFrame = makeVisualPoseFrame(THREE, targetClone, { leftShoulder: 'LeftArm', rightShoulder: 'RightArm', chest: 'Spine02', hips: 'Hips' });
  const setups = chains.map((chain) => {
    const sourceUpper = findNamedBone(sourceClone, chain.sourceUpper);
    const sourceLower = findNamedBone(sourceClone, chain.sourceLower);
    const sourceHand = findNamedBone(sourceClone, chain.sourceHand);
    const targetUpper = findNamedBone(targetClone, chain.targetUpper);
    const targetLower = findNamedBone(targetClone, chain.targetLower);
    const targetHand = findNamedBone(targetClone, chain.targetHand);
    if (!sourceUpper || !sourceLower || !sourceHand || !targetUpper || !targetLower || !targetHand) return null;
    const sourceArmLength = worldPosition(THREE, sourceLower).distanceTo(worldPosition(THREE, sourceUpper)) + worldPosition(THREE, sourceHand).distanceTo(worldPosition(THREE, sourceLower));
    const targetUpperLength = worldPosition(THREE, targetLower).distanceTo(worldPosition(THREE, targetUpper));
    const targetLowerLength = worldPosition(THREE, targetHand).distanceTo(worldPosition(THREE, targetLower));
    return {
      ...chain,
      sourceUpper,
      sourceLower,
      sourceHand,
      targetUpper,
      targetLower,
      targetHand,
      sourceRestElbowLocal: visualPoseLocal(sourceRestFrame, worldPosition(THREE, sourceLower)),
      sourceRestHandLocal: visualPoseLocal(sourceRestFrame, worldPosition(THREE, sourceHand)),
      targetRestElbowLocal: visualPoseLocal(targetRestFrame, worldPosition(THREE, targetLower)),
      targetRestHandLocal: visualPoseLocal(targetRestFrame, worldPosition(THREE, targetHand)),
      targetUpperLength,
      targetLowerLength,
      targetScale: (targetUpperLength + targetLowerLength) / Math.max(0.0001, sourceArmLength),
      targetRestLowerToHand: worldQuaternion(THREE, targetLower).invert().multiply(worldQuaternion(THREE, targetHand)).normalize(),
      sourceRestDownWorld: worldDirection(THREE, sourceHand, chain.sourceDownAxis || [0, -1, 0]),
      targetRestDownWorld: worldDirection(THREE, targetHand, chain.targetDownAxis || [0, -1, 0]),
    };
  }).filter(Boolean);
  const specs = [];
  for (const setup of setups) {
    for (const bone of [setup.targetUpper, setup.targetLower, setup.targetHand]) {
      if (!specs.some((entry) => canon(entry.bone.name) === canon(bone.name))) specs.push({ bone, values: new Float32Array(outputTimes.length * 4) });
    }
  }
  for (let sampleIndex = 0; sampleIndex < sampleTimes.length; sampleIndex += 1) {
    restorePose(sourceClone, sourceInitialPose);
    restorePose(targetClone, targetInitialPose);
    applyLocalRest(targetClone, targetRestMap);
    applyClipPose(THREE, sourceClone, sourceClip, sampleTimes[sampleIndex]);
    const sourcePoseFrame = makeVisualPoseFrame(THREE, sourceClone, { leftShoulder: 'Arm.L', rightShoulder: 'Arm.R', chest: 'ShoulderCenter', hips: 'Hips' });
    const targetPoseFrame = makeVisualPoseFrame(THREE, targetClone, { leftShoulder: 'LeftArm', rightShoulder: 'RightArm', chest: 'Spine02', hips: 'Hips' });
    for (const setup of setups) {
      const sourceElbowLocal = visualPoseLocal(sourcePoseFrame, worldPosition(THREE, setup.sourceLower));
      const sourceHandLocal = visualPoseLocal(sourcePoseFrame, worldPosition(THREE, setup.sourceHand));
      const desiredElbowWorld = visualPoseWorld(targetPoseFrame, setup.targetRestElbowLocal.clone().add(sourceElbowLocal.clone().sub(setup.sourceRestElbowLocal).multiplyScalar(setup.targetScale)));
      const desiredHandWorld = visualPoseWorld(targetPoseFrame, setup.targetRestHandLocal.clone().add(sourceHandLocal.clone().sub(setup.sourceRestHandLocal).multiplyScalar(setup.targetScale)));
      const solved = constrainedTwoBoneWorldJoints(THREE, worldPosition(THREE, setup.targetUpper), desiredElbowWorld, desiredHandWorld, setup.targetUpperLength, setup.targetLowerLength, worldPosition(THREE, setup.targetLower), 0.999);
      solveArmToWorldJoints(THREE, targetClone, setup.targetUpper, setup.targetLower, setup.targetHand, solved);
      const desiredDown = targetDownFromSourceRestDelta(THREE, setup.sourceRestDownWorld, worldDirection(THREE, setup.sourceHand, setup.sourceDownAxis || [0, -1, 0]), setup.targetRestDownWorld, sourceRestFrame, sourcePoseFrame, targetRestFrame, targetPoseFrame);
      const handQ = rolledWorldQuaternionToDownReference(THREE, setup.targetLower, setup.targetHand, worldQuaternion(THREE, setup.targetLower).multiply(setup.targetRestLowerToHand).normalize(), setup.targetDownAxis || [0, -1, 0], desiredDown, setup.maxTwistDeg ?? 180, setup.rollOffsetDeg ?? 0);
      setWorldQuaternion(THREE, setup.targetHand, handQ);
      targetClone.updateMatrixWorld(true);
    }
    for (const spec of specs) {
      const q = spec.bone.quaternion;
      spec.values.set([q.x, q.y, q.z, q.w], sampleIndex * 4);
    }
  }
  const tracks = specs.map((spec) => {
    const track = new THREE.QuaternionKeyframeTrack(spec.bone.name + '.quaternion', outputTimes, spec.values);
    stabilizeQuaternionTrack(track);
    return track;
  });
  const weaponTrack = buildWeaponTrack(THREE, sourceClone, targetClone, sourceClip, outputTimes, sampleTimes, tracks, {
    sourceHand: 'Hand.R',
    sourceWeapon: 'Weapon.R',
    sourceFrame: 'ShoulderCenter',
    targetFrame: 'Spine02',
    sourceTipLocal: [0.00854, 0.57786, 0.00995],
    sourceUpAxis: [0, 1, 0],
    targetHand: 'RightHand',
    targetWeapon: 'WeaponR',
    targetBladeLocal: deriveAttachmentBladeLocal(THREE, options.weaponAttachment).toArray().map((value) => Number(value.toFixed(5))),
    targetUpLocal: [0, 1, 0],
  });
  if (weaponTrack) tracks.push(weaponTrack);
  const clipName = options.clipName || 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]';
  const duration = outputTimes[outputTimes.length - 1] || Math.max(0.001, sourceClip.duration - firstSampleTime);
  const clip = new THREE.AnimationClip(clipName, duration, tracks);
  clip.userData = {
    origin: 'offline-shared-meshy-ready-runtime',
    mode: 'world-joint-projection source-authored-times',
    sourceName: sourceClip.name,
    keyConvert: {
      preservesSourceTimes: true,
      worldJointProjection: true,
      droppedInitialRestKey: firstSourceIndex > 0,
      trimmedInitialRestTime: Number(firstSampleTime.toFixed(6)),
      weaponTrackEnabled: Boolean(weaponTrack),
      weaponTrackTarget: weaponTrack ? 'WeaponR' : null,
      weaponOrientationMode: weaponTrack?.userData?.orientationMode || null,
      weaponTargetBladeLocal: weaponTrack?.userData?.weaponTargetBladeLocal || null,
      weaponTargetUpLocal: weaponTrack?.userData?.weaponTargetUpLocal || null,
      rightRollOffsetDeg: -120,
      leftRollOffsetDeg: -90,
      rightRestTargetLocalAxis: [0, -1, 0],
      leftRestRollOverride: false,
    },
  };
  return { clip, generatedClipResolved: true, reason: 'shared-meshy-ready-runtime', sourceKeyCount: sourceTimes.length, targetKeyCount: outputTimes.length };
}
