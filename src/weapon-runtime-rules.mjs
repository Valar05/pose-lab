export function weaponWorldPosition(THREE, object) {
  return object?.getWorldPosition ? object.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
}

export function weaponWorldQuaternion(THREE, object) {
  return object?.getWorldQuaternion ? object.getWorldQuaternion(new THREE.Quaternion()).normalize() : new THREE.Quaternion();
}

function vectorFromArray(THREE, value, fallback = [0, 0, 0]) {
  const source = Array.isArray(value) ? value : fallback;
  return new THREE.Vector3(Number(source[0] || 0), Number(source[1] || 0), Number(source[2] || 0));
}

function quaternionFromDeg(THREE, value) {
  const q = new THREE.Quaternion();
  if (Array.isArray(value)) {
    q.setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(Number(value[0] || 0)),
      THREE.MathUtils.degToRad(Number(value[1] || 0)),
      THREE.MathUtils.degToRad(Number(value[2] || 0)),
      'XYZ'
    ));
  }
  return q;
}

function placementConfigSignature(config = {}) {
  return JSON.stringify({
    handLocalOffset: Array.isArray(config.handLocalOffset) ? config.handLocalOffset : null,
    modelLocalOffset: Array.isArray(config.modelLocalOffset) ? config.modelLocalOffset : null,
    gripOffset: Array.isArray(config.gripOffset) ? config.gripOffset : null,
    positionMode: config.positionMode || '',
  });
}

