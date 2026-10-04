/* ---------- 내보내기 ---------- */
let dlP = null;
async function saveFile(filename, blob){
  if (window.claude && window.claude.use){
    if (!dlP) dlP = window.claude.use('downloads').catch(() => null);
    const dl = await dlP;
    if (!dl){ toast('이 화면에서는 파일 저장을 쓸 수 없어요'); return; }
    try { await dl.save({filename, data: blob}); toast('저장했어요'); }
    catch(e){ if (e && e.code === 'declined') return; if (e && e.code === 'rate_limited') toast('잠시 후 다시 눌러 주세요'); else toast('저장하지 못했어요 (' + ((e && e.code) || '오류') + ')'); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
const scale = () => +$('#scaleSel').value;
function canvasFor(list){
  const s = scale(), cv = document.createElement('canvas');
  cv.width = N * s * list.length; cv.height = N * s;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  list.forEach((f, i) => drawPixels(ctx, f, N, i * N * s, 0, s));
  return cv;
}
const toBlob = cv => new Promise(r => cv.toBlob(r, 'image/png'));
function mzSingleCanvas(){
  const cv = document.createElement('canvas'); cv.width = 144; cv.height = 192;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 144, 192);
  for (let d = 0; d < 4; d++) for (let p = 0; p < 3; p++) drawPixels(ctx, frames[mzIdx(d, p)], 48, p * 48, d * 48, 1);
  return cv;
}
function mzSlotCanvas(){
  const cv = document.createElement('canvas'); cv.width = 576; cv.height = 384;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 576, 384);
  if (mzSlotBase === 'loaded' && mzBaseSheet){
    ctx.drawImage(mzBaseSheet, 0, 0);
  }
  const sx = (mzSlot % 4) * 144, sy = ((mzSlot / 4) | 0) * 192;
  ctx.clearRect(sx, sy, 144, 192);
  for (let d = 0; d < 4; d++) for (let p = 0; p < 3; p++) drawPixels(ctx, frames[mzIdx(d, p)], 48, sx + p * 48, sy + d * 48, 1);
  return cv;
}
function mzFileName(ext){
  const nm = (charName || 'character').trim() || 'character';
  const safe = nm.replace(/[\\/:*?"<>|]/g, '_');
  return (prefix || '') + safe + ext;
}
$('#exSheet').addEventListener('click', async () => saveFile(`dot-sheet-${frames.length}f.png`, await toBlob(canvasFor(frames))));
$('#exFrame').addEventListener('click', async () => saveFile(`dot-frame-${cur + 1}.png`, await toBlob(canvasFor([frames[cur]]))));
$('#exJson').addEventListener('click', () => saveFile('dot-project.json',
  new Blob([JSON.stringify({app:'dot-gongbang', version:2, mode, name:charName, prefix, N, fps, speed, walk, custom, mzDir, mzSlot, mzExpType, mzSlotBase, cur, frames})], {type:'application/json'})));
$('#exGif').addEventListener('click', () => {
  const bytes = encodeGIF(frames, N, scale(), Math.max(2, Math.round(100 / fps)));
  saveFile('dot-anim.gif', new Blob([bytes], {type:'image/gif'}));
});
$('#exMzPng').addEventListener('click', async () => {
  if (!isMz()) return;
  const cv = mzExpType === 'slot' ? mzSlotCanvas() : mzSingleCanvas();
  saveFile(mzFileName('.png'), await toBlob(cv));
});
$('#exMzGif').addEventListener('click', () => {
  if (!isMz()) return;
  const list = [frames[mzIdx(mzDir, 0)], frames[mzIdx(mzDir, 1)], frames[mzIdx(mzDir, 2)], frames[mzIdx(mzDir, 1)]];
  const bytes = encodeGIF(list, 48, scale(), Math.max(2, Math.round(100 / fps)));
  const nm = (charName || 'character').trim() || 'character';
  saveFile(`mz-${nm}-${DIR_KEYS[mzDir]}.gif`, new Blob([bytes], {type:'image/gif'}));
});
$('#mzName').addEventListener('input', e => { charName = e.target.value.slice(0, 40) || 'hero'; save(); });
$('#mzPrefix').addEventListener('change', e => { prefix = e.target.value; syncMzExportUI(); save(); });
$('#mzExpType').addEventListener('change', e => { mzExpType = e.target.value; syncMzExportUI(); save(); });
$('#mzSlotSel').addEventListener('change', e => { mzSlot = +e.target.value; save(); });
$('#mzSlotBaseSel').addEventListener('change', e => { mzSlotBase = e.target.value; save(); });

$('#imJson').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!(d.N >= 4 && d.N <= 64 && Array.isArray(d.frames) && d.frames.length && d.frames.every(f => Array.isArray(f) && f.length === d.N * d.N))) throw 0;
    pushUndo();
    if (d.version === 2 && (d.mode === 'mz' || d.mode === 'free')){
      if (d.mode === 'mz'){
        if (!(d.N === 48 && d.frames.length === 12)) throw 0;
        mode = 'mz'; N = 48;
        frames = d.frames.map(f => f.map(v => isHex(v) ? v.toLowerCase() : ''));
        cur = Math.max(0, Math.min(d.cur || 0, 11));
        charName = typeof d.name === 'string' && d.name ? d.name.slice(0, 40) : 'hero';
        prefix = ['','$','!','!$'].includes(d.prefix) ? d.prefix : '$';
        mzDir = (d.mzDir >= 0 && d.mzDir <= 3) ? d.mzDir : 0;
        mzSlot = (d.mzSlot >= 0 && d.mzSlot <= 7) ? d.mzSlot : 0;
        mzExpType = d.mzExpType === 'slot' ? 'slot' : 'single';
        mzSlotBase = d.mzSlotBase === 'loaded' ? 'loaded' : 'empty';
        fps = d.fps || 5;
      } else {
        mode = 'free'; N = d.N;
        frames = d.frames.map(f => f.map(v => isHex(v) ? v.toLowerCase() : ''));
        cur = Math.min(d.cur || 0, frames.length - 1);
        if (d.fps){ fps = d.fps; }
        charName = typeof d.name === 'string' && d.name ? d.name.slice(0, 40) : charName;
        if (typeof d.prefix === 'string') prefix = d.prefix;
      }
    } else {
      // v1 파일은 자유 모드로
      mode = 'free'; N = d.N;
      frames = d.frames.map(f => f.map(v => isHex(v) ? v.toLowerCase() : ''));
      cur = 0;
      if (d.fps){ fps = d.fps; }
    }
    if (d.speed !== undefined) speed = d.speed;
    if (d.walk !== undefined) walk = d.walk;
    if (Array.isArray(d.custom)) custom = d.custom.filter(isHex).slice(0, 8);
    if (Array.isArray(d.importColors)) importColors = d.importColors.filter(isHex).slice(0, 32);
    pvSeqPos = 0; pvX = 0;
    syncAllUI(); renderAll(); save(); $('#fileDlg').close(); toast('프로젝트를 불러왔어요');
  } catch(err){ toast('도트 공방 프로젝트 파일(.json)을 골라 주세요'); }
});
$('#sampleBtn').addEventListener('click', () => {
  pushUndo();
  mode = 'free'; N = 16; frames = sampleFrames(); cur = 0;
  syncAllUI(); renderAll(); save(); $('#fileDlg').close(); toast('예제 캐릭터를 불러왔어요');
});
$('#newBtn').addEventListener('click', () => {
  pushUndo();
  if (isMz()){ N = 48; frames = Array.from({length:12}, () => blank(48)); cur = 0; }
  else frames = [blank()], cur = 0;
  pvSeqPos = 0; pvX = 0;
  renderAll(); save(); $('#fileDlg').close(); toast('새 캔버스예요. 되돌리기로 이전 작업을 살릴 수 있어요');
});
$('#fileBtn').addEventListener('click', () => { syncMzExportUI(); $('#fileDlg').showModal(); });
$('#closeDlg').addEventListener('click', () => $('#fileDlg').close());

