/* ---------- 테마 색 ---------- */
let T = {};
function readTheme(){
  const cs = getComputedStyle(document.documentElement);
  ['chk-a','chk-b','grid','grid-strong','accent','ground','sky','ink'].forEach(k => T[k] = cs.getPropertyValue('--' + k).trim());
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { readTheme(); drawEditor(); });

/* ---------- 편집 캔버스 ---------- */
const editor = $('#editor'), ectx = editor.getContext('2d');
function sizeCanvas(cv){
  const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d));
}
function drawPixels(ctx, f, n, ox, oy, cellW){
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){
    const c = f[y * n + x]; if (!c) continue;
    const x0 = Math.round(ox + x * cellW), y0 = Math.round(oy + y * cellW);
    const x1 = Math.round(ox + (x + 1) * cellW), y1 = Math.round(oy + (y + 1) * cellW);
    ctx.fillStyle = c; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}
function drawEditor(){
  const W = editor.width, c = W / N, ctx = ectx;
  ctx.clearRect(0, 0, W, W);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    ctx.fillStyle = (x + y) % 2 ? T['chk-a'] : T['chk-b'];
    const x0 = Math.round(x * c), y0 = Math.round(y * c);
    ctx.fillRect(x0, y0, Math.round((x + 1) * c) - x0, Math.round((y + 1) * c) - y0);
  }
  if (onion && frames.length > 1){
    if (isMz() && frames.length === 12){
      const d = mzDirOf(cur), p = mzPatOf(cur);
      if (p === 0 || p === 2){ ctx.globalAlpha = .3; drawPixels(ctx, frames[mzIdx(d, 1)], N, 0, 0, c); }
      else { ctx.globalAlpha = .3; drawPixels(ctx, frames[mzIdx(d, 0)], N, 0, 0, c); ctx.globalAlpha = .12; drawPixels(ctx, frames[mzIdx(d, 2)], N, 0, 0, c); }
      ctx.globalAlpha = 1;
    } else if (!isMz()){
      const L = frames.length;
      if (L > 2){ ctx.globalAlpha = .12; drawPixels(ctx, frames[(cur + 1) % L], N, 0, 0, c); }
      ctx.globalAlpha = .3; drawPixels(ctx, frames[(cur - 1 + L) % L], N, 0, 0, c);
      ctx.globalAlpha = 1;
    }
  }
  drawPixels(ctx, frames[cur], N, 0, 0, c);
  if (showGrid && c >= 6){
    const lw = Math.max(1, Math.round((window.devicePixelRatio || 1) * .6));
    for (let i = 1; i < N; i++){
      const p = Math.round(i * c);
      ctx.fillStyle = (i % 8 === 0) ? T['grid-strong'] : T['grid'];
      ctx.fillRect(p, 0, lw, W); ctx.fillRect(0, p, W, lw);
    }
  }
  if (mirror){
    ctx.fillStyle = T['accent'];
    const mid = Math.round(W / 2), lw = Math.max(2, Math.round(c / 6));
    for (let y = 0; y < W; y += c) ctx.fillRect(mid - lw / 2, y, lw, c * .5);
  }
}

