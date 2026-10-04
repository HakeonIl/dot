/* ---------- 기타 ---------- */
let toastT;
function toast(m){ const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
document.addEventListener('keydown', e => {
  if (e.target.closest('input,select,textarea') || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y'){ e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const map = {b:'pen', p:'pen', e:'eraser', g:'fill', i:'picker'};
  if (map[k]) setTool(map[k]);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown'){
    if (isMz()){
      e.preventDefault();
      const d = mzDirOf(cur), p = mzPatOf(cur);
      if (e.key === 'ArrowLeft') cur = mzIdx(d, (p + 2) % 3);
      else if (e.key === 'ArrowRight') cur = mzIdx(d, (p + 1) % 3);
      else if (e.key === 'ArrowUp') cur = mzIdx((d + 3) % 4, p);
      else if (e.key === 'ArrowDown') cur = mzIdx((d + 1) % 4, p);
      mzDir = mzDirOf(cur);
      syncMzDirButtons(); renderAll();
    } else if (frames.length > 1){
      if (e.key === 'ArrowLeft'){ cur = (cur - 1 + frames.length) % frames.length; renderAll(); }
      else if (e.key === 'ArrowRight'){ cur = (cur + 1) % frames.length; renderAll(); }
    }
  }
});

/* ---------- 시작 ---------- */
new ResizeObserver(() => { sizeCanvas(editor); drawEditor(); }).observe($('#wrap'));
readTheme();
if (!load()){ N = 16; frames = sampleFrames(); cur = 0; mode = 'free'; }
loadAiSettings();
syncAllUI();
setColor(color);
renderAll(); updUndo();
requestAnimationFrame(loop);
