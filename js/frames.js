/* ---------- 모드 ---------- */
function hasContent(){ return frames.some(f => f.some(v => v)); }
function setMode(next, opts = {}){
  if (next === mode) return;
  if (!opts.skipConfirm && hasContent()){
    if (!confirm('모드를 바꾸면 현재 그림 배치가 바뀌어요. 계속할까요?\n(바꾸기 전 상태는 되돌리기로 복구할 수 있어요)')) return;
  }
  pushUndo();
  if (next === 'mz'){
    const oldN = N;
    N = 48;
    if (oldN === 48 && frames.length > 0){
      const nf = [];
      for (let i = 0; i < 12; i++) nf.push(frames[i] ? frames[i].slice(0, 48 * 48) : blank(48));
      // 길이가 모자란 프레임 보정
      for (let i = 0; i < 12; i++) if (nf[i].length !== 48 * 48) nf[i] = blank(48);
      frames = nf;
    } else {
      frames = Array.from({length:12}, () => blank(48));
    }
    cur = Math.max(0, Math.min(cur, 11));
    mzDir = Math.max(0, Math.min(mzDirOf(cur), 3));
    fps = 5; pvSeqPos = 0; pvX = 0;
  } else {
    if (!frames.length) frames = [blank()];
    cur = Math.max(0, Math.min(cur, frames.length - 1));
    pvFrame = 0;
  }
  mode = next;
  syncAllUI(); renderAll(); save();
  toast(next === 'mz' ? 'MZ 캐릭터 모드예요 (48×12장)' : '자유 모드예요');
}
$('#modeFreeBtn').addEventListener('click', () => setMode('free'));
$('#modeMzBtn').addEventListener('click', () => setMode('mz'));

function syncAllUI(){
  const mz = isMz();
  $('#modeFreeBtn').setAttribute('aria-pressed', !mz);
  $('#modeMzBtn').setAttribute('aria-pressed', mz);
  $('#sizeSel').disabled = mz;
  $('#sizeSel').value = String(N);
  $('#strip').hidden = mz;
  $('#mzGrid').hidden = !mz;
  $('#frameTitle').textContent = mz ? '프레임 (4방향×3패턴)' : '프레임';
  for (const id of ['#addBtn','#dupBtn','#delBtn','#leftBtn','#rightBtn']) $(id).hidden = mz;
  $('#mzCopyMidBtn').hidden = !mz;
  $('#mzMirrorL2RBtn').hidden = !mz;
  $('#mzDirRow').hidden = !mz;
  $('#freeExportBox').hidden = mz;
  const mzb = $('#mzExportBox'); mzb.hidden = !mz;
  $('#mzScaleNote').hidden = !mz;
  $('#mzName').value = charName;
  $('#mzPrefix').value = prefix;
  $('#mzExpType').value = mzExpType;
  $('#mzSlotSel').value = String(mzSlot);
  $('#mzSlotBaseSel').value = mzSlotBase;
  syncMzDirButtons(); syncMzExportUI();
  const fr = $('#fpsRange'); fr.value = fps; $('#fpsOut').textContent = fps + ' fps';
  const sr = $('#speedRange'); sr.value = speed; $('#speedOut').textContent = speed + '칸';
  setWalk(walk, true);
  renderImportColors();
}
function syncMzDirButtons(){
  document.querySelectorAll('[data-mzdir]').forEach(b => {
    b.setAttribute('aria-pressed', +b.dataset.mzdir === mzDir);
  });
}
function syncMzExportUI(){
  const isSlot = $('#mzExpType').value === 'slot';
  $('#mzSlotSel').style.display = isSlot ? '' : 'none';
  $('#mzBaseRow').style.display = isSlot ? '' : 'none';
  const hasBase = !!mzBaseSheet;
  const baseSel = $('#mzSlotBaseSel');
  [...baseSel.options].forEach(o => { if (o.value === 'loaded') o.disabled = !hasBase; });
  if (!hasBase && baseSel.value === 'loaded') baseSel.value = 'empty';
  const showSingleWarn = $('#mzExpType').value === 'single' && !($('#mzPrefix').value.includes('$'));
  const showSlotWarn = $('#mzExpType').value === 'slot' && $('#mzPrefix').value.includes('$');
  if (showSlotWarn) $('#mzDollarWarn').textContent = '$가 있으면 MZ가 1인 캐릭터로 인식해 깨집니다';
  else $('#mzDollarWarn').textContent = '$가 없으면 MZ가 8인 시트로 인식합니다';
  $('#mzDollarWarn').hidden = !(showSingleWarn || showSlotWarn);
}
document.querySelectorAll('[data-mzdir]').forEach(b => b.addEventListener('click', () => {
  mzDir = +b.dataset.mzdir; pvSeqPos = 0; pvX = 0; syncMzDirButtons(); save();
}));

