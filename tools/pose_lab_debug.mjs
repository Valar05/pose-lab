#!/usr/bin/env node
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { argv, exit } from 'node:process';
import { pathToFileURL } from 'node:url';

function jsonResponse(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload, null, 2) + '\n';
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    ...headers,
  });
  res.end(body);
}

function textResponse(res, statusCode, text, headers = {}) {
  res.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    ...headers,
  });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function commandEnvelope(command, clientId, extra = {}) {
  return {
    id: randomUUID(),
    command,
    clientId,
    createdAt: Date.now(),
    ...extra,
  };
}

export function createPoseLabDebugBridgeServer({ host = '127.0.0.1', port = 0 } = {}) {
  const state = {
    host,
    port,
    serverUrl: '',
    clients: new Map(),
    queues: new Map(),
    waiters: new Map(),
    commands: new Map(),
    commandResults: new Map(),
    globalQueue: [],
    defaultClientId: '',
  };

  function queueForClient(clientId) {
    if (!state.queues.has(clientId)) state.queues.set(clientId, []);
    return state.queues.get(clientId);
  }

  function waitersForClient(clientId) {
    if (!state.waiters.has(clientId)) state.waiters.set(clientId, []);
    return state.waiters.get(clientId);
  }

  function resolveWaiter(clientId, payload) {
    const waiters = waitersForClient(clientId);
    const waiter = waiters.shift();
    if (!waiter) return false;
    clearTimeout(waiter.timer);
    waiter.resolve(payload);
    return true;
  }

  function enqueueCommand(command, targetClientId = state.defaultClientId || '') {
    const commandId = randomUUID();
    const entry = commandEnvelope(command, targetClientId, { id: commandId });
    state.commands.set(commandId, entry);
    state.commandResults.set(commandId, new Promise((resolve) => {
      entry.resolveResult = resolve;
    }));

    const clientId = targetClientId || state.defaultClientId || '';
    if (!clientId) {
      state.globalQueue.push(entry);
      return entry;
    }
    queueForClient(clientId).push(entry);
    resolveWaiter(clientId, entry);
    return entry;
  }

  function removeQueuedCommand(commandId) {
    state.globalQueue = state.globalQueue.filter((entry) => entry.id !== commandId);
    for (const queue of state.queues.values()) {
      const index = queue.findIndex((entry) => entry.id === commandId);
      if (index >= 0) queue.splice(index, 1);
    }
  }

  function deliverGlobalQueue(clientId) {
    if (!state.globalQueue.length) return;
    const queue = queueForClient(clientId);
    while (state.globalQueue.length) queue.push(state.globalQueue.shift());
    resolveWaiter(clientId, queue[0]);
  }

  async function waitForResult(commandId, timeoutMs = 60000) {
    const entry = state.commands.get(commandId);
    if (!entry) throw new Error('unknown command id: ' + commandId);
    let timeoutHandle = null;
    const timeout = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('debug command timed out after ' + timeoutMs + 'ms')), timeoutMs);
    });
    try {
      return await Promise.race([
        state.commandResults.get(commandId),
        timeout,
      ]);
    } finally {
      clearTimeout(timeoutHandle);
      removeQueuedCommand(commandId);
      state.commandResults.delete(commandId);
      state.commands.delete(commandId);
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || host}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      });
      res.end();
      return;
    }

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        jsonResponse(res, 200, {
          ok: true,
          clients: state.clients.size,
          clientDetails: [...state.clients.entries()].map(([clientId, client]) => ({ clientId, ...client })),
          queued: [...state.queues.values()].reduce((sum, queue) => sum + queue.length, 0) + state.globalQueue.length,
          defaultClientId: state.defaultClientId,
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/register') {
        const body = await readJsonBody(req);
        const clientId = randomUUID();
        state.clients.set(clientId, { ...body, clientId, connectedAt: Date.now(), lastSeenAt: Date.now() });
        state.defaultClientId = clientId;
        deliverGlobalQueue(clientId);
        jsonResponse(res, 200, { ok: true, clientId, queued: queueForClient(clientId).length });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/next') {
        const clientId = String(url.searchParams.get('clientId') || state.defaultClientId || '').trim();
        if (!clientId) {
          jsonResponse(res, 404, { ok: false, error: 'no registered client' });
          return;
        }
        const queue = queueForClient(clientId);
        if (queue.length) {
          jsonResponse(res, 200, queue.shift());
          return;
        }
        const payload = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), 25000);
          waitersForClient(clientId).push({
            resolve: (value) => resolve(value),
            timer,
          });
        });
        if (!payload) {
          jsonResponse(res, 200, { ok: true, idle: true });
          return;
        }
        jsonResponse(res, 200, payload);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/command') {
        const body = await readJsonBody(req);
        const command = typeof body.command === 'string' || (body.command && typeof body.command === 'object')
          ? body.command
          : String(body.text || body.name || '').trim();
        const clientId = String(body.clientId || state.defaultClientId || '').trim();
        if (!command) {
          jsonResponse(res, 400, { ok: false, error: 'command required' });
          return;
        }
        const entry = enqueueCommand(command, clientId);
        const result = await waitForResult(entry.id, Number(body.timeoutMs || 60000));
        const target = state.clients.get(clientId) || null;
        const wrappedResult = result && typeof result === 'object' && !Array.isArray(result)
          ? { ...result, debugBridgeTarget: { clientId, client: target } }
          : { ok: true, result, debugBridgeTarget: { clientId, client: target } };
        jsonResponse(res, 200, wrappedResult);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/result') {
        const body = await readJsonBody(req);
        const commandId = String(body.commandId || '').trim();
        const clientId = String(body.clientId || '').trim();
        const client = clientId ? state.clients.get(clientId) : null;
        if (client) client.lastSeenAt = Date.now();
        const entry = state.commands.get(commandId);
        if (!entry) {
          jsonResponse(res, 404, { ok: false, error: 'unknown command id: ' + commandId });
          return;
        }
        entry.resolveResult(body.result ?? body);
        jsonResponse(res, 200, { ok: true, commandId });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/status') {
        jsonResponse(res, 200, {
          ok: true,
          clients: [...state.clients.keys()],
          clientDetails: [...state.clients.entries()].map(([clientId, client]) => ({ clientId, ...client })),
          activeClientId: state.defaultClientId,
          queued: [...state.queues.entries()].map(([clientId, queue]) => ({ clientId, queued: queue.length })),
          globalQueued: state.globalQueue.length,
          pendingCommands: state.commands.size,
          serverUrl: state.serverUrl,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/command-help') {
        textResponse(res, 200, [
          'Pose Lab debug bridge',
          'POST /register',
          'GET /next?clientId=...',
          'POST /command',
          'POST /result',
          'GET /status',
        ].join('\n'));
        return;
      }

      jsonResponse(res, 404, { ok: false, error: 'not found' });
    } catch (error) {
      jsonResponse(res, 500, { ok: false, error: error?.message || String(error) });
    }
  });

  async function listen() {
    await new Promise((resolve) => server.listen(port, host, resolve));
    const address = server.address();
    state.port = address.port;
    state.serverUrl = `http://${host}:${address.port}`;
    return state.serverUrl;
  }

  function close() {
    return new Promise((resolve) => server.close(resolve));
  }

  return {
    server,
    state,
    listen,
    close,
    enqueueCommand,
    waitForResult,
  };
}

