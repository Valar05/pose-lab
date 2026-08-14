export const KINESIS_SCHEMA = 'embodied-kinesis.candidate.v1';
export const PHASE_ORDER = Object.freeze([
  'entry',
  'anticipation',
  'commitment',
  'contact',
  'force-transfer',
  'reaction',
  'recovery',
  'exit',
]);

export const REQUIRED_FIRST_PERSON_PHASES = Object.freeze([
  'entry', 'commitment', 'contact', 'recovery', 'exit',
]);

export const PENELOPE_LENSES = Object.freeze([
  'silhouette-readability',
  'weight-force-inertia',
  'timing-rhythm',
  'contact-grounding',
  'first-person-embodiment',
  'hands-grip-weapon',
  'pose-key-strength',
  'transition-quality',
  'uncanny-mocap-artifacts',
  'source-reference-fidelity',
  'gameplay-readability',
  'negative-human-animator',
]);

const HIGH = new Set(['high', 'critical']);
const CONNECTIVE = new Set(['LINEAR', 'STEP', 'BEZIER', 'CUBICSPLINE', 'SLERP']);

function finite(value) {
  return Number.isFinite(Number(value));
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function phaseRank(phase) {
  return PHASE_ORDER.indexOf(cleanText(phase));
}

export function makeCandidate(overrides = {}) {
  return {
    schema: KINESIS_SCHEMA,
    candidateId: '',
    action: {name: '', intent: '', family: 'first-person'},
    source: {
      name: '', sha256: '', kind: 'video', durationSeconds: null,
      identityAuthority: 'reference-performance',
    },
    model: {name: '', path: '', sha256: '', rigVersion: '', actorId: ''},
    target: {cameraMode: 'firstPerson', cameraIdentity: '', runtimeSurface: 'pose-lab'},
    phases: [],
    authoredKeys: [],
    contacts: [],
    interpolation: {default: 'LINEAR', protectedExactKeys: true},
    evidence: {keySheet: null, runtimePreview: null, comparisonReceipt: null},
    reviews: {regnet: null, penelope: [], venice: null},
    corrections: [],
    state: 'candidate',
    ...overrides,
  };
}

function add(defects, code, severity, message, phase = null, evidence = null) {
  defects.push({code, severity, message, phase, evidence});
}

export function validateCandidate(candidate, {requireVisualEvidence = false} = {}) {
  const c = candidate || {};
  const defects = [];

  if (c.schema !== KINESIS_SCHEMA) add(defects, 'schema', 'critical', `Expected ${KINESIS_SCHEMA}.`);
  if (!cleanText(c.candidateId)) add(defects, 'candidate-id', 'high', 'Candidate identity is missing.');
  if (!cleanText(c.action?.name)) add(defects, 'action-name', 'high', 'Action must have a named semantic action.');
  if (!cleanText(c.action?.intent)) add(defects, 'action-intent', 'high', 'Action intent is missing; unnamed interpolation is forbidden.');

  if (!cleanText(c.source?.name)) add(defects, 'source-identity', 'critical', 'Reference source identity is missing.');
  if (!/^[a-f0-9]{64}$/i.test(cleanText(c.source?.sha256))) add(defects, 'source-hash', 'high', 'Reference SHA-256 is missing or invalid.');
  if (!cleanText(c.model?.name) || !cleanText(c.model?.rigVersion)) add(defects, 'model-rig-identity', 'critical', 'Model and rig version must be explicit.');

  if (c.target?.cameraMode !== 'firstPerson') add(defects, 'target-camera', 'critical', 'First-person action must be judged through the first-person target camera.');
  if (!cleanText(c.target?.runtimeSurface)) add(defects, 'runtime-surface', 'high', 'Target runtime surface is missing.');

  const phases = Array.isArray(c.phases) ? c.phases : [];
  const byPhase = new Map();
  let lastRef = -Infinity;
  let lastTarget = -Infinity;
  let lastRank = -1;
  for (const p of phases) {
    const name = cleanText(p?.phase);
    const rank = phaseRank(name);
    if (rank < 0) {
      add(defects, 'unsupported-phase', 'critical', `Unsupported phase '${name || '(blank)'}'.`, name || null);
      continue;
    }
    if (byPhase.has(name)) add(defects, 'duplicate-phase', 'high', `Phase '${name}' is duplicated.`, name);
    byPhase.set(name, p);
    if (rank <= lastRank) add(defects, 'phase-order', 'critical', 'Semantic phases are not strictly ordered.', name);
    lastRank = Math.max(lastRank, rank);
    if (!finite(p.referenceTime)) add(defects, 'reference-time', 'high', `Phase '${name}' lacks a reference time.`, name);
    if (!finite(p.targetTime)) add(defects, 'target-time', 'high', `Phase '${name}' lacks a target time.`, name);
    if (finite(p.referenceTime) && Number(p.referenceTime) < lastRef) add(defects, 'reference-chronology', 'critical', 'Reference times run backward.', name);
    if (finite(p.targetTime) && Number(p.targetTime) < lastTarget) add(defects, 'target-chronology', 'critical', 'Target times run backward.', name);
    if (finite(p.referenceTime)) lastRef = Number(p.referenceTime);
    if (finite(p.targetTime)) lastTarget = Number(p.targetTime);
    if (!cleanText(p.actionableAs) && p.actionable !== false) add(defects, 'phase-actionability', 'medium', `Phase '${name}' has no editable key/constraint mapping.`, name);
    if (p.occluded === true && Number(p.confidence ?? 0) > 0.6) add(defects, 'occlusion-overclaim', 'high', `Occluded phase '${name}' claims excessive confidence.`, name);
  }
  for (const phase of REQUIRED_FIRST_PERSON_PHASES) {
    if (!byPhase.has(phase)) add(defects, 'missing-phase', 'critical', `Required phase '${phase}' is missing.`, phase);
  }

  const keys = Array.isArray(c.authoredKeys) ? c.authoredKeys : [];
  const keyByPhase = new Map();
  for (const key of keys) {
    const name = cleanText(key?.phase);
    if (!cleanText(key?.keyId)) add(defects, 'key-identity', 'high', 'Authored key is missing keyId.', name || null);
    if (!finite(key?.targetTime)) add(defects, 'key-time', 'high', `Authored key '${key?.keyId || '?'}' lacks target time.`, name || null);
    if (!Array.isArray(key?.bones) || !key.bones.length) add(defects, 'key-bones', 'critical', `Authored key '${key?.keyId || '?'}' has no explicit rig controls/bones.`, name || null);
    if (key?.authoritative !== true) add(defects, 'key-authority', 'critical', `Key '${key?.keyId || '?'}' is not marked authoritative.`, name || null);
    const interpolation = cleanText(key?.interpolation || c.interpolation?.default).toUpperCase();
    if (!CONNECTIVE.has(interpolation)) add(defects, 'interpolation-mode', 'high', `Unsupported interpolation '${interpolation}'.`, name || null);
    if (name) keyByPhase.set(name, key);
  }
  for (const phase of REQUIRED_FIRST_PERSON_PHASES) {
    if (!keyByPhase.has(phase)) add(defects, 'missing-authored-key', 'critical', `Required phase '${phase}' has no authoritative rig key.`, phase);
  }

  if (c.interpolation?.protectedExactKeys !== true) add(defects, 'key-protection', 'critical', 'Connective interpolation is allowed to overwrite exact authored keys.');

  const contacts = Array.isArray(c.contacts) ? c.contacts : [];
  const contact = contacts.find((x) => x?.phase === 'contact');
  if (!contact || !cleanText(contact.anchor) || !cleanText(contact.subject)) {
    add(defects, 'contact-truth', 'critical', 'Contact phase requires an explicit subject and anchor.', 'contact');
  }

  if (requireVisualEvidence) {
    if (!c.evidence?.runtimePreview) add(defects, 'runtime-preview', 'critical', 'Real target-camera runtime preview evidence is missing.');
    if (!c.evidence?.keySheet) add(defects, 'key-sheet', 'critical', 'Motion-Dungeon-style 3D key/comparison sheet is missing.');
    if (!c.evidence?.comparisonReceipt) add(defects, 'comparison-receipt', 'high', 'Reference-vs-model comparison receipt is missing.');
  }

  return {pass: !defects.some((d) => HIGH.has(d.severity)), defects};
}

export function runRegnet(candidate) {
  const base = validateCandidate(candidate, {requireVisualEvidence: true});
  const defects = [...base.defects];
  const keys = Array.isArray(candidate?.authoredKeys) ? candidate.authoredKeys : [];
  const paths = Array.isArray(candidate?.weaponPathSamples) ? candidate.weaponPathSamples : [];

  if (candidate?.action?.requiresWeapon && !paths.length) {
    add(defects, 'weapon-path-evidence', 'high', 'Weapon action has no recorded grip/blade-path comparison evidence.');
  }
  if (candidate?.rootPolicy === 'unknown') add(defects, 'root-policy', 'high', 'Root/weight policy is unknown.');
  if (candidate?.deterministic !== true) add(defects, 'determinism', 'high', 'Candidate does not declare deterministic reconstruction.');
  if (!keys.some((k) => k.phase === 'contact' && Number(k.holdFrames || 0) >= 1)) {
    add(defects, 'contact-hold', 'high', 'Contact key is not explicitly held long enough to read.', 'contact');
  }

  const verdict = defects.some((d) => d.severity === 'critical')
    ? 'INVALID_EVIDENCE'
    : defects.some((d) => d.severity === 'high')
      ? 'REVISE_REQUIRED'
      : 'PASS';
  return {reviewer: 'REGNET', verdict, defects, reviewedAt: new Date().toISOString()};
}

export function penelopeQuorum(reviews, {minimumIndependent = 6} = {}) {
  const rows = Array.isArray(reviews) ? reviews : [];
  const independent = new Set(rows.map((r) => cleanText(r.reviewerId)).filter(Boolean));
  const lenses = new Set(rows.map((r) => cleanText(r.lens)).filter(Boolean));
  const unresolvedHigh = rows.filter((r) => r.verdict !== 'PASS' && HIGH.has(cleanText(r.severity).toLowerCase()));
  const negativePresent = rows.some((r) => r.negativeTaster === true || r.lens === 'negative-human-animator');
  const missing = PENELOPE_LENSES.filter((lens) => !lenses.has(lens));
  const pass = independent.size >= minimumIndependent && unresolvedHigh.length === 0 && negativePresent && missing.length === 0;
  return {pass, independentCount: independent.size, unresolvedHigh, negativePresent, missingLenses: missing};
}

export function veniceGate(candidate) {
  const regnet = candidate?.reviews?.regnet;
  const penelope = penelopeQuorum(candidate?.reviews?.penelope || []);
  const venice = candidate?.reviews?.venice;
  const reasons = [];
  if (regnet?.verdict !== 'PASS') reasons.push('REGNET has not passed.');
  if (!penelope.pass) reasons.push('Penelope quorum is incomplete or has unresolved high-severity rejection.');
  if (venice?.verdict !== 'PRESENTABLE_TO_DREW') reasons.push('Venice has not explicitly returned PRESENTABLE_TO_DREW.');
  return {pass: reasons.length === 0, reasons, penelope};
}

export function drewEyeFirewall(candidate) {
  const gate = veniceGate(candidate);
  const correctionHistory = Array.isArray(candidate?.corrections) ? candidate.corrections : [];
  const hasEvidenceDrivenCorrection = correctionHistory.some((c) => cleanText(c?.evidence) && cleanText(c?.change));
  const reasons = [...gate.reasons];
  if (!hasEvidenceDrivenCorrection) reasons.push('No evidence-driven correction has been applied and recorded.');
  if (candidate?.state === 'accepted') reasons.push('Internal gauntlet may make a candidate presentable, never self-accept it for Drew.');
  return {
    presentable: reasons.length === 0,
    verdict: reasons.length === 0 ? 'PRESENTABLE_TO_DREW' : 'INTERNAL_ONLY',
    reasons,
  };
}

export function smallestRankedCorrection(candidate) {
  const regnet = candidate?.reviews?.regnet || runRegnet(candidate);
  const penelopeRows = candidate?.reviews?.penelope || [];
  const visible = penelopeRows
    .filter((r) => r.verdict !== 'PASS')
    .map((r) => ({
      source: 'PENELOPE',
      severity: cleanText(r.severity || 'medium').toLowerCase(),
      code: cleanText(r.lens || 'visible-defect'),
      message: cleanText(r.defect || 'Visible defect requires revision.'),
      evidence: r.evidence ?? null,
    }));
  const technical = (regnet.defects || []).map((d) => ({source: 'REGNET', ...d}));
  const rank = {critical: 4, high: 3, medium: 2, low: 1};
  return [...technical, ...visible].sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0))[0] || null;
}
