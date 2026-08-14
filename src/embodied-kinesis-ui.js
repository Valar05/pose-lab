import {
  PHASE_ORDER,
  PENELOPE_LENSES,
  drewEyeFirewall,
  makeCandidate,
  penelopeQuorum,
  runRegnet,
  smallestRankedCorrection,
} from './embodied-kinesis-core.js';

const $ = (id) => document.getElementById(id);
const viewer = $('ekViewer');
const video = $('ekReferenceVideo');
const fileInput = $('ekReferenceFile');
const sheet = $('ekSheet');
const sheetCtx = sheet.getContext('2d');
const phaseButtons = $('ekPhaseButtons');
const captures = new Map();
const phaseMarks = new Map();
const authoredKeys = new Map();
let sourceHash = '';
let modelHash = '';
let currentPhase = 'entry';
let sheetBuilt = false;
let correctionSerial = 0;

const candidate = makeCandidate({
  candidateId: `kinesis-${Date.now()}`,
  action: {name: $('ekActionName').value, intent: $('ekActionIntent').value, family: 'first-person', requiresWeapon: false},
  model: {name: 'FPSPlayer', path: 'assets/models/FPSPlayer.glb', sha256: '', rigVersion: $('ekRigVersion').value, actorId: 'player'},
  target: {cameraMode: 'firstPerson', cameraIdentity: 'FPSPlayer.Camera', runtimeSurface: 'pose-lab'},
  deterministic: true,
  rootPolicy: 'camera-relative-upper-body',
});

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(buffer) {
  return hex(await crypto.subtle.digest('SHA-256', buffer));
}

function viewerDoc() {
  try { return viewer.contentDocument; } catch { return null; }
}

function viewerWindow() {
  try { return viewer.contentWindow; } catch { return null; }
}

function targetTime() {
  const doc = viewerDoc();
  const scrub = doc?.getElementById('cleanupScrub');
  const raw = scrub?.value;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const readout = doc?.getElementById('cleanupTime')?.textContent || '';
  const match = readout.match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : NaN;
}

function selectedBone() {
  const doc = viewerDoc();
  const bone = doc?.getElementById('boneSelect')?.value;
  return String(bone || '').trim();
}

function selectedClip() {
  const doc = viewerDoc();
  return String(doc?.getElementById('cleanupClipName')?.textContent || '').trim();
}

function setState(text, state = 'red') {
  $('ekState').textContent = text;
  $('ekState').dataset.state = state;
}

function syncCandidate() {
  candidate.action.name = $('ekActionName').value.trim();
  candidate.action.intent = $('ekActionIntent').value.trim();
  candidate.source.sha256 = sourceHash;
  candidate.model.name = $('ekModelName').value.trim();
  candidate.model.sha256 = modelHash;
  candidate.model.rigVersion = $('ekRigVersion').value.trim();
  candidate.phases = PHASE_ORDER.map((phase) => phaseMarks.get(phase)).filter(Boolean);
  candidate.authoredKeys = PHASE_ORDER.map((phase) => authoredKeys.get(phase)).filter(Boolean);
  candidate.contacts = phaseMarks.has('contact') ? [{
    phase: 'contact',
    subject: authoredKeys.get('contact')?.bones?.[0] || 'HitboxHandR',
    anchor: $('ekContactAnchor').value.trim(),
  }] : [];
  candidate.evidence.keySheet = sheetBuilt ? {kind: 'canvas', id: 'ekSheet', phases: [...captures.keys()]} : null;
  candidate.evidence.runtimePreview = captures.size ? {kind: 'target-camera-captures', count: captures.size, clip: selectedClip()} : null;
  candidate.evidence.comparisonReceipt = sheetBuilt ? {kind: 'in-browser-comparison', sourceSha256: sourceHash, modelSha256: modelHash} : null;
}

function renderPhaseLog() {
  const rows = PHASE_ORDER.map((phase) => {
    const p = phaseMarks.get(phase);
    const key = authoredKeys.get(phase);
    if (!p) return `${phase.padEnd(14)} — unmarked`;
    return `${phase.padEnd(14)} ref ${p.referenceTime.toFixed(3)}s → target ${p.targetTime.toFixed(3)}s | key ${key ? key.keyId : 'MISSING'}${p.occluded ? ' | OCCLUDED' : ''}`;
  });
  $('ekPhaseLog').textContent = rows.join('\n');
}

