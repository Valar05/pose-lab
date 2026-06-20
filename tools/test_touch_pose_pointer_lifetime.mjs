import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function methodBody(name) {
  const marker = `  ${name} {`;
  const start = js.indexOf(marker);
  if (start < 0) return '';
  const brace = start + marker.length - 1;
  let depth = 0;
  for (let i = brace; i < js.length; i += 1) {
    if (js[i] === '{') depth += 1;
    if (js[i] === '}') {
      depth -= 1;
      if (depth === 0) return js.slice(start, i + 1);
    }
  }
  return '';
}

const update = methodBody('updateTouchPoseDrag(event)');
const finish = methodBody('finishTouchPoseDrag(event)');
const cancel = methodBody('cancelTouchPoseDrag(event = null, renderIfEdited = false)');

assert(cancel, 'runtime should expose cancelTouchPoseDrag for lost capture / blur cleanup');
assert(cancel.includes('UI.canvas.releasePointerCapture?.(this.touchPoseDrag.pointerId)'), 'cancel should release the captured pointer');
assert(cancel.includes('this.touchPoseDrag = null;'), 'cancel should always clear active touch drag state');
assert(cancel.includes('this.controls.enabled = true;'), 'cancel should restore orbit controls');
assert(update.includes('event.pointerId !== this.touchPoseDrag.pointerId'), 'pointermove should ignore mismatched pointer ids');
assert(update.includes('event.buttons === 0'), 'pointermove should cancel when no buttons/touches remain active');
assert(finish.includes('event.pointerId !== this.touchPoseDrag.pointerId'), 'pointerup should ignore mismatched pointer ids');
assert(finish.includes('this.cancelTouchPoseDrag(event, true);'), 'finish should route through central cancellation/cleanup');
assert(finish.includes('return wasEditing;'), 'finish should only consume edited drags so taps can immediately reselect');
assert(js.includes("UI.canvas.addEventListener('lostpointercapture'"), 'canvas should clear drag state on lostpointercapture');
assert(js.includes("window.addEventListener('blur'"), 'window blur should clear drag state');
assert(js.includes("document.addEventListener('visibilitychange'"), 'visibility changes should clear drag state');
assert(js.includes("this.cancelTouchPoseDrag(event, true)"), 'pointercancel/lost capture should use central cleanup');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['touch-pointer-lifetime', 'lost-capture-cleanup', 'no-stale-pointer-spin'] }, null, 2));