/* ---------- 프레임 ---------- */
const strip = $('#strip'), mzGrid = $('#mzGrid');
function drawThumb(cv, f){
  const n = Math.sqrt(f.length) | 0;
  cv.width = n; cv.height = n;
  const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, n, n);
  for (let i = 0; i < f.length; i++) if (f[i]){ ctx.fillStyle = f[i]; ctx.fillRect(i % n, (i / n) | 0, 1, 1); }
}
function renderStrip(){
  strip.innerHTML = '';
  frames.forEach((f, i) => {
    const b = document.createElement('button');
    b.className = 'thumb' + (i === cur ? ' on' : '');
    b.setAttribute('aria-label', (i + 1) + '번 프레임'); b.setAttribute('aria-current', i === cur);
    const cv = document.createElement('canvas'); drawThumb(cv, f);
    const s = document.createElement('span'); s.textContent = i + 1;
    b.append(cv, s);
    b.addEventListener('click', () => { cur = i; renderAll(); save(); });
    strip.append(b);
  });
  $('#frameInfo').textContent = (cur + 1) + ' / ' + frames.length;
  const el = strip.children[cur];
  if (el){
    const l = el.offsetLeft, r = l + el.offsetWidth;
    if (l < strip.scrollLeft) strip.scrollLeft = l - 8;
    else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 8;
  }
  $('#delBtn').disabled = frames.length < 2;
  $('#leftBtn').disabled = cur === 0;
  $('#rightBtn').disabled = cur === frames.length - 1;
}
function renderMzGrid(){
  mzGrid.innerHTML = '';
  frames.forEach((f, i) => {
    const d = mzDirOf(i), p = mzPatOf(i);
    let row = mzGrid.children[d];
    if (!row){
      row = document.createElement('div'); row.className = 'mz-row';
      const lab = document.createElement('span'); lab.className = 'mz-label'; lab.textContent = DIR_NAMES[d];
      row.append(lab); mzGrid.append(row);
    }
    const b = document.createElement('button');
    b.className = 'thumb mz-cell' + (i === cur ? ' on' : '');
    b.setAttribute('aria-label', DIR_NAMES[d] + ' 패턴 ' + p); b.setAttribute('aria-current', i === cur);
    const cv = document.createElement('canvas'); drawThumb(cv, f);
    const s = document.createElement('span'); s.textContent = (p + 1) + (p === 1 ? ' ●' : '');
    b.append(cv, s);
    b.addEventListener('click', () => { cur = i; mzDir = d; syncMzDirButtons(); renderAll(); save(); });
    row.append(b);
  });
  $('#frameInfo').textContent = DIR_NAMES[mzDirOf(cur)] + ' ' + (mzPatOf(cur) + 1) + ' / 12';
}
function updThumb(i){
  if (isMz()){
    const d = mzDirOf(i), p = mzPatOf(i);
    const row = mzGrid.children[d];
    const btn = row ? row.children[p + 1] : null;
    const cv = btn ? btn.querySelector('canvas') : null;
    if (cv) drawThumb(cv, frames[i]);
    // 선택 강조 갱신은 render로 (가볍게 클래스만)
    [...mzGrid.querySelectorAll('.thumb')].forEach((el, k) => el.classList.toggle('on', k === cur));
    $('#frameInfo').textContent = DIR_NAMES[mzDirOf(cur)] + ' ' + (mzPatOf(cur) + 1) + ' / 12';
  } else {
    const cv = strip.children[i]?.querySelector('canvas'); if (cv) drawThumb(cv, frames[i]);
  }
}
function renderAll(){
  $('#sizeSel').value = String(N);
  drawEditor();
  if (isMz()) renderMzGrid(); else renderStrip();
  updateAiTargetLine();
}

