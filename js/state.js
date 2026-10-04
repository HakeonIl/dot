const KEY_V2 = 'dot-gongbang.v2';
const KEY_V1 = 'dot-gongbang.v1';
const PRESET = ['#2a2238','#ffffff','#8f8f9e','#8a4b2f','#f3c8a2','#3f7fd6','#4b4f72','#34375a',
                '#d94a4a','#f29e38','#f7d84a','#6cc24a','#2e8b6e','#7ad0e8','#9b6ad6','#f08cb5'];
const DIR_NAMES = ['아래','왼쪽','오른쪽','위'];
const DIR_KEYS = ['down','left','right','up'];
const $ = s => document.querySelector(s);

let mode = 'free';
let N = 16, frames = [], cur = 0;
let tool = 'pen', color = PRESET[0], mirror = false, showGrid = true, onion = true;
let fps = 6, playing = true, walk = true, speed = 2;
let custom = [];
let importColors = [];
let mzDir = 0, mzSlot = 0, mzExpType = 'single', mzSlotBase = 'empty';
let charName = 'hero', prefix = '$';
let mzBaseSheet = null;
const undoStack = [], redoStack = [];
const MAX_UNDO = 40;

const isMz = () => mode === 'mz';
const mzDirOf = i => (i / 3) | 0;
const mzPatOf = i => i % 3;
const mzIdx = (d, p) => d * 3 + p;

const blank = (n = N) => new Array(n * n).fill('');
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/* ---------- 예제 캐릭터 ---------- */
function sampleFrames(){
  const C = {k:'#2a2238',h:'#8a4b2f',s:'#f3c8a2',b:'#3f7fd6',p:'#4b4f72',q:'#34375a'};
  const UP = [
    "................",".....kkkkk......","....khhhhhk.....","...khhhhhhhk....",
    "...khhsssssk....","...khsssskssk...","...khssssssk....","....kssssssk....",
    "....kkbbbbk.....","...kbbbbbbbk....","...ksbbbbbsk....","....kkbbbbk....."];
  const STRIDE = ["....kqqkppk.....","...kqqk.kppk....","..kqqk...kppk...","..kkk.....kkkk.."];
  const PASS   = ["....kqqppk......","....kqqppk......",".....kqpk.......",".....kkkkk......"];
  const swap = rows => rows.map(r => r.replace(/[pq]/g, c => c === 'p' ? 'q' : 'p'));
  const build = (legs, dy) => {
    const g = blank(16), rows = UP.concat(legs);
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      const ty = y + dy; if (ch !== '.' && ty >= 0 && ty < 16) g[ty * 16 + x] = C[ch];
    }));
    return g;
  };
  return [build(STRIDE,0), build(PASS,-1), build(swap(STRIDE),0), build(swap(PASS),-1)];
}

/* ---------- 저장 ---------- */
let saveT;
function save(){
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      const data = {app:'dot-gongbang', version:2, mode, name:charName, prefix, N, frames, cur, fps, speed, walk, custom, mzDir, mzSlot, mzExpType, mzSlotBase, importColors};
      localStorage.setItem(KEY_V2, JSON.stringify(data));
    } catch(e){}
  }, 250);
}
function validFrames(fr, n){
  return Array.isArray(fr) && fr.length > 0 && fr.every(f => Array.isArray(f) && f.length === n * n);
}
function load(){
  // v2 우선, 없으면 v1 이어받기
  try {
    const raw2 = localStorage.getItem(KEY_V2);
    if (raw2){
      const d = JSON.parse(raw2);
      if (d && Array.isArray(d.frames) && d.N >= 4 && d.N <= 64 && validFrames(d.frames, d.N)){
        applyLoadedData(d);
        return true;
      }
    }
  } catch(e){}
  try {
    const d = JSON.parse(localStorage.getItem(KEY_V1) || 'null');
    if (d && d.N && Array.isArray(d.frames) && d.frames.length && d.frames.every(f => Array.isArray(f) && f.length === d.N * d.N)){
      N = d.N; frames = d.frames.map(f => f.map(v => isHex(v) ? v.toLowerCase() : ''));
      cur = Math.min(d.cur || 0, frames.length - 1);
      fps = d.fps || fps; speed = d.speed ?? speed; walk = d.walk ?? walk;
      custom = (d.custom || []).filter(isHex).slice(0, 8);
      mode = 'free';
      return true;
    }
  } catch(e){}
  return false;
}
function applyLoadedData(d){
  const m = d.mode === 'mz' ? 'mz' : 'free';
  let n = d.N;
  if (m === 'mz'){
    n = 48;
    if (!validFrames(d.frames, 48) || d.frames.length !== 12){
      // 손상된 MZ 데이터는 빈 12장으로
      N = 48; frames = Array.from({length:12}, () => blank(48)); cur = 0;
    } else {
      N = 48; frames = d.frames.map(f => f.map(v => isHex(v) ? v.toLowerCase() : ''));
      cur = Math.max(0, Math.min(d.cur || 0, 11));
    }
    mode = 'mz';
    fps = d.fps || 5;
  } else {
    N = (d.N >= 4 && d.N <= 64) ? d.N : 16;
    frames = d.frames.map(f => f.map(v => isHex(v) ? v.toLowerCase() : ''));
    cur = Math.min(d.cur || 0, frames.length - 1);
    mode = 'free';
    fps = d.fps || 6;
  }
  speed = d.speed ?? 2; walk = d.walk ?? true;
  custom = (d.custom || []).filter(isHex).slice(0, 8);
  importColors = (d.importColors || []).filter(isHex).slice(0, 32);
  charName = typeof d.name === 'string' && d.name ? d.name.slice(0, 40) : 'hero';
  prefix = ['','$','!','!$'].includes(d.prefix) ? d.prefix : (m === 'mz' ? '$' : '');
  mzDir = (d.mzDir >= 0 && d.mzDir <= 3) ? d.mzDir : 0;
  mzSlot = (d.mzSlot >= 0 && d.mzSlot <= 7) ? d.mzSlot : 0;
  mzExpType = d.mzExpType === 'slot' ? 'slot' : 'single';
  mzSlotBase = d.mzSlotBase === 'loaded' ? 'loaded' : 'empty';
}

/* ---------- 실행 취소 ---------- */
const snap = () => ({mode, N, cur, frames: frames.map(f => f.slice()), fps, speed, walk, custom: custom.slice(), importColors: importColors.slice(), mzDir, mzSlot, mzExpType, mzSlotBase, charName, prefix});
function pushUndo(){ undoStack.push(snap()); if (undoStack.length > MAX_UNDO) undoStack.shift(); redoStack.length = 0; updUndo(); }
function restore(s){
  mode = s.mode === 'mz' ? 'mz' : 'free';
  N = s.N; frames = s.frames.map(f => f.slice());
  cur = Math.min(s.cur, frames.length - 1);
  fps = s.fps; speed = s.speed; walk = s.walk;
  custom = (s.custom || []).slice(); importColors = (s.importColors || []).slice();
  mzDir = s.mzDir || 0; mzSlot = s.mzSlot || 0;
  mzExpType = s.mzExpType || 'single'; mzSlotBase = s.mzSlotBase || 'empty';
  charName = s.charName || 'hero'; prefix = s.prefix ?? '';
  pvSeqPos = 0; pvX = 0;
  syncAllUI(); renderAll(); save();
}
function undo(){ if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); updUndo(); }
function redo(){ if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); updUndo(); }
function updUndo(){ $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length; }

