/* GIF89a 인코더 (투명 배경, 무한 반복) */
function encodeGIF(list, n, s, delay){
  const colors = [], idx = new Map();
  const rgb = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  for (const f of list) for (const c of f) if (c && !idx.has(c)){
    if (colors.length < 255){ idx.set(c, colors.length); colors.push(c); }
    else { // 255색을 넘으면 가장 가까운 색으로
      const [r,g,b] = rgb(c); let best = 0, bd = 1e9;
      colors.forEach((k, i) => { const [r2,g2,b2] = rgb(k); const d = (r-r2)**2 + (g-g2)**2 + (b-b2)**2; if (d < bd){ bd = d; best = i; } });
      idx.set(c, best);
    }
  }
  const trans = colors.length;
  let bits = 1; while ((1 << bits) < colors.length + 1) bits++;
  const tsize = 1 << bits, W = n * s, H = n * s, out = [];
  const b = v => out.push(v & 255), w16 = v => { b(v); b(v >> 8); }, str = t => { for (const ch of t) b(ch.charCodeAt(0)); };
  str('GIF89a'); w16(W); w16(H); b(0x80 | ((bits - 1) << 4) | (bits - 1)); b(trans); b(0);
  for (let i = 0; i < tsize; i++){ const [r,g,bb] = i < colors.length ? rgb(colors[i]) : [0,0,0]; b(r); b(g); b(bb); }
  b(0x21); b(0xFF); b(11); str('NETSCAPE2.0'); b(3); b(1); w16(0); b(0);
  const minCode = Math.max(2, bits);
  for (const f of list){
    b(0x21); b(0xF9); b(4); b((2 << 2) | 1); w16(delay); b(trans); b(0);
    b(0x2C); w16(0); w16(0); w16(W); w16(H); b(0);
    const px = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const c = f[((y / s) | 0) * n + ((x / s) | 0)]; px[y * W + x] = c ? idx.get(c) : trans;
    }
    b(minCode);
    const data = lzw(px, minCode);
    for (let i = 0; i < data.length; i += 255){ const ch = data.slice(i, i + 255); b(ch.length); for (const v of ch) out.push(v); }
    b(0);
  }
  b(0x3B);
  return new Uint8Array(out);
}
function lzw(px, minCode){
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1, dict = new Map();
  const bytes = []; let acc = 0, nbits = 0;
  const emit = code => { acc |= code << nbits; nbits += size; while (nbits >= 8){ bytes.push(acc & 255); acc >>>= 8; nbits -= 8; } };
  emit(clear);
  let prefix2 = px[0];
  for (let i = 1; i < px.length; i++){
    const k = px[i], key = prefix2 * 256 + k, hit = dict.get(key);
    if (hit !== undefined){ prefix2 = hit; continue; }
    emit(prefix2);
    if (next === 4096){ emit(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; }
    else { if (next >= (1 << size)) size++; dict.set(key, next++); }
    prefix2 = k;
  }
  emit(prefix2); emit(eoi);
  if (nbits > 0) bytes.push(acc & 255);
  return bytes;
}