export function applyWeaponSocketRuntimeRules(THREE, {
  model,
  proxy,
  animatedSocketRotation = false,
  animatedSourceSocketRotation = false,
  force = false,
  placementSignature = '',
} = {}) {
  if (!model || !proxy?.root) return { handled: false, reason: 'missing-proxy' };
  const config = proxy.config || {};
  if (proxy.sourceSocket) {
    proxy.root.position.set(0, 0, 0);
    if (Array.isArray(config.modelLocalOffset)) proxy.root.position.add(vectorFromArray(THREE, config.modelLocalOffset));
    if (Array.isArray(config.gripOffset)) proxy.root.position.add(vectorFromArray(THREE, config.gripOffset));
    return { handled: true, mode: 'source-socket', local: proxy.root.position.clone() };
  }
  if (!proxy.rightHand) return { handled: false, reason: 'missing-right-hand' };

  model.updateMatrixWorld(true);
  const rightWorld = Array.isArray(config.handLocalOffset)
    ? proxy.rightHand.localToWorld(vectorFromArray(THREE, config.handLocalOffset))
    : weaponWorldPosition(THREE, proxy.rightHand);
  const leftWorld = proxy.leftHand ? weaponWorldPosition(THREE, proxy.leftHand) : rightWorld.clone();
  const socketWorld = (config.positionMode || 'two-hand-center') === 'right-hand' || !proxy.leftHand
    ? rightWorld.clone()
    : rightWorld.clone().add(leftWorld).multiplyScalar(0.5);
  const local = model.worldToLocal(socketWorld.clone());
  if (Array.isArray(config.modelLocalOffset)) local.add(vectorFromArray(THREE, config.modelLocalOffset));
  if (Array.isArray(config.gripOffset)) local.add(vectorFromArray(THREE, config.gripOffset));

  if (config.parentMode === 'synthetic-source-socket' && proxy.syntheticSourceSocket) {
    const socketParent = proxy.syntheticSourceSocket;
    const fkSignature = placementConfigSignature(config);
    const fallbackSocketWorldQuaternion = weaponWorldQuaternion(THREE, model).multiply(quaternionFromDeg(THREE, config.rotationDeg)).normalize();
    if (Array.isArray(config.handLocalOffset)) socketParent.position.copy(vectorFromArray(THREE, config.handLocalOffset));
    else socketParent.position.set(0, 0, 0);
    if (!animatedSourceSocketRotation) {
      socketParent.quaternion.copy(weaponWorldQuaternion(THREE, proxy.rightHand).invert().multiply(fallbackSocketWorldQuaternion).normalize());
    }
    socketParent.updateMatrixWorld(true);
    if (force || proxy.syntheticFkSignature !== fkSignature || !proxy.syntheticFkLocalPosition || !proxy.syntheticFkLocalQuaternion) {
      const syntheticGripLocal = new THREE.Vector3();
      if (Array.isArray(config.modelLocalOffset)) syntheticGripLocal.add(vectorFromArray(THREE, config.modelLocalOffset));
      if (Array.isArray(config.gripOffset)) syntheticGripLocal.add(vectorFromArray(THREE, config.gripOffset));
      const modelWorldScale = model.getWorldScale(new THREE.Vector3());
      const socketWorldScale = socketParent.getWorldScale(new THREE.Vector3());
      syntheticGripLocal.multiply(new THREE.Vector3(
        modelWorldScale.x / Math.max(0.000001, Math.abs(socketWorldScale.x)),
        modelWorldScale.y / Math.max(0.000001, Math.abs(socketWorldScale.y)),
        modelWorldScale.z / Math.max(0.000001, Math.abs(socketWorldScale.z))
      ));
      proxy.root.position.copy(syntheticGripLocal);
      if (!animatedSocketRotation) proxy.root.quaternion.identity();
      proxy.root.updateMatrixWorld(true);
      proxy.syntheticFkLocalPosition = proxy.root.position.clone();
      proxy.syntheticFkLocalQuaternion = proxy.root.quaternion.clone().normalize();
      proxy.syntheticFkSignature = fkSignature;
      proxy.socketHandBaselineSignature = fkSignature;
    }
    proxy.root.position.copy(proxy.syntheticFkLocalPosition);
    if (!animatedSocketRotation) proxy.root.quaternion.copy(proxy.syntheticFkLocalQuaternion);
    proxy.root.updateMatrixWorld(true);
    proxy.socketHandBaselineLocal = proxy.rightHand.worldToLocal(weaponWorldPosition(THREE, proxy.root).clone());
    return {
      handled: true,
      mode: 'synthetic-source-socket',
      local,
      authoredSocketWorld: weaponWorldPosition(THREE, proxy.root),
      targetSocketWorld: weaponWorldPosition(THREE, proxy.root),
      socketHandBaselineLocal: proxy.socketHandBaselineLocal.clone(),
      syntheticFkLocalPosition: proxy.syntheticFkLocalPosition.clone(),
      syntheticFkLocalQuaternion: proxy.syntheticFkLocalQuaternion.clone(),
      socketParent,
      root: proxy.root,
    };
  }

  if (config.parentMode === 'hand-fk') {
    if (force || proxy.fkPlacementSignature !== placementSignature || !proxy.fkLocalPosition || !proxy.fkLocalQuaternion) {
      const socketWorldPosition = model.localToWorld(local.clone());
      proxy.fkLocalPosition = socketWorldPosition.clone().applyMatrix4(proxy.rightHand.matrixWorld.clone().invert());
      const socketWorldQuaternion = weaponWorldQuaternion(THREE, model).multiply(quaternionFromDeg(THREE, config.rotationDeg)).normalize();
      proxy.fkLocalQuaternion = weaponWorldQuaternion(THREE, proxy.rightHand).invert().multiply(socketWorldQuaternion).normalize();
      proxy.fkPlacementSignature = placementSignature;
      proxy.root.position.copy(proxy.fkLocalPosition);
      proxy.root.quaternion.copy(proxy.fkLocalQuaternion);
    }
    return { handled: true, mode: 'hand-fk', local, root: proxy.root };
  }

  if (!proxy.leftHand) return { handled: false, reason: 'missing-left-hand', local };
  proxy.root.position.copy(local);
  if (!animatedSocketRotation) {
    const modelWorldQuat = weaponWorldQuaternion(THREE, model).invert();
    proxy.root.quaternion.copy(modelWorldQuat.multiply(weaponWorldQuaternion(THREE, proxy.rightHand))).normalize();
  }
  return { handled: true, mode: 'two-hand-center', local, root: proxy.root };
}

export function pinWeaponLocalPointToDisplay(THREE, weaponRoot, displayRoot, localPoint = [0, 0, 0], targetLocal = [0, 0, 0]) {
  if (!weaponRoot || !displayRoot || !Array.isArray(localPoint)) return null;
  displayRoot.updateMatrixWorld(true);
  weaponRoot.updateMatrixWorld(true);
  const actualWorld = weaponRoot.localToWorld(vectorFromArray(THREE, localPoint));
  const actualLocal = displayRoot.worldToLocal(actualWorld.clone());
  const target = vectorFromArray(THREE, targetLocal);
  const correction = actualLocal.sub(target);
  weaponRoot.position.sub(correction);
  weaponRoot.updateMatrixWorld(true);
  return correction;
}