/* ---------- PNG 불러오기 ---------- */
function loadImageEl(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = e => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}
function canvasFromImage(img){
  const cv = document.createElement('canvas'); cv.width = img.naturalWidth || img.width; cv.height = img.naturalHeight || img.height;
  const ctx = cv.getContext('2d', {willReadFrequently:true}); ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0);
  return cv;
}
const toHex = v => v.toString(16).padStart(2, '0');
function decodeRegionToFrames(srcCanvas, sx, sy){
  // 144×192 영역을 12장으로. 투명: alpha<128 → ''
  const ctx = srcCanvas.getContext('2d', {willReadFrequently:true});
  const img = ctx.getImageData(sx, sy, 144, 192);
  const d = img.data;
  const out = Array.from({length:12}, () => new Array(48 * 48).fill(''));
  let semi = 0;
  const colorCount = new Map();
  for (let dy = 0; dy < 192; dy++) for (let dx = 0; dx < 144; dx++){
    const pi = (dy * 144 + dx) * 4;
    const r = d[pi], g = d[pi + 1], b = d[pi + 2], a = d[pi + 3];
    if (a > 0 && a < 255) semi++;
    let hex = '';
    if (a >= 128) hex = ('#' + toHex(r) + toHex(g) + toHex(b)).toLowerCase();
    const dir = (dy / 48) | 0, pat = (dx / 48) | 0;
    const lx = dx % 48, ly = dy % 48;
    out[dir * 3 + pat][ly * 48 + lx] = hex;
    if (hex) colorCount.set(hex, (colorCount.get(hex) || 0) + 1);
  }
  return {frames12: out, semi, colorCount};
}
function parseNamePrefix(filename){
  let base = (filename || '').replace(/\.png$/i, '');
  let pre = '', nm = base;
  if (base.startsWith('!$')){ pre = '!$'; nm = base.slice(2); }
  else if (base.startsWith('$') || base.startsWith('!')){ pre = base[0]; nm = base.slice(1); }
  else { pre = ''; nm = base; }
  if (!nm) nm = 'hero';
  return {pre, nm: nm.slice(0, 40)};
}
function askSlot(srcCanvas){
  return new Promise(resolve => {
    const grid = $('#slotGrid'); grid.innerHTML = '';
    for (let s = 0; s < 8; s++){
      const sx = (s % 4) * 144, sy = ((s / 4) | 0) * 192;
      const b = document.createElement('button');
      b.className = 'slot-cell';
      const cv = document.createElement('canvas'); cv.width = 144; cv.height = 192;
      const cctx = cv.getContext('2d'); cctx.imageSmoothingEnabled = false;
      cctx.drawImage(srcCanvas, sx, sy, 144, 192, 0, 0, 144, 192);
      const sp = document.createElement('span'); sp.textContent = '슬롯 ' + s;
      b.append(cv, sp);
      b.addEventListener('click', () => { $('#slotDlg').close(); resolve(s); });
      grid.append(b);
    }
    $('#slotDlg').showModal();
  });
}
$('#slotCancel').addEventListener('click', () => $('#slotDlg').close());
$('#slotDlg').addEventListener('close', () => {
  // 취소로 닫혔을 때 대기 중인 askSlot 해제
  if ($('#slotDlg').returnValue === '' && slotCancelResolve){ slotCancelResolve(-1); slotCancelResolve = null; }
});
let slotCancelResolve = null;
$('#imPngBtn').addEventListener('click', () => $('#pngInput').click());
$('#pngInput').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  const fname = file.name || '';
  const startsDollar = fname.startsWith('$');
  try {
    const img = await loadImageEl(file);
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) throw new Error('size');
    const full = canvasFromImage(img);
    const {pre, nm} = parseNamePrefix(fname);

    const div3 = W % 3 === 0, div12 = W % 12 === 0, div4 = H % 4 === 0, div8 = H % 8 === 0;
    let kind = 'unknown';
    if (startsDollar){
      // 크기와 무관하게 단일로 해석 시도
      if ((W === 144 && H === 192) || (div3 && div4)) kind = 'single';
      else { toast(`48×48 프레임이 아니어서 불러올 수 없어요 (${W}×${H})`); return; }
      if (W / 3 !== 48 || H / 4 !== 48){ toast(`48×48 프레임이 아니어서 불러올 수 없어요 (${W}×${H})`); return; }
    } else if (W === 144 && H === 192){
      kind = 'single';
    } else if (W === 576 && H === 384){
      kind = 'slot8';
    } else if ((div3 || div12) && (div4 || div8)){
      // 프레임 크기 계산 시도, 48이 아니면 중단
      let fw = -1, fh = -1;
      if (W % 12 === 0 && H % 8 === 0){ fw = W / 12; fh = H / 8; }
      else if (W % 3 === 0 && H % 4 === 0){ fw = W / 3; fh = H / 4; }
      if (fw !== 48 || fh !== 48){ toast(`48×48 프레임이 아니어서 불러올 수 없어요 (${W}×${H})`); return; }
      // 48인데 표준 크기가 아니면 (이론상 여기까지 오지 않음) 단일/슬롯 판별
      if (W === 144 && H === 192) kind = 'single';
      else if (W === 576 && H === 384) kind = 'slot8';
      else { toast(`48×48 프레임이 아니어서 불러올 수 없어요 (${W}×${H})`); return; }
    } else {
      toast(`PNG 크기를 확인할 수 없어요 (${W}×${H}). 144×192 또는 576×384를 넣어주세요`);
      return;
    }

    if (kind === 'single'){
      const {frames12, semi, colorCount} = decodeRegionToFrames(full, 0, 0);
      pushUndo();
      mode = 'mz'; N = 48; frames = frames12; cur = 0; mzDir = 0; pvSeqPos = 0; pvX = 0;
      charName = nm; prefix = pre;
      // 이 그림의 색 (많이 쓰인 순, 최대 32)
      importColors = [...colorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 32).map(x => x[0]);
      fps = 5;
      syncAllUI(); renderAll(); save(); $('#fileDlg').close();
      toast(semi > 0 ? `반투명 픽셀 ${semi}개를 불투명으로 바꿨습니다` : '단일 캐릭터를 불러왔어요');
    } else if (kind === 'slot8'){
      // 원본 보관 (덮어쓰기용, 픽셀 그대로)
      const baseKeep = document.createElement('canvas'); baseKeep.width = 576; baseKeep.height = 384;
      const bctx = baseKeep.getContext('2d'); bctx.imageSmoothingEnabled = false;
      bctx.drawImage(full, 0, 0);
      // 슬롯 선택 UI (취소 대응)
      const selP = new Promise(res => {
        slotCancelResolve = res;
        const grid = $('#slotGrid'); grid.innerHTML = '';
        for (let s = 0; s < 8; s++){
          const sx = (s % 4) * 144, sy = ((s / 4) | 0) * 192;
          const b = document.createElement('button');
          b.className = 'slot-cell';
          const cv = document.createElement('canvas'); cv.width = 144; cv.height = 192;
          const cctx = cv.getContext('2d'); cctx.imageSmoothingEnabled = false;
          cctx.drawImage(full, sx, sy, 144, 192, 0, 0, 144, 192);
          const sp = document.createElement('span'); sp.textContent = '슬롯 ' + s;
          b.append(cv, sp);
          b.addEventListener('click', () => { $('#slotDlg').close(); slotCancelResolve = null; res(s); });
          grid.append(b);
        }
        $('#slotDlg').showModal();
      });
      const picked = await selP;
      if (picked < 0){ return; }
      const sx = (picked % 4) * 144, sy = ((picked / 4) | 0) * 192;
      const {frames12, semi, colorCount} = decodeRegionToFrames(full, sx, sy);
      pushUndo();
      mzBaseSheet = baseKeep;
      mode = 'mz'; N = 48; frames = frames12; cur = 0; mzDir = 0; pvSeqPos = 0; pvX = 0;
      mzSlot = picked; mzExpType = 'slot'; mzSlotBase = 'loaded';
      charName = nm; prefix = pre;
      importColors = [...colorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 32).map(x => x[0]);
      fps = 5;
      syncAllUI(); renderAll(); save(); $('#fileDlg').close();
      toast(semi > 0 ? `반투명 픽셀 ${semi}개를 불투명으로 바꿨습니다` : `슬롯 ${picked}를 불러왔어요`);
    }
  } catch(err){ toast('PNG를 읽지 못했어요'); }
});

