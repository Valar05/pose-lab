export function weaponTruthWorldPosition(THREE, node) {
  return node.getWorldPosition(new THREE.Vector3());
}

export function weaponTruthWorldQuaternion(THREE, node) {
  return node.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

export function weaponTruthWorldDirection(THREE, node, axis = [0, 0, 1]) {
  return new THREE.Vector3(...axis).normalize().applyQuaternion(weaponTruthWorldQuaternion(THREE, node)).normalize();
}

export function updateSyntheticWeaponSocketTransform(THREE, { model, root, rightHand, leftHand = null, sourceSocket = null, config = {}, activeClipHasSocketRotation = false } = {}) {
  if (!model || !root) return null;
  if (sourceSocket) {
    root.position.set(0, 0, 0);
    if (Array.isArray(config.modelLocalOffset)) root.position.add(new THREE.Vector3().fromArray(config.modelLocalOffset));
    if (Array.isArray(config.gripOffset)) root.position.add(new THREE.Vector3().fromArray(config.gripOffset));
    return { socketUpdated: true, sourceSocket: true, copiedHandQuaternion: false };
  }
  if (!rightHand) return null;
  model.updateMatrixWorld(true);
  const rightWorld = Array.isArray(config.handLocalOffset)
    ? rightHand.localToWorld(new THREE.Vector3().fromArray(config.handLocalOffset))
    : weaponTruthWorldPosition(THREE, rightHand);
  const leftWorld = leftHand ? weaponTruthWorldPosition(THREE, leftHand) : rightWorld;
  const socketWorld = (config.positionMode || 'two-hand-center') === 'right-hand'
    ? rightWorld.clone()
    : rightWorld.clone().add(leftWorld).multiplyScalar(0.5);
  const local = model.worldToLocal(socketWorld.clone());
  if (Array.isArray(config.modelLocalOffset)) local.add(new THREE.Vector3().fromArray(config.modelLocalOffset));
  if (Array.isArray(config.gripOffset)) local.add(new THREE.Vector3().fromArray(config.gripOffset));
  root.position.copy(local);
  let copiedHandQuaternion = false;
  if (!activeClipHasSocketRotation) {
    const modelWorldQuat = weaponTruthWorldQuaternion(THREE, model).invert();
    root.quaternion.copy(modelWorldQuat.multiply(weaponTruthWorldQuaternion(THREE, rightHand))).normalize();
    copiedHandQuaternion = true;
  }
  model.updateMatrixWorld(true);
  return { socketUpdated: true, sourceSocket: false, copiedHandQuaternion };
}

export function applyWeaponAttachmentTruthTransform(THREE, { weaponRoot, tip = null, config = {}, fallbackTipOffset = [0, 0, 0.85], boneRest = null } = {}) {
  if (!weaponRoot || !config) return null;
  weaponRoot.scale.setScalar(Number(config.scale ?? 1));
  if (Array.isArray(config.rotationDeg)) weaponRoot.rotation.set(...config.rotationDeg.map((value) => THREE.MathUtils.degToRad(value || 0)));
  if (Array.isArray(config.position)) weaponRoot.position.fromArray(config.position);
  else weaponRoot.position.set(0, 0, 0);
  if (Array.isArray(config.gripLocalPosition)) {
    const localGrip = new THREE.Vector3().fromArray(config.gripLocalPosition);
    localGrip.multiplyScalar(Number(config.scale ?? 1));
    localGrip.applyQuaternion(weaponRoot.quaternion);
    weaponRoot.position.sub(localGrip);
  }
  if (tip) {
    if (Array.isArray(config.tipLocalPosition)) {
      const localTip = new THREE.Vector3().fromArray(config.tipLocalPosition);
      localTip.multiplyScalar(Number(config.scale ?? 1));
      localTip.applyQuaternion(weaponRoot.quaternion);
      localTip.add(weaponRoot.position);
      tip.position.copy(localTip);
    } else {
      tip.position.fromArray(config.tipOffset || fallbackTipOffset);
    }
    const rest = boneRest?.get?.(tip.name);
    if (rest) rest.position.copy(tip.position);
  }
  return { attachmentUpdated: true };
}

export function classifyWeaponVisibility({ clipName = '', clipUserData = {}, config = {}, weaponDebug = false } = {}) {
  const patterns = config.visibleClipPatterns || ['\\[FPS-SWORD-UPPER\\]', 'OneHand'];
  const matchedPattern = patterns.find((pattern) => new RegExp(pattern).test(clipName || '')) || '';
  const visible = Boolean(weaponDebug || clipUserData?.weaponPathIk || matchedPattern);
  const reasons = [];
  if (weaponDebug) reasons.push('weapon-debug-forced-visible');
  if (clipUserData?.weaponPathIk) reasons.push('clip-userdata-weaponPathIk');
  if (matchedPattern) reasons.push(`visible-pattern:${matchedPattern}`);
  if (!visible) reasons.push('runtime-visibility-hidden');
  return {
    visible,
    visibilityClass: visible ? 'weapon-visible' : 'weapon-hidden',
    matchedPattern,
    patterns,
    reasons,
  };
}

export function measureReadyWeaponTruth(THREE, { socket, rightHand, weaponRoot = null, tip = null, attachmentConfig = {} } = {}) {
  if (!socket || !rightHand) return null;
  socket.updateMatrixWorld(true);
  rightHand.updateMatrixWorld(true);
  weaponRoot?.updateMatrixWorld?.(true);
  tip?.updateMatrixWorld?.(true);
  const hilt = weaponTruthWorldPosition(THREE, socket);
  const hand = weaponTruthWorldPosition(THREE, rightHand);
  let tipWorld = tip ? weaponTruthWorldPosition(THREE, tip) : null;
  if (!tipWorld && weaponRoot && Array.isArray(attachmentConfig.tipLocalPosition)) {
    const localTip = new THREE.Vector3().fromArray(attachmentConfig.tipLocalPosition);
    localTip.multiplyScalar(Number(attachmentConfig.scale ?? 1));
    localTip.applyQuaternion(weaponRoot.quaternion);
    localTip.add(weaponRoot.position);
    tipWorld = socket.localToWorld(localTip.clone());
  }
  if (!tipWorld) tipWorld = hilt.clone().add(weaponTruthWorldDirection(THREE, socket, [0, 0, 1]));
  const bladeAxis = tipWorld.clone().sub(hilt);
  if (bladeAxis.lengthSq() > 1e-9) bladeAxis.normalize();
  return {
    hilt,
    hand,
    tip: tipWorld,
    bladeAxis,
    socketForward: weaponTruthWorldDirection(THREE, socket, [0, 0, 1]),
    socketQuaternion: weaponTruthWorldQuaternion(THREE, socket),
    handQuaternion: weaponTruthWorldQuaternion(THREE, rightHand),
    hiltToHandDistance: hilt.distanceTo(hand),
  };
}

function roundTruth(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function vectorTruthPoint(vector, digits = 5) {
  if (!vector) return null;
  return [roundTruth(vector.x, digits), roundTruth(vector.y, digits), roundTruth(vector.z, digits)];
}

function quaternionTruthPoint(quaternion, digits = 6) {
  if (!quaternion) return null;
  return [roundTruth(quaternion.x, digits), roundTruth(quaternion.y, digits), roundTruth(quaternion.z, digits), roundTruth(quaternion.w, digits)];
}

function distanceBetween(a, b) {
  return a && b ? a.distanceTo(b) : null;
}

export function classifyReadyWeaponTransform(THREE, { readyState, restState, maxHiltToHand = 0.18, minBladeAxisChangeDeg = 20, maxSocketHandQuaternionErrorDeg = 0.5 } = {}) {
  if (!readyState || !restState) {
    return {
      status: 'blocked',
      transformClass: 'unknown',
      reasons: ['missing-state'],
      blockingReasons: ['missing-state'],
      metrics: {},
      thresholds: { maxHiltToHand, minBladeAxisChangeDeg, maxSocketHandQuaternionErrorDeg },
      coordinates: {},
      deltas: {},
    };
  }
  const bladeAxisChangeDeg = THREE.MathUtils.radToDeg(restState.bladeAxis.clone().normalize().angleTo(readyState.bladeAxis.clone().normalize()));
  const socketHandQuaternionErrorDeg = THREE.MathUtils.radToDeg(readyState.socketQuaternion.angleTo(readyState.handQuaternion));
  const socketPositionDeltaFromRest = distanceBetween(readyState.hilt, restState.hilt);
  const tipDeltaFromRest = distanceBetween(readyState.tip, restState.tip);
  const follows = readyState.hiltToHandDistance <= maxHiltToHand
    && bladeAxisChangeDeg >= minBladeAxisChangeDeg
    && socketHandQuaternionErrorDeg <= maxSocketHandQuaternionErrorDeg;
  const reasons = [];
  if (readyState.hiltToHandDistance > maxHiltToHand) reasons.push('hilt-far-from-hand');
  if (bladeAxisChangeDeg < minBladeAxisChangeDeg) reasons.push('blade-rest-space');
  if (socketHandQuaternionErrorDeg > maxSocketHandQuaternionErrorDeg) reasons.push('socket-not-hand-frame');
  const metrics = {
    hiltToHandDistance: roundTruth(readyState.hiltToHandDistance),
    bladeAxisChangeFromRestDeg: roundTruth(bladeAxisChangeDeg, 2),
    socketToHandQuaternionErrorDeg: roundTruth(socketHandQuaternionErrorDeg, 3),
    socketPositionDeltaFromRest: roundTruth(socketPositionDeltaFromRest),
    tipDeltaFromRest: roundTruth(tipDeltaFromRest),
  };
  return {
    status: follows ? 'pass' : 'fail',
    transformClass: follows ? 'sword-follows-fk' : 'sword-rest-space',
    reasons,
    blockingReasons: [],
    metrics,
    thresholds: { maxHiltToHand, minBladeAxisChangeDeg, maxSocketHandQuaternionErrorDeg },
    coordinates: {
      ready: {
        hilt: vectorTruthPoint(readyState.hilt),
        tip: vectorTruthPoint(readyState.tip),
        bladeAxis: vectorTruthPoint(readyState.bladeAxis),
        socketPosition: vectorTruthPoint(readyState.hilt),
        socketForward: vectorTruthPoint(readyState.socketForward),
        socketQuaternion: quaternionTruthPoint(readyState.socketQuaternion),
        hand: vectorTruthPoint(readyState.hand),
        handQuaternion: quaternionTruthPoint(readyState.handQuaternion),
      },
      rest: {
        hilt: vectorTruthPoint(restState.hilt),
        tip: vectorTruthPoint(restState.tip),
        bladeAxis: vectorTruthPoint(restState.bladeAxis),
        socketPosition: vectorTruthPoint(restState.hilt),
        socketForward: vectorTruthPoint(restState.socketForward),
        socketQuaternion: quaternionTruthPoint(restState.socketQuaternion),
        hand: vectorTruthPoint(restState.hand),
        handQuaternion: quaternionTruthPoint(restState.handQuaternion),
      },
    },
    deltas: {
      hiltToHandDistance: metrics.hiltToHandDistance,
      socketPositionDeltaFromRest: metrics.socketPositionDeltaFromRest,
      tipDeltaFromRest: metrics.tipDeltaFromRest,
      bladeAxisChangeFromRestDeg: metrics.bladeAxisChangeFromRestDeg,
      socketToHandQuaternionErrorDeg: metrics.socketToHandQuaternionErrorDeg,
    },
  };
}

export function buildReadyWeaponVisibilityGate(visibility = null) {
  const visible = visibility?.visible === true;
  const reasons = [...(visibility?.reasons || [])];
  const blockingReasons = visible ? [] : [...reasons, 'visibility-required-before-transform-parity'];
  return {
    status: visible ? 'pass' : 'fail',
    visible,
    visibilityClass: visibility?.visibilityClass || (visible ? 'weapon-visible' : 'weapon-hidden'),
    matchedPattern: visibility?.matchedPattern || '',
    patterns: visibility?.patterns || [],
    reasons,
    blockingReasons,
  };
}

export function classifyReadyWeaponTruth(THREE, { readyState, restState, visibility = null } = {}) {
  const visibilityGate = buildReadyWeaponVisibilityGate(visibility);
  const transform = classifyReadyWeaponTransform(THREE, { readyState, restState });
  const transformGate = visibilityGate.status === 'pass'
    ? transform
    : {
        ...transform,
        status: 'blocked',
        blockingReasons: [...(transform.blockingReasons || []), ...visibilityGate.blockingReasons],
      };
  const reasons = [...(transform.reasons || [])];
  if (visibilityGate.status !== 'pass') reasons.push('weapon-not-visible-in-runtime');
  return {
    visualClass: visibilityGate.status === 'pass' ? transform.transformClass : 'sword-hidden',
    transformClass: transform.transformClass,
    visibilityClass: visibilityGate.visibilityClass,
    reasons,
    metrics: transform.metrics,
    visibility,
    visibilityGate,
    transformGate,
  };
}

export function buildObservedTruthContext(observedWebTruth = null) {
  if (!observedWebTruth) return { authority: 'context-only', present: false };
  return {
    authority: 'context-only',
    present: true,
    schema: observedWebTruth.schema || '',
    visualClass: observedWebTruth.visualClass || '',
    visualRead: observedWebTruth.visualRead || '',
    capturePaths: observedWebTruth.capturePaths || [],
    cacheToken: observedWebTruth.cacheToken || '',
    runtimeBuild: observedWebTruth.runtimeBuild || '',
  };
}

export function buildReadyWeaponParityVerdict({ offlineTruth, observedWebTruth = null } = {}) {
  const visibilityPass = offlineTruth?.visibilityGate?.status === 'pass';
  const transformPass = offlineTruth?.transformGate?.status === 'pass';
  const machineGatesPass = Boolean(visibilityPass && transformPass);
  const failures = [];
  if (!visibilityPass) failures.push('visibility-gate-failed');
  if (offlineTruth?.transformGate?.status === 'blocked') failures.push('transform-gate-blocked');
  else if (!transformPass) failures.push('transform-gate-failed');
  return {
    authority: 'offline-machine-gates',
    observedTruthAuthority: 'context-only',
    parityMatches: machineGatesPass,
    machineGatesPass,
    visualVerdict: machineGatesPass ? 'fixed' : 'red',
    parityFailure: failures.join(';') || '',
    visibilityGate: offlineTruth?.visibilityGate || null,
    transformGate: offlineTruth?.transformGate || null,
    observedTruth: buildObservedTruthContext(observedWebTruth),
  };
}
