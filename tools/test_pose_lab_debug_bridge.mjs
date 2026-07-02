import { createPoseLabDebugBridgeServer, sendPoseLabDebugCommand } from './pose_lab_debug.mjs';

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

const bridge = createPoseLabDebugBridgeServer({ host: '127.0.0.1', port: 0 });
const bridgeUrl = await bridge.listen();

try {
  const registerResponse = await fetch(new URL('/register', bridgeUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'Pose Lab Debug Test', build: 'clean-sf2', cacheToken: 'pose-editor-test', labMode: 'critique', url: 'http://127.0.0.1:8797/pose-lab.html?debugBridge=1' }),
  });
  assert(registerResponse.ok, 'bridge should accept browser registration');
  const { clientId } = await registerResponse.json();
  assert(typeof clientId === 'string' && clientId.length > 8, 'bridge should return a client id');

  const nextPromise = fetch(new URL('/next?clientId=' + encodeURIComponent(clientId), bridgeUrl));
  const commandPromise = sendPoseLabDebugCommand(bridgeUrl, 'status', { clientId });

  const nextResponse = await nextPromise;
  assert(nextResponse.ok, 'bridge should deliver queued commands to the browser client');
  const payload = await nextResponse.json();
  assert(payload.command === 'status' || payload.command?.name === 'status', 'bridge should forward the requested command');
  assert(payload.clientId === clientId, 'bridge should target the registered client');

  const resultPayload = { ok: true, command: 'status', snapshot: { schema: 'pose-lab-debug-snapshot-v1', selectedActor: 'orc' } };
  const resultResponse = await fetch(new URL('/result', bridgeUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, commandId: payload.id, result: resultPayload }),
  });
  assert(resultResponse.ok, 'bridge should accept command results from the browser client');

  const commandResult = await commandPromise;
  assert(commandResult.ok === true, 'bridge command should resolve with the delivered result');
  assert(commandResult.snapshot?.selectedActor === 'orc', 'bridge command should return the browser result body');
  assert(commandResult.debugBridgeTarget?.clientId === clientId, 'bridge command should report the targeted client id');
  assert(commandResult.debugBridgeTarget?.client?.url?.includes('debugBridge=1'), 'bridge command should report the targeted browser URL');
  assert(commandResult.debugBridgeTarget?.client?.cacheToken === 'pose-editor-test', 'bridge command should report the targeted cache token');
} finally {
  await bridge.close();
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-debug-bridge'] }, null, 2));