export function applyWeaponAttachmentRuntimeRules(THREE, {
  actorModel,
  proxy,
  config = proxy?.attachmentConfig,
} = {}) {
  const weaponRoot = proxy?.model;
  const tip = proxy?.tipMarker;
  if (!weaponRoot || !config) return null;
  const attachmentScale = Number(config.scale ?? 1);
  const displayRoot = proxy.displayRoot || weaponRoot.parent || proxy.root;
  const socketScaleCompensation = new THREE.Vector3(1, 1, 1);
  if ((proxy?.config?.parentMode === 'hand-fk' || proxy?.config?.parentMode === 'synthetic-source-socket') && proxy.root && actorModel) {
    actorModel.updateMatrixWorld(true);
    proxy.root.updateMatrixWorld(true);
    const modelWorldScale = actorModel.getWorldScale(new THREE.Vector3());
    const socketWorldScale = proxy.root.getWorldScale(new THREE.Vector3());
    socketScaleCompensation.set(
      modelWorldScale.x / Math.max(0.000001, Math.abs(socketWorldScale.x)),
      modelWorldScale.y / Math.max(0.000001, Math.abs(socketWorldScale.y)),
      modelWorldScale.z / Math.max(0.000001, Math.abs(socketWorldScale.z))
    );
  }
  if (displayRoot) {
    displayRoot.position.set(0, 0, 0);
    displayRoot.quaternion.identity();
    displayRoot.scale.copy(socketScaleCompensation);
    displayRoot.visible = true;
  }
  weaponRoot.scale.setScalar(attachmentScale);
  if (Array.isArray(config.rotationDeg)) {
    weaponRoot.rotation.set(
      THREE.MathUtils.degToRad(Number(config.rotationDeg[0] || 0)),
      THREE.MathUtils.degToRad(Number(config.rotationDeg[1] || 0)),
      THREE.MathUtils.degToRad(Number(config.rotationDeg[2] || 0))
    );
  }
  if (Array.isArray(config.position)) weaponRoot.position.copy(vectorFromArray(THREE, config.position));
  else weaponRoot.position.set(0, 0, 0);
  if (Array.isArray(config.gripLocalPosition)) {
    const localGrip = vectorFromArray(THREE, config.gripLocalPosition);
    localGrip.multiplyScalar(attachmentScale);
    localGrip.applyQuaternion(weaponRoot.quaternion);
    weaponRoot.position.sub(localGrip);
    pinWeaponLocalPointToDisplay(THREE, weaponRoot, displayRoot, config.gripLocalPosition, config.position || [0, 0, 0]);
  }
  if (tip) {
    if (Array.isArray(config.tipLocalPosition)) {
      const localTip = vectorFromArray(THREE, config.tipLocalPosition);
      localTip.multiplyScalar(attachmentScale);
      localTip.applyQuaternion(weaponRoot.quaternion);
      localTip.add(weaponRoot.position);
      tip.position.copy(localTip);
    } else {
      tip.position.copy(vectorFromArray(THREE, config.tipOffset || proxy?.config?.tipOffset || [0, 0, 0.85]));
    }
  }
  updateWeaponFallbackFromTipRuntime(THREE, proxy);
  return { proxy, displayRoot, weaponRoot, tip, socketScaleCompensation };
}

export function updateWeaponFallbackFromTipRuntime(THREE, proxy) {
  const displayRoot = proxy?.displayRoot;
  if (!displayRoot) return null;
  const blade = displayRoot.children.find((entry) => entry.userData?.weaponFallbackBlade);
  const hilt = displayRoot.children.find((entry) => entry.userData?.weaponFallbackHilt);
  if (!blade) return null;
  const fallbackVisible = !(proxy?.model && proxy?.attachmentConfig?.url);
  const tipLocal = proxy?.tipMarker
    ? proxy.tipMarker.position.clone()
    : vectorFromArray(THREE, proxy?.config?.tipOffset || [0, 0, Number(proxy?.config?.length || 0.85)]);
  let length = tipLocal.length();
  if (length < 0.0001) {
    length = Number(proxy?.config?.length || 0.85);
    tipLocal.set(0, 0, length);
  }
  const dir = tipLocal.clone().normalize();
  const baseLength = Number(blade.userData?.weaponFallbackBladeBaseLength || proxy?.config?.length || 0.85);
  blade.position.copy(tipLocal).multiplyScalar(0.5);
  blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  blade.scale.set(1, length / Math.max(0.0001, baseLength), 1);
  blade.visible = fallbackVisible;
  if (hilt) {
    hilt.position.set(0, 0, 0);
    hilt.quaternion.identity();
    hilt.scale.set(1, 1, 1);
    hilt.visible = fallbackVisible;
  }
  return { blade, hilt, tipLocal, length, fallbackVisible };
}