export async function sendPoseLabDebugCommand(bridgeUrl, command, { clientId = '', timeoutMs = 60000 } = {}) {
  const response = await fetch(new URL('/command', bridgeUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, command, timeoutMs }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`bridge command failed (${response.status}): ${text.trim()}`);
  return JSON.parse(text);
}

function parseArgs(args) {
  const out = { serve: false, bridge: '', port: 0, host: '127.0.0.1', pretty: true, pageUrl: '' };
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === 'serve') { out.serve = true; continue; }
    if (arg === '--bridge') { out.bridge = String(args[++i] || ''); continue; }
    if (arg === '--port') { out.port = Number(args[++i] || 0); continue; }
    if (arg === '--host') { out.host = String(args[++i] || '127.0.0.1'); continue; }
    if (arg === '--page-url') { out.pageUrl = String(args[++i] || ''); continue; }
    if (arg === '--json') { out.pretty = false; continue; }
    rest.push(arg);
  }
  out.rest = rest;
  out.command = rest[0] || 'status';
  out.commandArgs = rest.slice(1);
  return out;
}

function buildPageUrl(pageUrl, bridgeUrl) {
  if (!pageUrl) return '';
  const url = new URL(pageUrl);
  url.searchParams.set('debugBridge', '1');
  url.searchParams.set('debugBridgeUrl', bridgeUrl);
  return url.toString();
}

async function main() {
  const args = parseArgs(argv.slice(2));
  if (args.serve) {
    const bridge = createPoseLabDebugBridgeServer({ host: args.host, port: args.port });
    const bridgeUrl = await bridge.listen();
    const summary = {
      ok: true,
      bridgeUrl,
      pageUrl: buildPageUrl(args.pageUrl, bridgeUrl),
      commandHint: `${argv[1]} --bridge ${bridgeUrl} status`,
    };
    console.log(JSON.stringify(summary, null, 2));
    process.on('SIGINT', async () => { await bridge.close(); exit(130); });
    process.on('SIGTERM', async () => { await bridge.close(); exit(143); });
    return;
  }

  if (!args.bridge) {
    throw new Error('missing --bridge URL. Use `serve` first or pass a running bridge URL.');
  }

  const command = args.commandArgs.length ? [args.command, ...args.commandArgs].join(' ') : args.command;
  const result = await sendPoseLabDebugCommand(args.bridge, command);
  console.log(JSON.stringify(result, null, args.pretty ? 2 : 0));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || String(error));
    exit(1);
  });
}
