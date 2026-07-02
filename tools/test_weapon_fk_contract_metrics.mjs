import { classifyWeaponTransformMetrics } from '../src/weapon-fk-contract.mjs';

const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const knownBad = classifyWeaponTransformMetrics({
  hiltToHandDistance: 1.29193,
  bladeAxisChangeFromRestDeg: 0,
  socketToHandQuaternionErrorDeg: 83.385,
  socketPositionDeltaFromRest: 0,
  tipDeltaFromRest: 0,
  socketQuaternionDeltaFromRestDeg: 0,
});

assert(knownBad.status === 'fail', `known-bad rest-space metrics must fail, got ${knownBad.status}`);
assert(knownBad.transformClass === 'sword-rest-space', `known-bad metrics must classify as rest-space, got ${knownBad.transformClass}`);
for (const reason of [
  'hilt-far-from-hand',
  'blade-rest-space',
  'socket-not-hand-frame',
  'socket-position-rest-space',
  'tip-rest-space',
  'socket-quaternion-rest-space',
]) {
  assert(knownBad.reasons.includes(reason), `known-bad metrics missing reason: ${reason}`);
}

const sane = classifyWeaponTransformMetrics({
  hiltToHandDistance: 0.08,
  bladeAxisChangeFromRestDeg: 67,
  socketToHandQuaternionErrorDeg: 0.12,
  socketPositionDeltaFromRest: 0.24,
  tipDeltaFromRest: 0.51,
  socketQuaternionDeltaFromRestDeg: 22,
});

assert(sane.status === 'pass', `sane follow metrics should pass, got ${sane.status}: ${sane.reasons.join(', ')}`);
assert(sane.transformClass === 'sword-follows-fk', `sane metrics should classify as sword-follows-fk, got ${sane.transformClass}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['known-bad-ready-transform-metrics-fail', 'sane-transform-metrics-pass'],
  knownBad,
}, null, 2));