export function captureWeaponLayerRuntimeState(proxy) {
  const fallbackBlade = proxy?.displayRoot?.children?.find((entry) => entry.userData?.weaponFallbackBlade) || null;
  const fallbackHilt = proxy?.displayRoot?.children?.find((entry) => entry.userData?.weaponFallbackHilt) || null;
  const hasRealWeaponModel = Boolean(proxy?.model && proxy?.attachmentConfig?.url);
  return {
    schema: 'pose-lab-weapon-layer-runtime-state-v1',
    hasRealWeaponModel,
    realWeaponVisible: Boolean(proxy?.model?.visible),
    displayRootVisible: Boolean(proxy?.displayRoot?.visible),
    socketVisible: Boolean(proxy?.root?.visible),
    fallbackBladeVisible: Boolean(fallbackBlade?.visible),
    fallbackHiltVisible: Boolean(fallbackHilt?.visible),
    fallbackHiddenWithRealWeapon: hasRealWeaponModel ? !fallbackBlade?.visible && !fallbackHilt?.visible : true,
  };
}

function weaponDistance(a, b) {
  return a && b ? a.distanceTo(b) : null;
}

function weaponPalmTargetWorld(THREE, proxy) {
  if (!proxy?.rightHand) return null;
  const local = Array.isArray(proxy?.config?.handLocalOffset)
    ? vectorFromArray(THREE, proxy.config.handLocalOffset)
    : new THREE.Vector3();
  return proxy.rightHand.localToWorld(local);
}

function weaponSocketHandBaselineWorld(THREE, proxy) {
  if (!proxy?.rightHand || !proxy?.socketHandBaselineLocal) return null;
  return proxy.rightHand.localToWorld(proxy.socketHandBaselineLocal.clone());
}

function weaponParentSocket(proxy) {
  return proxy?.sourceSocket || proxy?.syntheticSourceSocket || null;
}

function weaponLocalQuaternion(THREE, parent, child) {
  if (!parent || !child) return null;
  return weaponWorldQuaternion(THREE, parent).invert().multiply(weaponWorldQuaternion(THREE, child)).normalize();
}

export function captureWeaponRuntimeLandmarks(THREE, proxy) {
  proxy?.root?.updateMatrixWorld?.(true);
  proxy?.displayRoot?.updateMatrixWorld?.(true);
  proxy?.model?.updateMatrixWorld?.(true);
  proxy?.tipMarker?.updateMatrixWorld?.(true);
  proxy?.rightHand?.updateMatrixWorld?.(true);
  proxy?.leftHand?.updateMatrixWorld?.(true);
  proxy?.syntheticSourceSocket?.updateMatrixWorld?.(true);
  const configuredGrip = (() => {
    if (!proxy?.model || !Array.isArray(proxy?.attachmentConfig?.gripLocalPosition)) return null;
    return proxy.model.localToWorld(vectorFromArray(THREE, proxy.attachmentConfig.gripLocalPosition));
  })();
  const fallbackBlade = proxy?.displayRoot?.children?.find((entry) => entry.userData?.weaponFallbackBlade) || null;
  const fallbackHilt = proxy?.displayRoot?.children?.find((entry) => entry.userData?.weaponFallbackHilt) || null;
  fallbackBlade?.updateMatrixWorld?.(true);
  fallbackHilt?.updateMatrixWorld?.(true);
  return {
    rightHand: proxy?.rightHand ? weaponWorldPosition(THREE, proxy.rightHand) : null,
    palmTarget: weaponPalmTargetWorld(THREE, proxy),
    socketHandBaseline: weaponSocketHandBaselineWorld(THREE, proxy),
    leftHand: proxy?.leftHand ? weaponWorldPosition(THREE, proxy.leftHand) : null,
    socket: proxy?.root ? weaponWorldPosition(THREE, proxy.root) : null,
    syntheticSourceSocket: proxy?.syntheticSourceSocket ? weaponWorldPosition(THREE, proxy.syntheticSourceSocket) : null,
    displayRoot: proxy?.displayRoot ? weaponWorldPosition(THREE, proxy.displayRoot) : null,
    model: proxy?.model ? weaponWorldPosition(THREE, proxy.model) : null,
    configuredGrip,
    appliedHilt: configuredGrip,
    tip: proxy?.tipMarker ? weaponWorldPosition(THREE, proxy.tipMarker) : null,
    fallbackBlade: fallbackBlade ? weaponWorldPosition(THREE, fallbackBlade) : null,
    fallbackHilt: fallbackHilt ? weaponWorldPosition(THREE, fallbackHilt) : null,
  };
}

