import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const snippet of [
  'function debugBridgeConfig()',
  'function normalizeDebugCommand(input)',
  'function splitDebugCommand(input)',
  'this.installDebugConsole();',
  'window.poseLabDebug = api;',
  'window.__poseLabDebug = api;',
  'window.poseLab = this;',
  'async executeDebugCommand(input)',
  'async startDebugBridge()',
  "debugCommandNames() {",
  "debugSnapshot() {",
  "debugEmitBeacon(stage = 'manual')",
  "debugEmitCapture(stage = 'manual')",
  "this.debugBridgeState = { enabled: this.debugBridge.enabled",
  "this.debugBridgePromise = run().catch((error) => {",
  "case 'status':",
  "case 'actor':",
  "case 'clip':",
  "case 'bone':",
  "case 'view':",
  "case 'panel':",
  "case 'play':",
  "case 'pause':",
  "case 'stop':",
  "case 'seek':",
  "case 'frame':",
  "case 'beacon':",
  "case 'capture':",
  "case 'qa':",
  "subcommand === 'select'",
  "subcommand === 'state'",
  "subcommand === 'rotate'",
  "subcommand === 'reset'",
  "selectedBoneEdit:",
  "selectedBoneLocalQuaternion:",
  "selectedBoneRestQuaternion:",
  "selectedBoneWorldQuaternion:",
  "actor.applyBoneEdit(boneName, { rotX, rotY, rotZ, useTranslate: false, useRotate: true, useScale: false });",
  "actor.resetBoneEdit?.(boneName);",
]) {
  assert(source.includes(snippet), `missing debug CLI snippet: ${snippet}`);
}

for (const command of ['help', 'status', 'snapshot', 'inspect', 'state', 'readout', 'diagnostic', 'actor', 'clip', 'bone', 'view', 'panel', 'play', 'pause', 'stop', 'seek', 'frame', 'beacon', 'capture', 'qa']) {
  assert(source.includes(`'${command}'`), `missing command name in source: ${command}`);
}

assert(source.includes('debugBridgeUrl') && source.includes('debugBridgePollMs') && source.includes('debugBridgeTimeoutMs'), 'debug bridge config should read query-string bridge settings');
assert(source.includes('window.location.href'), 'debug bridge should register the live browser URL');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-debug-console-contract', 'bone-select-rotate-contract'] }, null, 2));
