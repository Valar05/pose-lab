#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendPoseLabDebugCommand } from './pose_lab_debug.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    bridge: '',
    out: path.join(projectRoot, 'generated', 'weapon_visual_follow'),
    command: 'weapon visual-follow',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--bridge') args.bridge = String(argv[++i] || '');
    else if (arg.startsWith('--bridge=')) args.bridge = arg.slice('--bridge='.length);
    else if (arg === '--out') args.out = path.resolve(projectRoot, argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--command') args.command = String(argv[++i] || args.command);
    else if (arg.startsWith('--command=')) args.command = arg.slice('--command='.length);
  }
  return args;
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error('expected base64 image data URL');
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.bridge) throw new Error('missing --bridge URL');
  fs.mkdirSync(args.out, { recursive: true });
  const result = await sendPoseLabDebugCommand(args.bridge, args.command, { timeoutMs: 90000 });
  const image = result?.image || result?.live?.image || {};
  const decoded = decodeDataUrl(image.dataUrl);
  const pngPath = path.join(args.out, 'weapon_visual_follow.png');
  const jsonPath = path.join(args.out, 'weapon_visual_follow.json');
  fs.writeFileSync(pngPath, decoded.buffer);
  const stored = {
    ...result,
    image: {
      mime: image.mime || decoded.mime,
      width: image.width || 0,
      height: image.height || 0,
      path: path.relative(projectRoot, pngPath),
      byteLength: decoded.buffer.length,
    },
  };
  fs.writeFileSync(jsonPath, JSON.stringify(stored, null, 2) + '\n');
  console.log(JSON.stringify({
    ok: Boolean(result?.ok),
    schema: result?.schema || '',
    cacheToken: result?.cacheToken || '',
    actor: result?.actor || result?.live?.actor || '',
    clip: result?.clip || result?.live?.clip || '',
    liveHilt: result?.live ? {
      ok: Boolean(result?.ok),
      pageUrl: result.live.pageUrl || '',
      cacheToken: result.live.cacheToken || '',
      debugBridge: result.live.debugBridge || null,
      targetPolicy: result.live.targetPolicy || null,
      distances: result.live.distances || null,
      checks: result.live.checks || null,
    } : null,
    json: path.relative(projectRoot, jsonPath),
    png: path.relative(projectRoot, pngPath),
    image: stored.image,
    screenMotion: result?.screenMotion || null,
    relativeDrift: result?.relativeDrift || null,
    checks: result?.checks || null,
  }, null, 2));
  if (!result?.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