function buildPhaseButtons() {
  phaseButtons.innerHTML = '';
  for (const phase of PHASE_ORDER) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = phase.replace('force-transfer', 'transfer');
    button.dataset.phase = phase;
    button.dataset.marked = 'false';
    button.addEventListener('click', () => markPhase(phase));
    phaseButtons.append(button);
  }
}

function markPhase(phase) {
  const ref = Number(video.currentTime);
  const target = targetTime();
  if (!sourceHash || !Number.isFinite(ref)) {
    $('ekPhaseLog').textContent = 'Load a real reference video before marking a phase.';
    return;
  }
  if (!Number.isFinite(target)) {
    $('ekPhaseLog').textContent = 'Pose Lab target time is unavailable; phase was not manufactured.';
    return;
  }
  currentPhase = phase;
  const occluded = $('ekOcclusion').value === 'occluded';
  phaseMarks.set(phase, {
    phase,
    referenceTime: ref,
    targetTime: target,
    confidence: Number($('ekConfidence').value),
    occluded,
    actionableAs: $('ekActionable').value.trim(),
  });
  for (const button of phaseButtons.querySelectorAll('button')) button.dataset.marked = String(button.dataset.phase === phase || phaseMarks.has(button.dataset.phase));
  syncCandidate();
  renderPhaseLog();
}

function createPoseKey() {
  if (!phaseMarks.has(currentPhase)) {
    $('ekPhaseLog').textContent = `Mark ${currentPhase} before creating its 3D key.`;
    return;
  }
  const doc = viewerDoc();
  const keyButton = doc?.getElementById('critiqueNewKey');
  if (!keyButton) {
    $('ekPhaseLog').textContent = 'Pose Lab New Key control is not callable; fail closed.';
    return;
  }
  keyButton.click();
  const bone = selectedBone();
  if (!bone) {
    $('ekPhaseLog').textContent = 'Pose Lab created a key request, but no rig control/bone is selected. Key remains unproved.';
    return;
  }
  const mark = phaseMarks.get(currentPhase);
  authoredKeys.set(currentPhase, {
    keyId: `${candidate.candidateId}-${currentPhase}`,
    phase: currentPhase,
    targetTime: mark.targetTime,
    bones: [bone],
    authoritative: true,
    interpolation: 'LINEAR',
    holdFrames: currentPhase === 'contact' ? 2 : 1,
    poseLabKeyTriggered: true,
  });
  syncCandidate();
  renderPhaseLog();
}

function imageFromVideo() {
  const canvas = document.createElement('canvas');
  const width = Math.max(1, video.videoWidth || 640);
  const height = Math.max(1, video.videoHeight || 360);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);
  return canvas;
}

