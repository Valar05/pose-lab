import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(os.tmpdir(), `poseclip-stickframe-${process.pid}`);
const failures = [];

execFileSync('python3', [
  path.join(projectRoot, 'tools', 'render_poseclip_stickframes.py'),
  '--poseclip',
  'assets/pose_indexes/ares_axekick_sf2.poseclip.json',
  '--out',
  outDir,
  '--frames',
  'read',
  '--no-video',
], {
  cwd: projectRoot,
  stdio: 'pipe',
});

const manifestPath = path.join(outDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error(`missing render manifest ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets', 'pose_indexes', 'ares_axekick_sf2_visual_evidence.json'), 'utf8'));

if (manifest.schema !== 'pose-lab-stickframe-render-v1') failures.push(`unexpected schema ${manifest.schema}`);
if (manifest.poseclip !== 'assets/pose_indexes/ares_axekick_sf2.poseclip.json') failures.push(`unexpected poseclip link ${manifest.poseclip}`);
if (manifest.evidence !== 'assets/pose_indexes/ares_axekick_sf2_visual_evidence.json') failures.push(`unexpected evidence link ${manifest.evidence}`);
if (manifest.attackName !== 'AxeKick') failures.push(`unexpected attackName ${manifest.attackName}`);
if (manifest.framesMode !== 'read') failures.push(`unexpected framesMode ${manifest.framesMode}`);
if (manifest.critiqueGuide !== 'docs/SF2_ANIMATION_CRITIQUE_GUIDE.md') failures.push(`unexpected critiqueGuide ${manifest.critiqueGuide}`);
if (!manifest.critiquePacket) failures.push('missing critiquePacket link');
if ((manifest.frames || []).length !== evidence.captureSlots.length) failures.push(`expected ${evidence.captureSlots.length} rendered frames, got ${(manifest.frames || []).length}`);

if (manifest.critiquePacket) {
  const packetPath = path.isAbsolute(manifest.critiquePacket) ? manifest.critiquePacket : path.join(projectRoot, manifest.critiquePacket);
  if (!fs.existsSync(packetPath)) {
    failures.push(`missing critique packet ${manifest.critiquePacket}`);
  } else {
    const packetText = fs.readFileSync(packetPath, 'utf8');
    if (!packetText.includes('SF2_ANIMATION_CRITIQUE_GUIDE.md')) failures.push('critique packet does not reference SF2 guide');
    if (!packetText.includes('Readability, Anticipation, Commitment, Contact, Recovery')) failures.push('critique packet missing scoring rubric');
  }
}

const byTag = new Map((manifest.frames || []).map((frame) => [frame.tag, frame]));
for (const tag of ['anticipation', 'anticipationHold', 'apex', 'snap', 'contact', 'contactHold', 'recoverySettle', 'settle']) {
  const frame = byTag.get(tag);
  if (!frame) {
    failures.push(`missing rendered frame for ${tag}`);
    continue;
  }
  const absolutePng = path.isAbsolute(frame.png) ? frame.png : path.join(projectRoot, frame.png);
  if (!fs.existsSync(absolutePng)) failures.push(`${tag}: missing png ${frame.png}`);
  if (!frame.evidenceKey?.includes(`:${tag}`)) failures.push(`${tag}: evidence key does not include tag`);
  if (!(frame.durationToNext > 0)) failures.push(`${tag}: invalid durationToNext ${frame.durationToNext}`);
}

const snap = byTag.get('snap');
if (!snap?.overlayPhases?.some((phase) => phase.sourceClipName === 'Headbutt' && phase.tag === 'snapBrace')) {
  failures.push('snap frame missing Headbutt snapBrace overlay annotation');
}

const contact = byTag.get('contact');
if (!contact?.overlayPhases?.some((phase) => phase.sourceClipName === 'Headbutt' && phase.tag === 'contactCarry')) {
  failures.push('contact frame missing Headbutt contactCarry overlay annotation');
}
if (!contact?.contactModifiers?.some((modifier) => modifier.tag === 'crushingContact')) {
  failures.push('contact frame missing crushingContact modifier annotation');
}
if (contact?.headDiscipline?.length) {
  failures.push('contact frame should not include active head-discipline annotation while head discipline is disabled');
}

const contactHold = byTag.get('contactHold');
if (contactHold?.headDiscipline?.length) {
  failures.push('contactHold frame should not include active head-discipline annotation while head discipline is disabled');
}
if (Math.abs((contactHold?.durationToNext || 0) - 0.05) > 0.0001) {
  failures.push(`contactHold duration should preserve f28->f31 timing, got ${contactHold?.durationToNext}`);
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_poseclip_stickframe_render');
console.log(JSON.stringify({
  manifest: path.relative(projectRoot, manifestPath),
  frames: manifest.frames.length,
  checked: 'AxeKick stickframe render evidence slots',
}, null, 2));
