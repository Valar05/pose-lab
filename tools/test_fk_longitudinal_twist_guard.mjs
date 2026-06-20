import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  clone() { return new Vec3(this.x, this.y, this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() {
    const len = Math.sqrt(this.lengthSq());
    if (!len) return this;
    this.x /= len;
    this.y /= len;
    this.z /= len;
    return this;
  }
  dot(other) { return this.x * other.x + this.y * other.y + this.z * other.z; }
  sub(other) { this.x -= other.x; this.y -= other.y; this.z -= other.z; return this; }
  multiplyScalar(scalar) { this.x *= scalar; this.y *= scalar; this.z *= scalar; return this; }
  cross(other) { const x = this.y * other.z - this.z * other.y; const y = this.z * other.x - this.x * other.z; const z = this.x * other.y - this.y * other.x; this.x = x; this.y = y; this.z = z; return this; }
}

const safeNormalizedVectorSrc = extractFunction('safeNormalizedVector');
const orthogonalizeAgainstTwistSrc = extractFunction('orthogonalizeAgainstTwist');
const synthesizeOrthogonalAxisSrc = extractFunction('synthesizeOrthogonalAxis');
const avoidLongitudinalTwistSrc = extractFunction('avoidLongitudinalTwist');
if (!safeNormalizedVectorSrc || !orthogonalizeAgainstTwistSrc || !synthesizeOrthogonalAxisSrc || !avoidLongitudinalTwistSrc) {
  throw new Error('could not extract longitudinal twist helpers from src/pose-lab.js');
}

const helpers = new Function('Vec3', `${safeNormalizedVectorSrc}
${orthogonalizeAgainstTwistSrc}
${synthesizeOrthogonalAxisSrc}
${avoidLongitudinalTwistSrc}
return { avoidLongitudinalTwist };`)(Vec3);
const avoidLongitudinalTwist = helpers.avoidLongitudinalTwist;

const twistAxis = new Vec3(0, 0, 1);
const tooTwistyPrimary = new Vec3(0.70710678, 0, 0.70710678);
const cleanFallback = new Vec3(1, 0, 0);
const result = avoidLongitudinalTwist(tooTwistyPrimary, twistAxis, cleanFallback);

assert(result, 'twist guard should always choose a usable non-null axis when a clean fallback exists');
if (result) {
  const alignment = Math.abs(result.dot(twistAxis));
  assert(alignment <= 0.25, `FK axis must stay nearly perpendicular to the bone direction; got alignment ${alignment.toFixed(3)}`);
}

const twistyFallback = new Vec3(0.3, 0, 0.9539392);
const projected = avoidLongitudinalTwist(tooTwistyPrimary, twistAxis, twistyFallback);
assert(projected, 'twist guard should synthesize a usable axis even when the fallback is also twisty');
if (projected) {
  const projectedAlignment = Math.abs(projected.dot(twistAxis));
  assert(projectedAlignment <= 0.25, `synthesized FK axis must stay nearly perpendicular to the bone direction; got alignment ${projectedAlignment.toFixed(3)}`);
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fk-longitudinal-twist-guard'] }, null, 2));