function imageFromTarget() {
  const source = viewerDoc()?.getElementById('labCanvas');
  if (!source || !source.width || !source.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function capturePhase() {
  if (!phaseMarks.has(currentPhase)) {
    $('ekPhaseLog').textContent = `Mark ${currentPhase} before capturing evidence.`;
    return;
  }
  const targetCanvas = imageFromTarget();
  if (!targetCanvas) {
    $('ekPhaseLog').textContent = 'Target WebGL canvas is unavailable; no fake capture was recorded.';
    return;
  }
  captures.set(currentPhase, {
    phase: currentPhase,
    reference: imageFromVideo().toDataURL('image/jpeg', 0.72),
    target: targetCanvas.toDataURL('image/jpeg', 0.72),
    referenceTime: phaseMarks.get(currentPhase).referenceTime,
    targetTime: phaseMarks.get(currentPhase).targetTime,
  });
  sheetBuilt = false;
  syncCandidate();
  renderPhaseLog();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function buildSheet() {
  const rows = PHASE_ORDER.map((p) => captures.get(p)).filter(Boolean);
  if (!rows.length) {
    $('ekFirewallLog').textContent = 'No captured reference/target phase pairs exist.';
    return;
  }
  const cellW = 300;
  const cellH = 170;
  const labelW = 120;
  sheet.width = labelW + cellW * 2;
  sheet.height = rows.length * cellH;
  sheetCtx.fillStyle = '#080d11';
  sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
  sheetCtx.font = '12px system-ui';
  sheetCtx.textBaseline = 'top';
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const y = i * cellH;
    const [ref, target] = await Promise.all([loadImage(row.reference), loadImage(row.target)]);
    sheetCtx.fillStyle = '#edf3f6';
    sheetCtx.fillText(row.phase, 8, y + 8);
    sheetCtx.fillStyle = '#9eb0bb';
    sheetCtx.fillText(`ref ${row.referenceTime.toFixed(3)}s`, 8, y + 30);
    sheetCtx.fillText(`3D ${row.targetTime.toFixed(3)}s`, 8, y + 48);
    fitDraw(sheetCtx, ref, labelW, y, cellW, cellH);
    fitDraw(sheetCtx, target, labelW + cellW, y, cellW, cellH);
    sheetCtx.strokeStyle = '#2d3b45';
    sheetCtx.strokeRect(labelW, y, cellW, cellH);
    sheetCtx.strokeRect(labelW + cellW, y, cellW, cellH);
  }
  sheetBuilt = true;
  syncCandidate();
  $('ekFirewallLog').textContent = `Built ${rows.length}-phase reference → first-person 3D comparison sheet.`;
}

function fitDraw(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function renderRegnet() {
  syncCandidate();
  candidate.reviews.regnet = runRegnet(candidate);
  const review = candidate.reviews.regnet;
  $('ekRegnet').textContent = `${review.verdict}\n${review.defects.map((d) => `[${d.severity}] ${d.code}: ${d.message}`).join('\n') || 'No structural defects detected.'}`;
  const correction = smallestRankedCorrection(candidate);
  if (correction) $('ekFirewallLog').textContent = `Smallest ranked correction: ${correction.code} — ${correction.message}`;
}

function buildPenelope() {
  const root = $('ekPenelope');
  root.innerHTML = '';
  PENELOPE_LENSES.forEach((lens, index) => {
    const row = document.createElement('div');
    row.className = 'ek-review';
    row.dataset.lens = lens;
    row.innerHTML = `<div class="ek-row"><strong>${lens}</strong>${lens === 'negative-human-animator' ? '<span class="ek-pill bad">negative taster</span>' : ''}</div>
      <div class="ek-grid">
        <label>Verdict<select data-field="verdict"><option value="REVISE">REVISE</option><option value="PASS">PASS</option></select></label>
        <label>Severity<select data-field="severity"><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select></label>
        <label>Highest-value visible defect<input data-field="defect" placeholder="name the visible wound"></label>
        <label>Evidence frame/time<input data-field="evidence" placeholder="frame / timestamp"></label>
      </div>`;
    row.addEventListener('change', collectPenelope);
    row.addEventListener('input', collectPenelope);
    row.dataset.reviewer = `penelope-${String(index + 1).padStart(2, '0')}`;
    root.append(row);
  });
}

function collectPenelope() {
  candidate.reviews.penelope = [...$('ekPenelope').querySelectorAll('.ek-review')].map((row) => ({
    reviewerId: row.dataset.reviewer,
    lens: row.dataset.lens,
    verdict: row.querySelector('[data-field="verdict"]').value,
    severity: row.querySelector('[data-field="severity"]').value,
    defect: row.querySelector('[data-field="defect"]').value.trim(),
    evidence: row.querySelector('[data-field="evidence"]').value.trim(),
    negativeTaster: row.dataset.lens === 'negative-human-animator',
  }));
}

function recordVenice() {
  collectPenelope();
  const quorum = penelopeQuorum(candidate.reviews.penelope);
  if (candidate.reviews.regnet?.verdict !== 'PASS' || !quorum.pass) {
    candidate.reviews.venice = {verdict: 'REVISE_REQUIRED', evidence: $('ekVeniceEvidence').value.trim(), blockedByPriorGauntlet: true};
    $('ekFirewallLog').textContent = 'Venice refused coronation: Regnet/Penelope are not clean.';
    return;
  }
  candidate.reviews.venice = {verdict: $('ekVeniceVerdict').value, evidence: $('ekVeniceEvidence').value.trim(), reviewedAt: new Date().toISOString()};
  $('ekFirewallLog').textContent = `Venice recorded ${candidate.reviews.venice.verdict}.`;
}

function recordCorrection() {
  const evidence = $('ekCorrectionEvidence').value.trim();
  const change = $('ekCorrectionChange').value.trim();
  if (!evidence || !change) {
    $('ekFirewallLog').textContent = 'Correction requires both the visible evidence and the exact change; no generic improvement receipt.';
    return;
  }
  candidate.corrections.push({correctionId: `correction-${++correctionSerial}`, evidence, change, recordedAt: new Date().toISOString()});
  candidate.reviews.regnet = null;
  candidate.reviews.venice = null;
  candidate.reviews.penelope = [];
  $('ekFirewallLog').textContent = 'Correction recorded. Gauntlet reset: rerun Regnet, all Penelope tasters, then Venice.';
}

function runFirewall() {
  collectPenelope();
  syncCandidate();
  const result = drewEyeFirewall(candidate);
  setState(result.verdict, result.presentable ? 'green' : 'red');
  $('ekFirewallLog').textContent = result.presentable
    ? 'PRESENTABLE_TO_DREW — internal gauntlet passed. Drew still owns acceptance.'
    : `INTERNAL ONLY\n${result.reasons.map((r) => `- ${r}`).join('\n')}`;
}

function exportReceipt() {
  syncCandidate();
  if (!candidate.reviews.regnet || !candidate.reviews.venice) {
    $('ekFirewallLog').textContent = 'Disposition is incomplete; working state stays in the Lab and is not emitted as a candidate receipt.';
    return;
  }
  const payload = JSON.stringify(candidate, null, 2);
  const blob = new Blob([payload], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${candidate.candidateId}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function loadReference(file) {
  if (!file) return;
  sourceHash = await sha256(await file.arrayBuffer());
  candidate.source = {
    name: file.name,
    sha256: sourceHash,
    kind: 'video',
    durationSeconds: null,
    identityAuthority: 'reference-performance',
  };
  video.src = URL.createObjectURL(file);
  video.onloadedmetadata = () => {
    candidate.source.durationSeconds = video.duration;
    $('ekSourceIdentity').textContent = `${file.name} • ${sourceHash.slice(0, 12)}`;
    $('ekSourceIdentity').className = 'ek-pill good';
    syncCandidate();
  };
}

async function bindViewer() {
  const doc = viewerDoc();
  if (!doc) return;
  const fpv = doc.querySelector('[data-view-mode="firstPerson"]');
  if (fpv) fpv.click();
  const actor = doc.querySelector('[data-actor="player"]');
  if (actor) actor.click();
  const status = viewerWindow()?.poseLabDebug?.exec ? 'Pose Lab debug callable' : 'Pose Lab DOM linked';
  $('ekViewerIdentity').textContent = status;
  try {
    const response = await fetch('assets/models/FPSPlayer.glb', {cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    modelHash = await sha256(await response.arrayBuffer());
    $('ekViewerIdentity').textContent = `FPSPlayer • ${modelHash.slice(0, 12)} • FPV`;
  } catch (error) {
    $('ekViewerIdentity').textContent = `FPSPlayer hash unavailable: ${error.message}`;
  }
  syncCandidate();
}

buildPhaseButtons();
buildPenelope();
renderPhaseLog();
fileInput.addEventListener('change', () => loadReference(fileInput.files?.[0]));
$('ekNewPoseKey').addEventListener('click', createPoseKey);
$('ekCapturePhase').addEventListener('click', capturePhase);
$('ekBuildSheet').addEventListener('click', buildSheet);
$('ekRunRegnet').addEventListener('click', renderRegnet);
$('ekRecordVenice').addEventListener('click', recordVenice);
$('ekRecordCorrection').addEventListener('click', recordCorrection);
$('ekFirewall').addEventListener('click', runFirewall);
$('ekExportReceipt').addEventListener('click', exportReceipt);
viewer.addEventListener('load', bindViewer);
for (const id of ['ekActionName', 'ekActionIntent', 'ekModelName', 'ekRigVersion', 'ekContactAnchor']) $(id).addEventListener('input', syncCandidate);