$('#addBtn').addEventListener('click', () => { if (isMz()) return; pushUndo(); frames.splice(cur + 1, 0, blank()); cur++; renderAll(); save(); });
$('#dupBtn').addEventListener('click', () => { if (isMz()) return; pushUndo(); frames.splice(cur + 1, 0, frames[cur].slice()); cur++; renderAll(); save(); });
$('#delBtn').addEventListener('click', () => { if (isMz() || frames.length < 2) return; pushUndo(); frames.splice(cur, 1); cur = Math.min(cur, frames.length - 1); renderAll(); save(); });
$('#leftBtn').addEventListener('click', () => { if (isMz() || cur < 1) return; pushUndo(); [frames[cur - 1], frames[cur]] = [frames[cur], frames[cur - 1]]; cur--; renderAll(); save(); });
$('#rightBtn').addEventListener('click', () => { if (isMz() || cur >= frames.length - 1) return; pushUndo(); [frames[cur + 1], frames[cur]] = [frames[cur], frames[cur + 1]]; cur++; renderAll(); save(); });
$('#clearBtn').addEventListener('click', () => { pushUndo(); frames[cur] = blank(); commit(); });
$('#mzCopyMidBtn').addEventListener('click', () => {
  if (!isMz()) return; pushUndo();
  const d = mzDirOf(cur), mid = frames[mzIdx(d, 1)].slice();
  frames[mzIdx(d, 0)] = mid.slice(); frames[mzIdx(d, 2)] = mid.slice();
  renderAll(); save(); toast(DIR_NAMES[d] + ' 방향에 가운데를 복사했어요');
});
function flipFrameH(src, n){
  const g = new Array(n * n).fill('');
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g[y * n + (n - 1 - x)] = src[y * n + x];
  return g;
}
$('#mzMirrorL2RBtn').addEventListener('click', () => {
  if (!isMz()) return; pushUndo();
  for (let p = 0; p < 3; p++) frames[mzIdx(2, p)] = flipFrameH(frames[mzIdx(1, p)], 48);
  renderAll(); save(); toast('왼쪽 줄을 반전해서 오른쪽에 복사했어요');
});
document.querySelectorAll('[data-shift]').forEach(b => b.addEventListener('click', () => {
  const [dx, dy] = b.dataset.shift.split(',').map(Number);
  pushUndo(); const src = frames[cur], g = blank();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N) g[ny * N + nx] = src[y * N + x];
  }
  frames[cur] = g; commit();
}));
$('#flipHBtn').addEventListener('click', () => { pushUndo(); frames[cur] = flipFrameH(frames[cur], N); commit(); });
$('#flipVBtn').addEventListener('click', () => { pushUndo(); const s = frames[cur], g = blank();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g[(N - 1 - y) * N + x] = s[y * N + x]; frames[cur] = g; commit(); });

$('#sizeSel').addEventListener('change', e => {
  if (isMz()) return;
  const n = +e.target.value; if (n === N) return;
  pushUndo();
  const offX = Math.floor((n - N) / 2), offY = n - N; // 가로는 가운데, 세로는 바닥 기준
  frames = frames.map(f => { const g = blank(n);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
      const nx = x + offX, ny = y + offY; if (nx >= 0 && ny >= 0 && nx < n && ny < n) g[ny * n + nx] = f[y * N + x];
    } return g; });
  N = n; renderAll(); save();
});

