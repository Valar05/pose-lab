export function roundFkMetric(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

export function vectorFromConfig(THREE, value = []) {
  return new THREE.Vector3(
    Number(value?.[0] || 0),
    Number(value?.[1] || 0),
    Number(value?.[2] || 0),
  );
}

export function authoredWeaponSocketLocal(THREE, config = {}) {
  const position = new THREE.Vector3();
  if (Array.isArray(config.handLocalOffset)) position.add(vectorFromConfig(THREE, config.handLocalOffset));
  if (Array.isArray(config.modelLocalOffset)) position.add(vectorFromConfig(THREE, config.modelLocalOffset));
  if (Array.isArray(config.gripOffset)) position.add(vectorFromConfig(THREE, config.gripOffset));
  const rotationDeg = Array.isArray(config.rotationDeg) ? config.rotationDeg : [0, 0, 0];
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(Number(rotationDeg[0] || 0)),
    THREE.MathUtils.degToRad(Number(rotationDeg[1] || 0)),
    THREE.MathUtils.degToRad(Number(rotationDeg[2] || 0)),
    'XYZ',
  )).normalize();
  return { position, quaternion };
}

export function worldPoint(THREE, node) {
  return node.getWorldPosition(new THREE.Vector3());
}

export function worldQuaternion(THREE, node) {
  return node.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

export function classifyWeaponTransformMetrics(metrics = {}, thresholds = {}) {
  const limits = {
    maxHiltToHand: Number(thresholds.maxHiltToHand ?? 0.18),
    minBladeAxisChangeFromRestDeg: Number(thresholds.minBladeAxisChangeFromRestDeg ?? 20),
    maxSocketToHandQuaternionErrorDeg: Number(thresholds.maxSocketToHandQuaternionErrorDeg ?? 0.5),
    minSocketPositionDeltaFromRest: Number(thresholds.minSocketPositionDeltaFromRest ?? 0.02),
    minTipDeltaFromRest: Number(thresholds.minTipDeltaFromRest ?? 0.02),
    minSocketQuaternionDeltaFromRestDeg: Number(thresholds.minSocketQuaternionDeltaFromRestDeg ?? 5),
  };
  const values = {
    hiltToHandDistance: Number(metrics.hiltToHandDistance ?? Infinity),
    bladeAxisChangeFromRestDeg: Number(metrics.bladeAxisChangeFromRestDeg ?? 0),
    socketToHandQuaternionErrorDeg: Number(metrics.socketToHandQuaternionErrorDeg ?? Infinity),
    socketPositionDeltaFromRest: Number(metrics.socketPositionDeltaFromRest ?? 0),
    tipDeltaFromRest: Number(metrics.tipDeltaFromRest ?? 0),
    socketQuaternionDeltaFromRestDeg: Number(metrics.socketQuaternionDeltaFromRestDeg ?? 0),
  };
  const reasons = [];
  if (values.hiltToHandDistance > limits.maxHiltToHand) reasons.push('hilt-far-from-hand');
  if (values.bladeAxisChangeFromRestDeg < limits.minBladeAxisChangeFromRestDeg) reasons.push('blade-rest-space');
  if (values.socketToHandQuaternionErrorDeg > limits.maxSocketToHandQuaternionErrorDeg) reasons.push('socket-not-hand-frame');
  if (values.socketPositionDeltaFromRest < limits.minSocketPositionDeltaFromRest) reasons.push('socket-position-rest-space');
  if (values.tipDeltaFromRest < limits.minTipDeltaFromRest) reasons.push('tip-rest-space');
  if (values.socketQuaternionDeltaFromRestDeg < limits.minSocketQuaternionDeltaFromRestDeg) reasons.push('socket-quaternion-rest-space');
  return {
    status: reasons.length ? 'fail' : 'pass',
    transformClass: reasons.length ? 'sword-rest-space' : 'sword-follows-fk',
    reasons,
    thresholds: limits,
    metrics: {
      hiltToHandDistance: roundFkMetric(values.hiltToHandDistance),
      bladeAxisChangeFromRestDeg: roundFkMetric(values.bladeAxisChangeFromRestDeg, 2),
      socketToHandQuaternionErrorDeg: roundFkMetric(values.socketToHandQuaternionErrorDeg, 3),
      socketPositionDeltaFromRest: roundFkMetric(values.socketPositionDeltaFromRest),
      tipDeltaFromRest: roundFkMetric(values.tipDeltaFromRest),
      socketQuaternionDeltaFromRestDeg: roundFkMetric(values.socketQuaternionDeltaFromRestDeg, 3),
    },
  };
}
