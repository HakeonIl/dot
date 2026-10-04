/* ---------- 미리보기 ---------- */
const pv = $('#preview'), pctx = pv.getContext('2d');
let pvFrame = 0, pvSeqPos = 0, pvX = 0, lastTick = 0;
new ResizeObserver(() => { sizeCanvas(pv); }).observe(pv);
function drawPreview(){
  const W = pv.width, H = pv.height; if (!W || !H) return;
  pctx.fillStyle = T['sky']; pctx.fillRect(0, 0, W, H);
  const ground = Math.round(H * .84);
  pctx.fillStyle = T['ground']; pctx.fillRect(0, ground, W, H - ground);
  const s = Math.max(1, Math.floor((H * .7) / N)), sw = N * s;
  let f, x;
  if (isMz()){
    const seq = [0, 1, 2, 1];
    const idx = mzIdx(mzDir, seq[pvSeqPos % 4]);
    f = playing ? frames[idx] : frames[cur];
    if (walk && playing && (mzDir === 1 || mzDir === 2)){
      const span = W + sw; x = Math.round(((pvX % span) + span) % span) - sw;
    } else x = Math.round((W - sw) / 2);
  } else {
    f = playing ? frames[pvFrame % frames.length] : frames[cur];
    if (walk && playing){
      const span = W + sw; x = Math.round(((pvX % span) + span) % span) - sw;
    } else x = Math.round((W - sw) / 2);
  }
  pctx.fillStyle = T['ground'];
  for (let gx = 0; gx < W; gx += s * 6) pctx.fillRect(gx, ground - s, s * 2, s);
  drawPixels(pctx, f, N, x, ground - sw, s);
}
function loop(t){
  requestAnimationFrame(loop);
  if (playing && t - lastTick >= 1000 / fps){
    lastTick = t;
    if (isMz()){
      pvSeqPos = (pvSeqPos + 1) % 4;
      if (walk){ const s = Math.max(1, Math.floor((pv.height * .7) / N)); pvX += (mzDir === 1 ? -1 : 1) * speed * s; }
    } else {
      pvFrame = (pvFrame + 1) % frames.length;
      if (walk){ const s = Math.max(1, Math.floor((pv.height * .7) / N)); pvX += speed * s; }
    }
  }
  drawPreview();
}
$('#playBtn').addEventListener('click', e => {
  playing = !playing; e.currentTarget.setAttribute('aria-pressed', playing);
  e.currentTarget.textContent = playing ? '일시정지' : '재생';
});
const fpsR = $('#fpsRange'), spR = $('#speedRange');
fpsR.addEventListener('input', () => { fps = +fpsR.value; $('#fpsOut').textContent = fps + ' fps'; save(); });
spR.addEventListener('input', () => { speed = +spR.value; $('#speedOut').textContent = speed + '칸'; save(); });
function setWalk(v, silent){
  walk = v; $('#modeWalk').setAttribute('aria-pressed', v); $('#modeStay').setAttribute('aria-pressed', !v);
  $('#walkRow').style.display = v ? '' : 'none'; if (!silent) save();
}
$('#modeWalk').addEventListener('click', () => setWalk(true));
$('#modeStay').addEventListener('click', () => setWalk(false));