function cellAt(e, clamp){
  const r = editor.getBoundingClientRect();
  let x = Math.floor((e.clientX - r.left) / r.width * N), y = Math.floor((e.clientY - r.top) / r.height * N);
  if (clamp){ x = Math.max(0, Math.min(N - 1, x)); y = Math.max(0, Math.min(N - 1, y)); }
  else if (x < 0 || y < 0 || x >= N || y >= N) return null;
  return {x, y};
}
let drawing = false, last = null, strokeVal = '';
function setPx(x, y, v){ if (x >= 0 && y >= 0 && x < N && y < N) frames[cur][y * N + x] = v; }
function plot(p){ setPx(p.x, p.y, strokeVal); if (mirror) setPx(N - 1 - p.x, p.y, strokeVal); }
function line(a, b){
  let x0 = a.x, y0 = a.y; const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0);
  const sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1; let err = dx + dy;
  for (;;){ plot({x:x0, y:y0}); if (x0 === b.x && y0 === b.y) break;
    const e2 = 2 * err; if (e2 >= dy){ err += dy; x0 += sx; } if (e2 <= dx){ err += dx; y0 += sy; } }
}
function flood(p, v){
  const f = frames[cur], target = f[p.y * N + p.x]; if (target === v) return;
  const st = [p.x + p.y * N];
  while (st.length){
    const i = st.pop(); if (f[i] !== target) continue; f[i] = v;
    const x = i % N, y = (i / N) | 0;
    if (x > 0) st.push(i - 1); if (x < N - 1) st.push(i + 1);
    if (y > 0) st.push(i - N); if (y < N - 1) st.push(i + N);
  }
}
editor.addEventListener('contextmenu', e => e.preventDefault());
editor.addEventListener('pointerdown', e => {
  const p = cellAt(e); if (!p) return;
  e.preventDefault();
  const erase = e.button === 2 || tool === 'eraser';
  if (tool === 'picker' && e.button !== 2){
    const c = frames[cur][p.y * N + p.x];
    if (c){ if (!PRESET.includes(c) && !custom.includes(c)) addCustom(c); setColor(c); toast('색을 가져왔어요'); }
    else toast('빈 칸이에요');
    return;
  }
  pushUndo();
  if (tool === 'fill' && e.button !== 2){
    flood(p, color); if (mirror) flood({x: N - 1 - p.x, y: p.y}, color);
    commit(); return;
  }
  strokeVal = erase ? '' : color;
  editor.setPointerCapture(e.pointerId);
  drawing = true; last = p; plot(p); drawEditor();
});
editor.addEventListener('pointermove', e => {
  if (!drawing) return;
  const p = cellAt(e, true); if (p.x === last.x && p.y === last.y) return;
  line(last, p); last = p; drawEditor();
});
const endStroke = () => { if (drawing){ drawing = false; commit(); } };
editor.addEventListener('pointerup', endStroke);
editor.addEventListener('pointercancel', endStroke);
function commit(){ drawEditor(); updThumb(cur); save(); updateAiTargetLine(); }

/* ---------- 도구 & 팔레트 ---------- */
function setTool(t){
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
}
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
function toggle(btn, get, set){ btn.addEventListener('click', () => { set(!get()); btn.setAttribute('aria-pressed', get()); drawEditor(); save(); }); }
toggle($('#mirrorBtn'), () => mirror, v => mirror = v);
toggle($('#gridBtn'), () => showGrid, v => showGrid = v);
toggle($('#onionBtn'), () => onion, v => onion = v);

function setColor(c){
  color = c; if (tool === 'eraser' || tool === 'picker') setTool('pen');
  $('#currentSw').style.background = c; $('#colorInput').value = c; renderPalette();
}
function addCustom(c){ custom = [c, ...custom.filter(x => x !== c)].slice(0, 8); save(); }
function renderPalette(){
  const pal = $('#palette'); pal.innerHTML = '';
  [...PRESET, ...custom.filter(c => !PRESET.includes(c))].forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch' + (c.toLowerCase() === color.toLowerCase() ? ' on' : '');
    b.style.background = c; b.setAttribute('aria-label', '색 ' + c); b.title = c;
    b.addEventListener('click', () => setColor(c));
    pal.append(b);
  });
  renderImportColors();
}
function renderImportColors(){
  const wrap = $('#importColorsWrap'), box = $('#importColors');
  box.innerHTML = '';
  if (!importColors.length){ wrap.hidden = true; return; }
  wrap.hidden = false;
  importColors.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch small' + (c.toLowerCase() === color.toLowerCase() ? ' on' : '');
    b.style.background = c; b.setAttribute('aria-label', '색 ' + c); b.title = c;
    b.addEventListener('click', () => setColor(c));
    box.append(b);
  });
}
$('#colorInput').addEventListener('input', e => { color = e.target.value; $('#currentSw').style.background = color; if (tool === 'eraser' || tool === 'picker') setTool('pen'); });
$('#colorInput').addEventListener('change', e => { const c = e.target.value.toLowerCase(); if (!PRESET.includes(c)) addCustom(c); setColor(c); });