export function captureWeaponPinningRuntimeState(THREE, proxy) {
  const landmarks = captureWeaponRuntimeLandmarks(THREE, proxy);
  const socketInHand = proxy?.rightHand && proxy?.root
    ? proxy.rightHand.worldToLocal(weaponWorldPosition(THREE, proxy.root).clone())
    : null;
  const appliedHiltInHand = proxy?.rightHand && landmarks.appliedHilt
    ? proxy.rightHand.worldToLocal(landmarks.appliedHilt.clone())
    : null;
  const socketInPalmTarget = socketInHand && Array.isArray(proxy?.config?.handLocalOffset)
    ? socketInHand.clone().sub(vectorFromArray(THREE, proxy.config.handLocalOffset))
    : socketInHand?.clone?.() || null;
  const displayInSocket = proxy?.root && proxy?.displayRoot
    ? proxy.root.worldToLocal(weaponWorldPosition(THREE, proxy.displayRoot).clone())
    : null;
  const sourceSocket = weaponParentSocket(proxy);
  const socketInSourceSocket = sourceSocket && proxy?.root
    ? sourceSocket.worldToLocal(weaponWorldPosition(THREE, proxy.root).clone())
    : null;
  const socketQuaternionInSourceSocket = sourceSocket && proxy?.root
    ? weaponLocalQuaternion(THREE, sourceSocket, proxy.root)
    : null;
  const displayQuaternionInSocket = proxy?.root && proxy?.displayRoot
    ? weaponLocalQuaternion(THREE, proxy.root, proxy.displayRoot)
    : null;
  const modelInDisplay = proxy?.displayRoot && proxy?.model
    ? proxy.displayRoot.worldToLocal(weaponWorldPosition(THREE, proxy.model).clone())
    : null;
  const modelQuaternionInDisplay = proxy?.displayRoot && proxy?.model
    ? weaponLocalQuaternion(THREE, proxy.displayRoot, proxy.model)
    : null;
  const distances = {
    handToSocket: weaponDistance(landmarks.rightHand, landmarks.socket),
    palmTargetToSocket: weaponDistance(landmarks.palmTarget, landmarks.socket),
    handBaselineToSocket: weaponDistance(landmarks.socketHandBaseline, landmarks.socket),
    socketToAppliedHilt: weaponDistance(landmarks.socket, landmarks.appliedHilt),
    handToAppliedHilt: weaponDistance(landmarks.rightHand, landmarks.appliedHilt),
    palmTargetToAppliedHilt: weaponDistance(landmarks.palmTarget, landmarks.appliedHilt),
    handBaselineToAppliedHilt: weaponDistance(landmarks.socketHandBaseline, landmarks.appliedHilt),
    appliedHiltToTip: weaponDistance(landmarks.appliedHilt, landmarks.tip),
    socketToTip: weaponDistance(landmarks.socket, landmarks.tip),
    socketToFallbackHilt: weaponDistance(landmarks.socket, landmarks.fallbackHilt),
  };
  const palmTargetTolerance = 0.015;
  const handBaselineTolerance = 0.005;
  return {
    schema: 'pose-lab-weapon-pinning-runtime-state-v1',
    landmarks,
    local: {
      socketInHand,
      appliedHiltInHand,
      socketHandBaseline: proxy?.socketHandBaselineLocal?.clone?.() || null,
      socketInPalmTarget,
      socketInSourceSocket,
      socketQuaternionInSourceSocket,
      displayInSocket,
      displayQuaternionInSocket,
      modelInDisplay,
      modelQuaternionInDisplay,
    },
    distances,
    checks: {
      appliedHiltPinnedToSocket: Number.isFinite(distances.socketToAppliedHilt) && distances.socketToAppliedHilt <= 0.0005,
      socketPinnedToHandBaseline: Number.isFinite(distances.handBaselineToSocket) && distances.handBaselineToSocket <= handBaselineTolerance,
      appliedHiltPinnedToHandBaseline: Number.isFinite(distances.handBaselineToAppliedHilt) && distances.handBaselineToAppliedHilt <= handBaselineTolerance,
      socketPinnedToPalmTarget: Number.isFinite(distances.palmTargetToSocket) && distances.palmTargetToSocket <= palmTargetTolerance,
      appliedHiltPinnedToPalmTarget: Number.isFinite(distances.palmTargetToAppliedHilt) && distances.palmTargetToAppliedHilt <= palmTargetTolerance,
      appliedHiltNotCollapsedToRawHand: Number.isFinite(distances.handToAppliedHilt) && distances.handToAppliedHilt > 0.05,
      bladeLengthFinite: Number.isFinite(distances.appliedHiltToTip) && distances.appliedHiltToTip > 0.05,
    },
    thresholds: {
      palmTargetTolerance,
      handBaselineTolerance,
      socketToAppliedHiltTolerance: 0.0005,
    },
    layers: captureWeaponLayerRuntimeState(proxy),
  };
}
