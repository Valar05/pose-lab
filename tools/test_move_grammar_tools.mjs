import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-move-grammar-tools-'));
const failures = [];

function runJson(cmd, args) {
  const output = execFileSync(cmd, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const jsonStart = output.lastIndexOf('\n{');
  const candidate = jsonStart >= 0 ? output.slice(jsonStart + 1) : output;
  return JSON.parse(candidate);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}


function resolveMaybeAbsolute(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
}

const frontGrammar = runJson('python3', ['tools/classify_attack_grammar.py', '--poseclip', 'assets/pose_indexes/ares_frontkick_sf2.poseclip.json']);
assert(frontGrammar.family === 'ballistic_front_kick', `FrontKick grammar mismatch: ${frontGrammar.family}`);
const axeGrammar = runJson('python3', ['tools/classify_attack_grammar.py', '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json']);
assert(axeGrammar.family === 'heavy_kick', `AxeKick grammar mismatch: ${axeGrammar.family}`);

const frontBallistic = runJson('python3', ['tools/score_ballistic_path.py', '--poseclip', 'assets/pose_indexes/ares_frontkick_sf2.poseclip.json']);
assert(frontBallistic.schema === 'pose-lab-ballistic-path-score-v1', 'ballistic score schema mismatch');
assert(frontBallistic.metrics.contactHoldFrames <= 2, `FrontKick contact hold too long: ${frontBallistic.metrics.contactHoldFrames}`);
assert(frontBallistic.metrics.retractVisibleDelta >= 0.9, `FrontKick retractVisibleDelta too small: ${frontBallistic.metrics.retractVisibleDelta}`);

const lowBackChamber = runJson('python3', ['tools/score_chamber_density.py', '--poseclip', 'assets/pose_indexes/ares_lowbackkick_sf2.poseclip.json']);
assert(lowBackChamber.schema === 'pose-lab-chamber-density-score-v1', 'chamber density schema mismatch');
assert(lowBackChamber.metrics.chamberHoldFrames >= 3, `LowBackKick chamber hold too short: ${lowBackChamber.metrics.chamberHoldFrames}`);

const sourceWindows = runJson('python3', ['tools/derive_source_windows.py', '--poseclip', 'assets/pose_indexes/ares_frontkick_sf2.poseclip.json']);
assert(sourceWindows.schema === 'pose-lab-source-windows-v1', 'source windows schema mismatch');
assert(sourceWindows.windows.contact.center === 0.36667, `FrontKick contact window mismatch: ${sourceWindows.windows.contact.center}`);
assert(sourceWindows.windows.recoilSettle.center === 0.56667, `FrontKick recoilSettle window mismatch: ${sourceWindows.windows.recoilSettle.center}`);

const sheetOut = path.join(tmpRoot, 'family-sheet');
const familySheet = runJson('python3', ['tools/render_move_family_sheet.py', '--family', 'kicks', '--out', sheetOut, '--view', 'xz']);
assert(familySheet.schema === 'pose-lab-move-family-sheet-v1', 'family sheet schema mismatch');
assert(familySheet.rows === 5, `expected 5 kick rows, got ${familySheet.rows}`);
assert(fs.existsSync(resolveMaybeAbsolute(familySheet.sheet)), 'family sheet png missing');

const packetOut = path.join(tmpRoot, 'before-after');
const beforeAfter = runJson('python3', ['tools/build_before_after_packet.py', '--poseclip', 'assets/pose_indexes/ares_frontkick_sf2.poseclip.json', '--out', packetOut, '--view', 'xz']);
assert(beforeAfter.schema === 'pose-lab-before-after-packet-v1', 'before-after packet schema mismatch');
assert(fs.existsSync(resolveMaybeAbsolute(beforeAfter.packet)), 'before-after markdown missing');

const notesPath = path.join(tmpRoot, 'move_grammar_notes.json');
runJson('python3', ['tools/track_move_grammar_notes.py', '--path', notesPath, '--attack', 'TestKick', '--note', 'keep recoil fast']);
const notes = runJson('python3', ['tools/track_move_grammar_notes.py', '--path', notesPath, '--list']);
assert(notes.schema === 'pose-lab-move-grammar-notes-v1', 'move grammar notes schema mismatch');
assert(notes.notes.TestKick.includes('keep recoil fast'), 'move grammar note not persisted');

const identity = runJson('node', ['tools/test_attack_identity_rules.mjs']);
assert(identity.checked === 13, `identity rules should inspect 13 attacks, got ${identity.checked}`);

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_move_grammar_tools');
console.log(JSON.stringify({ tmpRoot, checked: ['grammar', 'ballistic', 'chamber', 'windows', 'familySheet', 'beforeAfter', 'notes', 'identity'] }, null, 2));
