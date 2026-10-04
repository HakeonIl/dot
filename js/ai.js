/* ---------- AI로 찍기 (OpenRouter) ---------- */
const KEY_AI = 'dot-gongbang.ai';
let aiApiKey = '', aiModelName = '', aiFakeResp = '';
let aiFormat = 'numbered', aiAutoFix = false;
let aiReasoning = '', aiMaxTokens = '', aiTemperature = '', aiSeed = '', aiSysPrompt = '';
let aiCandidates = 1;
let aiAutoDesc = '';
let aiLastCandidates = null, aiCandControllers = [];
let aiModels = null, aiModelsLoading = false, aiModelsFailed = false;
let aiBusy = false, aiAbort = null;
const AI_FORMAT_LABEL = {plain: '격자', numbered: '줄번호 격자', rle: '줄 압축(RLE)'};
const AI_PARAM_KEYS = {reasoning: 'reasoning', maxTokens: 'max_tokens', temperature: 'temperature', seed: 'seed'};
function loadAiSettings(){
  try {
    const d = JSON.parse(localStorage.getItem(KEY_AI) || 'null');
    if (d){
      aiApiKey = typeof d.key === 'string' ? d.key.trim() : '';
      aiModelName = typeof d.model === 'string' ? d.model : '';
      aiFakeResp = typeof d.fakeResp === 'string' ? d.fakeResp : '';
      aiFormat = d.format === 'plain' || d.format === 'rle' ? d.format : 'numbered';
      aiAutoFix = !!d.autoFix;
      aiReasoning = typeof d.reasoning === 'string' ? d.reasoning : '';
      aiMaxTokens = d.maxTokens != null ? String(d.maxTokens) : '';
      aiTemperature = d.temperature != null ? String(d.temperature) : '';
      aiSeed = d.seed != null ? String(d.seed) : '';
      aiSysPrompt = typeof d.sysPrompt === 'string' ? d.sysPrompt : '';
      aiAutoDesc = typeof d.autoDesc === 'string' ? d.autoDesc : '';
      aiCandidates = (() => { const cn = Number(d.candidates); return Number.isInteger(cn) && cn >= 1 && cn <= 4 ? cn : 1; })();
    }
  } catch(e){}
  if (typeof AI_SYS_DEFAULT === 'string'){
    const t = aiSysPrompt.trim();
    if (t === '' || t === AI_SYS_DEFAULT.trim()) aiSysPrompt = '';
  }
  $('#aiKey').value = aiApiKey; $('#aiModel').value = aiModelName;
  $('#aiFakeResp').value = aiFakeResp;
  $('#aiFormatSel').value = aiFormat;
  $('#aiAutoFix').checked = aiAutoFix;
  $('#aiReasoning').value = aiReasoning;
  $('#aiMaxTokens').value = aiMaxTokens;
  $('#aiTemperature').value = aiTemperature;
  $('#aiSeed').value = aiSeed;
  $('#aiSysPrompt').value = aiSysPrompt.trim() ? aiSysPrompt : AI_SYS_DEFAULT;
  $('#aiCandSel').value = String(aiCandidates);
  updateAiKeyWarn(); updateAiFakeVisibility(); updateAiModelInfo(); updateAiParamSupport(); updateAiSysMeta(); updateAiCandUI();
  loadAiRefImg(); aiRenderRefImg();
  aiLoadModels(false);
}
function saveAiSettings(){
  try { localStorage.setItem(KEY_AI, JSON.stringify({key: aiApiKey, model: aiModelName, fakeResp: aiFakeResp, format: aiFormat, autoFix: aiAutoFix, reasoning: aiReasoning, maxTokens: aiMaxTokens, temperature: aiTemperature, seed: aiSeed, sysPrompt: aiSysPrompt, candidates: aiCandidates, autoDesc: aiAutoDesc})); } catch(e){}
}
function aiSendParams(){
  const clean = aiCleanParams({reasoning: aiReasoning, maxTokens: aiMaxTokens, temperature: aiTemperature, seed: aiSeed});
  const out = {};
  if (clean.reasoning && aiSupported('reasoning')) out.reasoning = clean.reasoning;
  if (clean.maxTokens != null && aiSupported('maxTokens')) out.maxTokens = clean.maxTokens;
  if (clean.temperature != null && aiSupported('temperature')) out.temperature = clean.temperature;
  if (clean.seed != null && aiSupported('seed')) out.seed = clean.seed;
  return out;
}
function aiSnapSettings(){
  return {
    model: aiModelName,
    params: aiSendParams(),
    format: aiFormat,
    autoFix: aiAutoFix,
    candidates: aiCandidates,
    sysTemplate: aiSysPrompt,
    fakeResp: aiFakeResp
  };
}
$('#aiKey').addEventListener('input', e => { aiApiKey = e.target.value.trim(); saveAiSettings(); updateAiKeyWarn(); });
$('#aiModel').addEventListener('input', e => { aiModelName = e.target.value.trim(); saveAiSettings(); updateAiFakeVisibility(); updateAiModelInfo(); });
$('#aiFakeResp').addEventListener('input', e => { aiFakeResp = e.target.value; saveAiSettings(); });
$('#aiFormatSel').addEventListener('change', e => { aiFormat = e.target.value; saveAiSettings(); });
$('#aiAutoFix').addEventListener('change', e => { aiAutoFix = e.target.checked; saveAiSettings(); });
$('#aiCandSel').addEventListener('change', e => {
  const v = Number(e.target.value);
  aiCandidates = Number.isInteger(v) && v >= 1 && v <= 4 ? v : 1;
  saveAiSettings(); updateAiCandUI();
});
function updateAiCandUI(){
  const lab = $('#aiCandLabel');
  if (lab) lab.textContent = '후보 ' + aiCandidates + '장';
  const rev = $('#aiCandReviewBtn');
  if (rev) rev.hidden = !aiLastCandidates;
}
function updateAiFakeVisibility(){
  const wrap = $('#aiFakeWrap');
  if (wrap) wrap.hidden = aiModelName.indexOf('test/') !== 0;
}
function aiModelEntry(id){
  if (!aiModels) return null;
  for (const m of aiModels) if (m.id === id) return m;
  return null;
}
function aiSupported(field){
  if (!aiModels) return true;
  const e = aiModelEntry(aiModelName);
  if (!e) return true;
  return e.supported.indexOf(AI_PARAM_KEYS[field]) >= 0;
}
function aiPriceFor(id){
  const e = aiModelEntry(id);
  if (!e || !e.pricing) return null;
  const p = Number(e.pricing.prompt), c = Number(e.pricing.completion);
  if (!(p >= 0) || !(c >= 0)) return null;
  return {prompt: p, completion: c};
}
function aiPriceText(pr){
  if (!pr) return '가격 정보 없음';
  const f = v => '$' + (Math.round(v * 1000000 * 10000) / 10000);
  return '입력 ' + f(pr.prompt) + ' · 출력 ' + f(pr.completion) + ' (/100만 토큰)';
}
async function aiLoadModels(force){
  if (!force && (aiModels || aiModelsLoading)) return;
  aiModelsLoading = true; aiModelsFailed = false; updateAiModelInfo();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    aiModels = ((d && d.data) || []).map(m => ({id: m.id, pricing: m.pricing || {}, supported: m.supported_parameters || [], inputModalities: (m.architecture && m.architecture.input_modalities) || []}));
    const dl = $('#aiModelList');
    if (dl){
      dl.innerHTML = '';
      for (const m of aiModels){
        const o = document.createElement('option');
        o.value = m.id;
        dl.append(o);
      }
    }
  } catch(e){ aiModelsFailed = true; aiModels = null; }
  aiModelsLoading = false; updateAiModelInfo(); updateAiParamSupport();
}
function updateAiModelInfo(){
  const info = $('#aiModelInfo'), warn = $('#aiModelWarn'), retry = $('#aiModelsRetry');
  if (!info) return;
  if (aiModelsLoading){ info.textContent = '모델 정보 불러오는 중…'; if (warn) warn.hidden = true; if (retry) retry.hidden = true; return; }
  if (aiModelsFailed){ info.textContent = '모델 정보를 불러오지 못했어요'; if (retry) retry.hidden = false; }
  else if (!aiModels){ info.textContent = ''; if (retry) retry.hidden = true; }
  else {
    if (retry) retry.hidden = true;
    const e = aiModelEntry(aiModelName);
    if (!aiModelName) info.textContent = '';
    else if (!e) info.textContent = '';
    else {
      const marks = ['reasoning', 'maxTokens', 'temperature', 'seed'].map(f =>
        (f === 'maxTokens' ? 'max_tokens' : f) + ' ' + (aiSupported(f) ? '✓' : '✗')).join(' · ');
      info.textContent = aiPriceText(aiPriceFor(aiModelName)) + ' · ' + marks;
    }
  }
  const msgs = [];
  if (aiModelName && aiModelName.indexOf('test/') !== 0 && aiModels && !aiModelEntry(aiModelName))
    msgs.push('OpenRouter에 없는 모델 이름이에요');
  if (/:batch$/i.test(aiModelName)) msgs.push('batch 모델은 결과가 늦게(수 분~24시간) 와서 찍기에 쓸 수 없어요');
  if (warn){
    warn.hidden = !msgs.length;
    warn.textContent = msgs.join(' / ');
  }
  updateAiParamSupport();
  updateAiRefWarn();
}
function aiFieldValid(field, raw){
  if (raw === '' || raw == null) return true;
  if (field === 'reasoning') return raw === 'low' || raw === 'medium' || raw === 'high';
  if (field === 'maxTokens'){ const v = Number(raw); return Number.isInteger(v) && v >= 1; }
  if (field === 'temperature'){ const v = Number(raw); return typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 2; }
  if (field === 'seed'){ const v = Number(raw); return Number.isInteger(v); }
  return true;
}
function updateAiParamSupport(){
  const map = {reasoning: ['#aiReasoning', '#aiReasoningNote'], maxTokens: ['#aiMaxTokens', '#aiMaxTokensNote'], temperature: ['#aiTemperature', '#aiTemperatureNote'], seed: ['#aiSeed', '#aiSeedNote']};
  const raw = {reasoning: aiReasoning, maxTokens: aiMaxTokens, temperature: aiTemperature, seed: aiSeed};
  for (const f of Object.keys(map)){
    const inp = $(map[f][0]), note = $(map[f][1]);
    if (!inp || !note) continue;
    if (!aiSupported(f)){ inp.disabled = true; note.hidden = false; note.textContent = '이 모델은 지원 안 함'; }
    else {
      inp.disabled = false;
      const ok = aiFieldValid(f, raw[f]);
      note.hidden = ok;
      if (!ok) note.textContent = '값이 범위를 벗어났어요 (보내지 않음)';
    }
  }
}
function updateAiSysMeta(){
  const mod = $('#aiSysModified'), warn = $('#aiSysWarn');
  const t = aiSysPrompt.trim();
  const custom = t !== '' && t !== AI_SYS_DEFAULT.trim();
  if (mod) mod.hidden = !custom;
  if (warn){
    const bad = custom && aiSysPrompt.indexOf('{FORMAT}') < 0;
    warn.hidden = !bad;
    if (bad) warn.textContent = '템플릿에 {FORMAT}이 없어요 (형식 설명이 들어가지 않음)';
  }
}
$('#aiKeyToggle').addEventListener('click', () => {
  const inp = $('#aiKey'), show = inp.type === 'password';
  inp.type = show ? 'text' : 'password'; $('#aiKeyToggle').textContent = show ? '숨기기' : '보기';
});
$('#aiSettingsBtn').addEventListener('click', () => { $('#aiSettingsDlg').showModal(); aiLoadModels(false); });
$('#aiSettingsClose').addEventListener('click', () => $('#aiSettingsDlg').close());
$('#aiModelsRetry').addEventListener('click', () => aiLoadModels(true));
$('#aiReasoning').addEventListener('change', e => { aiReasoning = e.target.value; saveAiSettings(); updateAiParamSupport(); });
$('#aiMaxTokens').addEventListener('input', e => { aiMaxTokens = e.target.value.trim(); saveAiSettings(); updateAiParamSupport(); });
$('#aiTemperature').addEventListener('input', e => { aiTemperature = e.target.value.trim(); saveAiSettings(); updateAiParamSupport(); });
$('#aiSeed').addEventListener('input', e => { aiSeed = e.target.value.trim(); saveAiSettings(); updateAiParamSupport(); });
$('#aiSysPrompt').addEventListener('input', e => {
  const v = e.target.value;
  const t = v.trim();
  aiSysPrompt = (t === '' || t === AI_SYS_DEFAULT.trim()) ? '' : v;
  saveAiSettings(); updateAiSysMeta();
});
$('#aiSysReset').addEventListener('click', () => { aiSysPrompt = ''; $('#aiSysPrompt').value = AI_SYS_DEFAULT; saveAiSettings(); updateAiSysMeta(); });
const aiRefPickBtn = $('#aiRefPickBtn');
if (aiRefPickBtn) aiRefPickBtn.addEventListener('click', () => $('#aiRefFile').click());
const aiRefFileInp = $('#aiRefFile');
if (aiRefFileInp) aiRefFileInp.addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) aiSetRefFile(f);
});
const aiRefClearBtn = $('#aiRefClear');
if (aiRefClearBtn) aiRefClearBtn.addEventListener('click', aiClearRefImg);
function updateAiKeyWarn(){
  let w = $('#aiKeyWarn');
  if (!w){
    w = document.createElement('div');
    w.className = 'ai-err'; w.id = 'aiKeyWarn';
    const row = $('#aiKey').closest('.frow');
    if (!row) return;
    row.after(w);
  }
  const bad = /[\s]/.test(aiApiKey);
  w.hidden = !bad;
  if (bad) w.textContent = '키에 공백이 들어 있어요';
}
function aiKeyResultEl(){
  let el = $('#aiKeyCheckResult');
  if (!el){
    el = document.createElement('div');
    el.className = 'ai-stats'; el.id = 'aiKeyCheckResult';
    $('#aiKeyCheckBtn').after(el);
  }
  return el;
}
function aiKeyOkText(data){
  const d = (data && data.data) || {};
  const parts = [];
  if (d.label) parts.push('label: ' + d.label);
  if (d.limit != null) parts.push('limit: ' + d.limit);
  if (d.usage != null) parts.push('usage: ' + d.usage);
  return '키 정상' + (parts.length ? ' (' + parts.join(' · ') + ')' : '');
}
let aiKeyChecking = false;
$('#aiKeyCheckBtn').addEventListener('click', async () => {
  if (aiKeyChecking) return;
  if (!aiApiKey.trim()){ toast('AI 설정에서 키를 입력해 주세요'); return; }
  const key = aiApiKey.trim();
  const el = aiKeyResultEl();
  aiKeyChecking = true; $('#aiKeyCheckBtn').disabled = true;
  el.hidden = false; el.textContent = '확인 중…';
  try {
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      headers: {'Authorization': 'Bearer ' + key}
    });
    const bodyText = await res.text();
    if (!res.ok) throw aiHttpError(res.status, bodyText);
    let data = null;
    try { data = JSON.parse(bodyText); } catch(e){}
    el.textContent = aiKeyOkText(data);
    toast('키 정상');
  } catch(err){
    if (err && err.name === 'AbortError'){}
    else {
      const info = aiFormatError(err, aiModelName);
      el.textContent = (info.status ? 'HTTP ' + info.status + '\n' : '')
        + (info.body ? info.body.slice(0, 2000) + '\n' : '')
        + (info.guide ? '안내: ' + info.guide : String((err && err.message) || err));
      aiErrorToast('키 확인 실패: ' + (info.guide || info.text));
    }
  } finally {
    aiKeyChecking = false; $('#aiKeyCheckBtn').disabled = false;
  }
});

function aiHttpError(status, bodyText){
  const err = new Error(status ? 'HTTP ' + status : '응답 오류');
  err.status = status || null;
  err.body = String(bodyText == null ? '' : bodyText).slice(0, 2000);
  return err;
}
function aiCleanParams(raw){
  const out = {};
  if (!raw) return out;
  if (raw.reasoning === 'low' || raw.reasoning === 'medium' || raw.reasoning === 'high') out.reasoning = raw.reasoning;
  if (raw.maxTokens !== '' && raw.maxTokens != null){
    const v = Number(raw.maxTokens);
    if (Number.isInteger(v) && v >= 1) out.maxTokens = v;
  }
  if (raw.temperature !== '' && raw.temperature != null){
    const v = Number(raw.temperature);
    if (typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 2) out.temperature = v;
  }
  if (raw.seed !== '' && raw.seed != null){
    const v = Number(raw.seed);
    if (Number.isInteger(v)) out.seed = v;
  }
  return out;
}
function aiRequestBody(snap, messages){
  const body = {model: snap.model, messages};
  const p = aiCleanParams(snap.params);
  if (p.reasoning) body.reasoning = {effort: p.reasoning};
  if (p.maxTokens != null) body.max_tokens = p.maxTokens;
  if (p.temperature != null) body.temperature = p.temperature;
  if (p.seed != null) body.seed = p.seed;
  body.usage = {include: true};
  return body;
}
function aiBodyText(body){
  const ms = Array.isArray(body.messages) ? body.messages : [];
  let chars = 0, imgCount = 0, imgKB = 0;
  for (const m of ms){
    const c = m && m.content;
    if (typeof c === 'string') chars += c.length;
    else if (Array.isArray(c)) for (const part of c){
      if (part && part.type === 'text' && typeof part.text === 'string') chars += part.text.length;
      else if (part && part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string'){ imgCount++; imgKB += aiDataUrlKB(part.image_url.url); }
    }
    else chars += String(c || '').length;
  }
  let summary = '(messages ' + ms.length + '개, ' + chars + '자)';
  if (imgCount) summary = '(messages ' + ms.length + '개, ' + chars + '자, 이미지 ' + imgCount + '개 ' + imgKB + 'KB)';
  const b = Object.assign({}, body, {messages: summary});
  return JSON.stringify(b, null, 1);
}
function aiWait(ms, signal){
  return new Promise((res, rej) => {
    const fail = () => { const e = new Error('Aborted'); e.name = 'AbortError'; rej(e); };
    if (signal && signal.aborted){ fail(); return; }
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); fail(); }, {once: true});
  });
}
function aiSplitFake(src){
  const out = []; let cur = [];
  for (const ln of String(src).split('\n')){
    if (ln.trim() === '====='){ out.push(cur.join('\n')); cur = []; }
    else cur.push(ln);
  }
  out.push(cur.join('\n'));
  return out;
}
function aiFakeUsage(body, respText){
  const ms = (body && body.messages) || [];
  let sent = 0, imgs = 0;
  for (const m of ms){
    const c = m && m.content;
    if (typeof c === 'string') sent += c.length;
    else if (Array.isArray(c)) for (const part of c){
      if (part && part.type === 'text' && typeof part.text === 'string') sent += part.text.length;
      else if (part && part.type === 'image_url') imgs++;
    }
    else sent += String(c || '').length;
  }
  const pt = Math.round(sent / 4) + imgs * 1000, ct = Math.round(String(respText).length / 4);
  return {prompt_tokens: pt, completion_tokens: ct,
    completion_tokens_details: {reasoning_tokens: 0}, cost: 0.000001 * (pt + ct)};
}
function aiExtractResponseError(data){
  if (data && data.error && typeof data.error.message === 'string' && data.error.message) return data.error.message;
  return null;
}
function aiParseChatData(data, fallbackModel, fallbackUsage){
  const ch0 = data && data.choices && data.choices[0];
  const c = ch0 && ch0.message ? ch0.message.content : null;
  const text = typeof c === 'string' ? c : '';
  const finishReason = (ch0 && ch0.finish_reason) || null;
  const rmodel = (data && data.model) || fallbackModel || null;
  const usage = (data && data.usage) ? data.usage : (fallbackUsage || null);
  let rawJson = null, responseError = null;
  if (!text.trim()){
    try { rawJson = JSON.stringify(data).slice(0, 2000); }
    catch(e){ try { rawJson = String(data).slice(0, 2000); } catch(e2){ rawJson = ''; } }
    responseError = aiExtractResponseError(data);
  }
  return {text, usage, finishReason, model: rmodel, rawJson, responseError};
}
async function aiFakeCall(body, messages, signal, opts){
  const model = opts.model != null ? opts.model : body.model;
  const list = aiSplitFake(opts.fakeResp != null ? opts.fakeResp : aiFakeResp);
  const idx = Math.min(opts.fakeIndex || 0, list.length - 1);
  await aiWait(500, signal);
  const t = list.length ? list[idx].trim() : '';
  if (t.indexOf('!http ') === 0){
    const m = t.match(/^!http\s+(\d+)([\s\S]*)$/);
    if (!m) throw aiHttpError(500, t);
    throw aiHttpError(parseInt(m[1], 10), (m[2] || '').trim());
  }
  if (t === '!empty length')
    return {text: '', usage: aiFakeUsage(body, ''), finishReason: 'length', model, rawJson: null, responseError: null};
  if (t.indexOf('!json') === 0){
    const jsonText = t.slice(5).trim();
    let parsed = null;
    try { parsed = JSON.parse(jsonText); }
    catch(e){
      return {text: '', usage: aiFakeUsage(body, ''), finishReason: null, model, rawJson: jsonText.slice(0, 2000), responseError: null};
    }
    return aiParseChatData(parsed, model, null);
  }
  return {text: list.length ? list[idx] : '', usage: aiFakeUsage(body, list.length ? list[idx] : ''), finishReason: 'stop', model, rawJson: null, responseError: null};
}
async function callAI(messages, signal, opts){
  opts = opts || {};
  const model = opts.model != null ? opts.model : aiModelName;
  const params = opts.params || {};
  const body = aiRequestBody({model, params}, messages);
  if (model.indexOf('test/') === 0) return aiFakeCall(body, messages, signal, opts);
  const key = aiApiKey.trim();
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal
    });
  } catch(err){
    if (err && err.name === 'AbortError') throw err;
    const e2 = new Error('네트워크 오류: ' + ((err && err.message) || err));
    e2.status = null; e2.body = '';
    throw e2;
  }
  if (!res.ok){
    let bodyText = '';
    try { bodyText = await res.text(); } catch(e){}
    throw aiHttpError(res.status, bodyText);
  }
  let data = null;
  try { data = await res.json(); } catch(e){ const e3 = new Error('빈 응답'); e3.status = null; e3.body = ''; throw e3; }
  return aiParseChatData(data, null, null);
}
function aiKeyFp(k){
  const t = String(k == null ? '' : k).trim();
  if (!t) return '(없음)';
  return t.slice(0, 8) + '… (' + t.length + '자)';
}
function aiErrorMessage(body){
  try {
    const d = JSON.parse(body);
    const m = d && d.error && d.error.message;
    return typeof m === 'string' ? m : '';
  } catch(e){ return ''; }
}
function aiGuidance(status, body){
  const msg = aiErrorMessage(body);
  if (status === 401 && /Missing Authentication header/.test(msg)) return '키 앞에 공백이 있거나 키 형식이 이상해요';
  if (status === 401 && /User not found/.test(msg)) return 'OpenRouter 키가 아니거나, 삭제됐거나, 일부만 복사됐어요 (sk-or-v1-로 시작해야 함)';
  if (status === 401 && /No cookie auth credentials found/.test(msg)) return '키가 전송되지 않았어요';
  if (status === 402) return 'OpenRouter 크레딧이 부족해요';
  if (status === 429) return '요청이 너무 많아요. 잠시 후 다시 시도';
  if (status === 400 && /model/i.test(body)) return '모델 이름을 확인해 주세요 (OpenRouter 모델 페이지의 ID를 그대로)';
  if (msg) return 'HTTP ' + status + ' - ' + msg;
  if (status) return 'HTTP ' + status + (body ? ' - ' + String(body).slice(0, 200) : '');
  return '';
}
function aiFormatError(err, modelName){
  const status = err && err.status != null ? err.status : null;
  const body = err && typeof err.body === 'string' ? err.body : '';
  const guide = (status || body) ? aiGuidance(status, body) : String((err && err.message) || err);
  const lines = [
    '[' + new Date().toLocaleString() + '] 실패',
    '모델: ' + (modelName != null ? modelName : (aiModelName || '(없음)')),
    '키: ' + aiKeyFp(aiApiKey)
  ];
  if (status) lines.push('HTTP ' + status);
  if (body) lines.push('본문: ' + body);
  if (guide) lines.push('안내: ' + guide);
  return {status, body, guide, text: lines.join('\n')};
}
function aiErrorToast(m){ toast(m); setTimeout(() => toast(m), 2100); setTimeout(() => toast(m), 4200); }

/* ---------- 참고 이미지 ---------- */
const KEY_AIIMG = 'dot-gongbang.aiimg';
const AI_REF_MAX_SIDE = 512;
const AI_REF_MAX_URL = 1.5 * 1024 * 1024;
let aiRefImg = null;
function aiDataUrlKB(url){
  const s = String(url || '');
  const comma = s.indexOf(',');
  const b64 = comma >= 0 ? s.slice(comma + 1) : s;
  return Math.max(1, Math.round(b64.length * 3 / 4 / 1024));
}
function aiImageLabel(img){
  if (!img) return '';
  return '[참고 이미지: ' + img.name + ' ' + img.w + 'x' + img.h + ', ' + aiDataUrlKB(img.dataUrl) + 'KB]';
}
function aiImageShort(img){
  if (!img) return '';
  return img.name + ' ' + img.w + 'x' + img.h;
}
function aiUserDisplayText(content, img){
  if (typeof content === 'string') return content;
  if (Array.isArray(content)){
    let t = '';
    for (const part of content) if (part && part.type === 'text' && typeof part.text === 'string') t += part.text;
    if (img) t += '\n' + aiImageLabel(img);
    return t;
  }
  return String(content || '');
}
function aiShouldSendImageManual(ctx){
  if (!aiRefImg) return null;
  if (!isMz()) return aiRefImg;
  return mzPatOf(ctx.target) === 1 ? aiRefImg : null;
}
function aiRefBlocked(){
  if (!aiRefImg) return false;
  if (!aiModelName || aiModelName.indexOf('test/') === 0) return false;
  if (!aiModels) return false;
  const e = aiModelEntry(aiModelName);
  if (!e) return false;
  if (!Array.isArray(e.inputModalities)) return false;
  return e.inputModalities.indexOf('image') < 0;
}
function updateAiRefWarn(){
  const w = $('#aiRefWarn');
  if (!w) return;
  const bad = aiRefBlocked();
  w.hidden = !bad;
  if (bad) w.textContent = '이 모델은 이미지를 받을 수 없어요';
}
function aiRenderRefImg(){
  const prev = $('#aiRefPrev'), meta = $('#aiRefMeta'), clear = $('#aiRefClear');
  if (!prev || !meta || !clear) return;
  if (aiRefImg){
    prev.src = aiRefImg.dataUrl;
    prev.hidden = false;
    meta.textContent = aiRefImg.name + ' · ' + aiRefImg.w + 'x' + aiRefImg.h + ' · ' + aiDataUrlKB(aiRefImg.dataUrl) + 'KB';
    clear.hidden = false;
  } else {
    prev.removeAttribute('src');
    prev.hidden = true;
    meta.textContent = '';
    clear.hidden = true;
  }
  updateAiRefWarn();
}
function saveAiRefImg(){
  if (!aiRefImg){ try { localStorage.removeItem(KEY_AIIMG); } catch(e){} return; }
  try { localStorage.setItem(KEY_AIIMG, JSON.stringify({name: aiRefImg.name, w: aiRefImg.w, h: aiRefImg.h, dataUrl: aiRefImg.dataUrl})); }
  catch(e){}
}
function loadAiRefImg(){
  aiRefImg = null;
  try {
    const d = JSON.parse(localStorage.getItem(KEY_AIIMG) || 'null');
    if (d && typeof d.dataUrl === 'string' && d.dataUrl.indexOf('data:image/') === 0 && d.w > 0 && d.h > 0)
      aiRefImg = {name: String(d.name || 'image'), w: d.w | 0, h: d.h | 0, dataUrl: d.dataUrl};
  } catch(e){ aiRefImg = null; }
}
function aiLoadRefFile(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = e => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}
async function aiSetRefFile(file){
  if (!file) return;
  try {
    const img = await aiLoadRefFile(file);
    const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
    if (!sw || !sh){ toast('이미지를 읽지 못했어요'); return; }
    const sc = Math.min(1, AI_REF_MAX_SIDE / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * sc)), h = Math.max(1, Math.round(sh * sc));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.clearRect(0, 0, w, h);
    cx.drawImage(img, 0, 0, w, h);
    let url = cv.toDataURL('image/png');
    if (url.length > AI_REF_MAX_URL){
      const jv = document.createElement('canvas');
      jv.width = w; jv.height = h;
      const jx = jv.getContext('2d');
      jx.fillStyle = '#ffffff'; jx.fillRect(0, 0, w, h);
      jx.drawImage(cv, 0, 0);
      url = jv.toDataURL('image/jpeg', 0.9);
    }
    if (url.length > AI_REF_MAX_URL){ toast('이미지가 너무 커요'); return; }
    aiRefImg = {name: file.name || 'image', w, h, dataUrl: url};
    saveAiRefImg(); aiRenderRefImg();
    if (typeof aiRenderAutoRef === 'function') aiRenderAutoRef();
  } catch(e){ toast('이미지를 읽지 못했어요'); }
}
function aiClearRefImg(){
  aiRefImg = null;
  saveAiRefImg(); aiRenderRefImg();
  const inp = $('#aiRefFile');
  if (inp) inp.value = '';
  if (typeof aiRenderAutoRef === 'function') aiRenderAutoRef();
}

const AI_SYMS = '0123456789abcdefghijklmnopqrstuvwxyz';
const isBlankFrame = f => f.every(v => !v);
function aiTargetName(idx){
  if (isMz()){
    const d = mzDirOf(idx), p = mzPatOf(idx);
    return DIR_NAMES[d] + ' ' + p + (p === 1 ? '(정지)' : '(걷기)');
  }
  return '프레임 ' + (idx + 1);
}
function aiRefName(idx){
  if (isMz()) return DIR_NAMES[mzDirOf(idx)] + ' 정지';
  return '프레임 ' + (idx + 1);
}
function aiContext(target, opts){
  opts = opts || {};
  if (target == null) target = cur;
  const forced = opts.forceCreate != null ? !!opts.forceCreate : $('#aiForceNew').checked;
  const create = forced || isBlankFrame(frames[target]);
  let refs = [];
  if (isMz()){
    const d = mzDirOf(target), p = mzPatOf(target);
    const idle = dd => mzIdx(dd, 1);
    if (d === 0 && p === 1){ refs = []; }
    else if (p === 1){
      if (!isBlankFrame(frames[idle(0)])) refs.push(idle(0));
      if (d !== 1 && !isBlankFrame(frames[idle(1)])) refs.push(idle(1));
    } else {
      if (!isBlankFrame(frames[idle(d)])) refs.push(idle(d));
    }
    refs = refs.filter(i => i !== target);
  } else {
    if (target > 0 && !isBlankFrame(frames[target - 1])) refs = [target - 1];
  }
  if (opts.noRefs) refs = [];
  return {target, create, refs};
}
function updateAiTargetLine(){
  const el = $('#aiTargetLine');
  if (!el || !frames.length) return;
  const c = aiContext();
  el.textContent = '대상: ' + aiTargetName(c.target) + ' · ' + (c.create ? '생성' : '수정')
    + ' · 참고: ' + (c.refs.length ? c.refs.map(aiRefName).join(', ') : '없음');
  const ab = $('#aiAutoBtn');
  if (ab) ab.hidden = !isMz();
}
function aiHexRgb(h){ return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }
function aiBuildShared(framesList){
  const count = new Map();
  for (const f of framesList) for (const c of f){
    if (!c) continue;
    const k = c.toLowerCase();
    count.set(k, (count.get(k) || 0) + 1);
  }
  const sorted = [...count.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const kept = sorted.slice(0, 35);
  const symOf = new Map();
  const palHex = [];
  kept.forEach((hex, i) => { symOf.set(hex, AI_SYMS[i + 1]); palHex.push([AI_SYMS[i + 1], hex]); });
  let reduced = 0;
  if (sorted.length > 35){
    reduced = sorted.length - 35;
    const keptRgb = kept.map(aiHexRgb);
    for (const hex of sorted.slice(35)){
      const c = aiHexRgb(hex);
      let best = 0, bd = 1e9;
      keptRgb.forEach((k2, i) => {
        const d = (c[0]-k2[0])**2 + (c[1]-k2[1])**2 + (c[2]-k2[2])**2;
        if (d < bd){ bd = d; best = i; }
      });
      symOf.set(hex, AI_SYMS[best + 1]);
    }
  }
  return {symOf, palHex, reduced};
}
function aiEncodeGrid(f, n, symOf){
  const rows = [];
  for (let y = 0; y < n; y++){
    let s = '';
    for (let x = 0; x < n; x++){
      const c = f[y * n + x];
      s += c ? (symOf.get(c.toLowerCase()) || '0') : '0';
    }
    rows.push(s);
  }
  return rows;
}
function aiNumbered(rows, n){
  let tens = '    ', ones = '    ';
  for (let x = 0; x < n; x++){ tens += x % 10 === 0 ? String((x / 10) | 0) : ' '; ones += String(x % 10); }
  const out = [tens, ones];
  for (let y = 0; y < n; y++) out.push(String(y).padStart(2, '0') + '| ' + rows[y]);
  return out.join('\n');
}
const AI_SYS_DEFAULT = 'You output ONLY the following format. No explanation, no code fences, no other characters.\n'
  + 'PALETTE\n0 transparent\n1 #rrggbb\n... (keys 0-9a-z, 0 is always transparent, max 35 colors)\nGRID\n{FORMAT}\nEND\n'
  + 'The column ruler at the top of each input grid is only a coordinate reference. Do NOT output it.\n'
  + 'Coordinates: x = column (left 0), y = row (top 0). Colors are lowercase #rrggbb.';
function aiFormatDesc(format, n){
  if (format === 'rle')
    return '(exactly ' + n + ' numbered lines like "07| 0*16 1*4 2*8 0*20". Each line: 2-digit line number 00-'
      + String(n - 1).padStart(2, '0') + ', "| ", then tokens SYMBOL*COUNT joined by single spaces (SYMBOL 0-9a-z from PALETTE, COUNT 1 or more). Token counts per line sum to ' + n + '. Start every line with its 2-digit line number and "| ", the same as the input grids.)';
  if (format === 'numbered')
    return '(exactly ' + n + ' numbered lines like "07| 000011112222...". Each line: 2-digit line number 00-'
      + String(n - 1).padStart(2, '0') + ', "| ", then exactly ' + n + ' grid characters, each one of the keys defined in PALETTE. Start every line with its 2-digit line number and "| ", the same as the input grids.)';
  return '(' + n + ' lines, each exactly ' + n + ' characters, each character one of the keys defined in PALETTE. Do NOT output line numbers like "00| "; they are only coordinate references in the input.)';
}
function aiRenderSys(n, snap){
  const tpl = (snap.sysTemplate || '').trim() ? snap.sysTemplate : AI_SYS_DEFAULT;
  return tpl.split('{N}').join(String(n)).split('{FORMAT}').join(aiFormatDesc(snap.format, n));
}
function aiRefNameEn(idx){
  if (isMz()) return DIR_KEYS[mzDirOf(idx)] + ' standing (pattern 1)';
  return 'frame ' + (idx + 1);
}
function aiAttachedPrefix(n){
  return 'Attached image: the character design to follow. Redraw this character as a ' + n + 'x' + n
    + ' pixel sprite in the required format. Match its hair, face, clothes and main colors;'
    + ' simplify small details so they read at this size. Do not copy the image resolution or background.';
}
function aiBuildMessages(snap, ctx, n, opts){
  snap = snap || aiSnapSettings();
  ctx = ctx || aiContext();
  n = n || N;
  opts = opts || {};
  const flist = [];
  if (!ctx.create) flist.push(frames[ctx.target]);
  for (const r of ctx.refs) flist.push(frames[r]);
  const sh = aiBuildShared(flist);
  const palLines = ['0 transparent'].concat(sh.palHex.map(([s, h]) => s + ' ' + h));
  const fmt = f => 'PALETTE\n' + palLines.join('\n') + '\nGRID\n' + aiNumbered(aiEncodeGrid(f, n, sh.symOf), n) + '\nEND';
  const rawUp = (opts.prompt != null) ? String(opts.prompt) : $('#aiPrompt').value;
  const up = (rawUp.trim() || 'pixel character');
  let u = up + '\nCanvas: ' + n + 'x' + n + ' dot picture.';
  if (isMz()){
    const d = mzDirOf(ctx.target), pat = mzPatOf(ctx.target);
    u += ' RPG Maker MZ walking character, target direction ' + DIR_KEYS[d] + ' (' + DIR_NAMES[d] + '), pattern ' + pat
      + ' (pattern 1 = standing, 0/2 = mid-walk feet apart). Feet touch the bottom of the frame, body centered horizontally.';
  }
  u += ctx.create ? ' Create a NEW picture for the target. Output the full result.'
    : ' Edit the target picture below as requested. Output the full edited result. Keep pixels unrelated to the request unchanged.';
  const blocks = [];
  for (const r of ctx.refs) blocks.push('Reference: ' + aiRefNameEn(r) + '\n' + fmt(frames[r]));
  if (!ctx.create) blocks.push('Target picture:\n' + fmt(frames[ctx.target]));
  if (blocks.length) u += '\n' + blocks.join('\n');
  u += '\nDraw ONE frame only.';
  if (opts.image && opts.image.dataUrl){
    u = aiAttachedPrefix(n) + '\n' + u;
    return {messages: [{role: 'system', content: aiRenderSys(n, snap)}, {role: 'user', content: [{type: 'text', text: u}, {type: 'image_url', image_url: {url: opts.image.dataUrl}}]}], ctx, reduced: sh.reduced, hasImage: true, img: opts.image};
  }
  return {messages: [{role: 'system', content: aiRenderSys(n, snap)}, {role: 'user', content: u}], ctx, reduced: sh.reduced, hasImage: false, img: null};
}
const AI_ROW_PREFIX = /^\s*(\d{1,3})\s*\|\s?/;
function aiFixRowLength(row, n, autoFix, fixes){
  if (row.length === n) return row;
  if (autoFix && row.length >= n - 2 && row.length < n){ fixes.pad++; return row + '0'.repeat(n - row.length); }
  if (autoFix && row.length > n && row.length <= n + 2 && /^0+$/.test(row.slice(n))){ fixes.cut++; return row.slice(0, n); }
  return null;
}
function aiExpandRle(content, pal){
  const toks = content.trim().split(/\s+/).filter(s => s !== '');
  const parts = [];
  for (const tk of toks){
    const m = tk.match(/^([0-9a-z])\*(\d+)$/i);
    if (!m || parseInt(m[2], 10) < 1) return {msg: "토큰 '" + tk + "' 형식 오류"};
    const sym = m[1].toLowerCase();
    if (!pal.has(sym)) return {msg: "PALETTE에 정의되지 않은 기호 '" + m[1] + "'"};
    parts.push({sym, cnt: parseInt(m[2], 10)});
  }
  const sum = parts.reduce((a, p) => a + p.cnt, 0);
  return {row: parts.map(p => p.sym.repeat(p.cnt)).join(''), sum};
}
function aiFixText(fixes){
  const parts = [];
  if (fixes.pad) parts.push('줄 ' + fixes.pad + '개 채움');
  if (fixes.cut) parts.push('줄 ' + fixes.cut + '개 자름');
  if (fixes.filled) parts.push('빠진 줄 ' + fixes.filled + '개');
  if (fixes.ruler) parts.push('눈금 줄 ' + fixes.ruler + '개 무시');
  return parts.length ? '보정: ' + parts.join(', ') : '';
}
function parseAiResponse(text, n, format, autoFix){
  format = format || 'plain';
  const failMany = errs => ({ok: false, reason: errs.slice(0, 5).join(', ') + (errs.length > 5 ? ', ... 외 ' + (errs.length - 5) + '개' : '')});
  const fail = reason => ({ok: false, reason});
  let t = String(text == null ? '' : text).replace(/\r/g, '');
  t = t.split('\n').filter(ln => !ln.trim().startsWith('```')).join('\n').trim();
  if (!t) return fail('PALETTE / GRID 구간을 못 찾음');
  const lines = t.split('\n').map(s => s.replace(/[\t ]+$/, ''));
  const idxOf = kw => lines.findIndex(s => s.trim().toUpperCase() === kw);
  const pi = idxOf('PALETTE'), gi = idxOf('GRID'), ei = idxOf('END');
  if (pi < 0 || gi < 0 || ei < 0 || !(pi < gi && gi < ei)) return fail('PALETTE / GRID 구간을 못 찾음');
  const pal = new Map();
  for (const ln of lines.slice(pi + 1, gi)){
    if (!ln.trim()) continue;
    const parts = ln.trim().split(/\s+/);
    if (parts.length !== 2) return fail('팔레트 줄 형식 오류: ' + ln.trim());
    const k = parts[0].toLowerCase(), v = parts[1];
    if (!/^[0-9a-z]$/.test(k)) return fail("기호가 0-9a-z가 아님: '" + parts[0] + "'");
    if (pal.has(k)) return fail("팔레트 글자 중복: '" + k + "'");
    if (k === '0'){
      if (v.toLowerCase() !== 'transparent') return fail('0이 투명이 아님 (0은 항상 transparent)');
      pal.set(k, 'transparent');
    } else {
      if (!/^#[0-9a-f]{6}$/i.test(v)) return fail('팔레트 색이 #rrggbb 형식이 아님: ' + v);
      pal.set(k, v.toLowerCase());
    }
  }
  if (!pal.has('0')) return fail('PALETTE에 0 transparent가 없음');
  const colorCount = [...pal.keys()].filter(k => k !== '0').length;
  if (colorCount > 35) return fail('팔레트 색이 35개 초과 (' + colorCount + '개)');
  const allRows = lines.slice(gi + 1, ei).filter(s => s.trim() !== '');
  let rulerIgnored = 0;
  const rawRows = [];
  for (const s of allRows){
    if (/^\s/.test(s) && /^[0-9\s]+$/.test(s)){ rulerIgnored++; continue; }
    rawRows.push(s);
  }
  const parsed = rawRows.map(s => {
    const m = s.match(AI_ROW_PREFIX);
    return m ? {num: parseInt(m[1], 10), content: s.slice(m[0].length)} : {num: null, content: s};
  });
  const fixes = {pad: 0, cut: 0, filled: 0, ruler: rulerIgnored};
  const errs = [];
  const grid = new Array(n).fill(null);
  if (format === 'plain'){
    if (rawRows.length !== n) return fail('GRID 줄 수가 ' + n + '이 아님 (' + rawRows.length + '줄)');
    for (let i = 0; i < n; i++){
      const fixed = aiFixRowLength(parsed[i].content, n, autoFix, fixes);
      if (fixed == null) errs.push((i + 1) + '번째 줄 ' + parsed[i].content.length + '글자');
      else grid[i] = fixed;
    }
  } else {
    const seen = {};
    const items = [];
    rawRows.forEach((rr, k) => {
      const p = parsed[k];
      if (p.num == null){ errs.push((k + 1) + '번째 줄에 줄 번호가 없음'); return; }
      if (p.num < 0 || p.num >= n){ errs.push('줄 번호 ' + p.num + '이 0~' + (n - 1) + ' 밖임'); return; }
      if (seen[p.num]){ errs.push('줄 번호 ' + p.num + '이(가) 두 번 나옴'); return; }
      seen[p.num] = true;
      items.push({num: p.num, content: p.content});
    });
    if (errs.length) return failMany(errs);
    const missing = [];
    for (let y = 0; y < n; y++) if (!seen[y]) missing.push(y);
    if (missing.length){
      if (autoFix && missing.length <= 2){
        for (const y of missing){ grid[y] = '0'.repeat(n); fixes.filled++; }
      } else return fail('빠진 줄 번호: ' + missing.join(', '));
    }
    for (const it of items){
      const label = (it.num + 1) + '번째 줄';
      let row = it.content;
      if (format === 'rle'){
        const ex = aiExpandRle(row, pal);
        if (ex.msg){ errs.push(label + ' ' + ex.msg); continue; }
        if (ex.sum === n) grid[it.num] = ex.row;
        else if (autoFix && ex.sum >= n - 2 && ex.sum < n){ grid[it.num] = ex.row + '0'.repeat(n - ex.sum); fixes.pad++; }
        else if (autoFix && ex.sum > n && ex.sum <= n + 2 && /^0*$/.test(ex.row.slice(n))){ grid[it.num] = ex.row.slice(0, n); fixes.cut++; }
        else errs.push(label + ' 합 ' + n + '이 아님 (합 ' + ex.sum + ')');
        continue;
      }
      const fixed = aiFixRowLength(row, n, autoFix, fixes);
      if (fixed == null) errs.push(label + ' ' + row.length + '글자');
      else grid[it.num] = fixed;
    }
  }
  if (errs.length) return failMany(errs);
  const symErrs = [];
  for (let y = 0; y < n; y++){
    const row = grid[y];
    if (row == null) continue;
    for (let x = 0; x < row.length; x++){
      const c = row[x].toLowerCase();
      if (!pal.has(c)) symErrs.push("PALETTE에 정의되지 않은 기호 '" + row[x] + "' 사용 (" + (y + 1) + '번째 줄)');
    }
    if (symErrs.length >= 5) break;
  }
  if (symErrs.length) return failMany(symErrs);
  const frame = new Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){
    const c = grid[y][x].toLowerCase();
    frame[y * n + x] = c === '0' ? '' : pal.get(c);
  }
  const colors = [...pal.entries()].filter(([k]) => k !== '0').map(([, v]) => v).slice(0, 32);
  const fix = aiFixText(fixes);
  return {ok: true, frame, colors, fix: fix || null};
}
let aiLastUsage = null, aiLastReduced = 0, aiSentChars = 0, aiLastFinish = null, aiLastModel = null, aiLastRequestedModel = null, aiLastFix = null;
function aiUsageText(u){
  if (!u || typeof u.prompt_tokens !== 'number' || typeof u.completion_tokens !== 'number') return '토큰 사용량: 알 수 없음';
  return '토큰 사용량: 입력 ' + u.prompt_tokens + ' / 출력 ' + u.completion_tokens;
}
function aiReasoningTokens(u){
  if (!u) return null;
  if (typeof u.reasoning_tokens === 'number') return u.reasoning_tokens;
  const d = u.completion_tokens_details;
  if (d && typeof d.reasoning_tokens === 'number') return d.reasoning_tokens;
  return null;
}
function aiFormatUsd(v){
  if (typeof v !== 'number' || !isFinite(v)) return null;
  if (v === 0) return '$0';
  let s = v.toFixed(12);
  if (s.indexOf('.') >= 0){ s = s.replace(/0+$/, ''); s = s.replace(/\.$/, ''); }
  if (s === '-0') s = '0';
  return '$' + s;
}
function aiFormatCost(costUsd, costEst){
  if (costUsd == null || typeof costUsd !== 'number' || !isFinite(costUsd)) return '알 수 없음';
  const s = aiFormatUsd(costUsd);
  if (!s) return '알 수 없음';
  return s + (costEst ? ' (추정)' : '');
}
function aiCostNumbers(usage, requestedId, actualId){
  if (usage && typeof usage.cost === 'number' && isFinite(usage.cost)) return {costUsd: usage.cost, costEst: false};
  if (usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number'){
    let pr = requestedId ? aiPriceFor(requestedId) : null;
    if (!pr && actualId) pr = aiPriceFor(actualId);
    if (pr) return {costUsd: usage.prompt_tokens * pr.prompt + usage.completion_tokens * pr.completion, costEst: true};
  }
  return {costUsd: null, costEst: false};
}
function aiUsageCostText(usage, requestedId, actualId){
  const c = aiCostNumbers(usage, requestedId || null, actualId || null);
  if (c.costUsd == null) return '비용: 알 수 없음';
  return '비용: ' + aiFormatCost(c.costUsd, c.costEst);
}
function aiCostLine(u){
  const c = aiCostNumbers(u, aiLastRequestedModel, aiLastModel);
  if (c.costUsd == null) return '비용: 알 수 없음';
  return '비용: ' + aiFormatCost(c.costUsd, c.costEst);
}
function setAiDebug(o){
  if (o.sent !== undefined) $('#aiSentText').textContent = o.sent ? String(o.sent).slice(0, 20000) : '아직 보낸 내용이 없어요.';
  if (o.body !== undefined) $('#aiBodyText').textContent = o.body ? String(o.body).slice(0, 20000) : '아직 보낸 요청이 없어요.';
  if (o.raw !== undefined) $('#aiRawText').textContent = o.raw ? String(o.raw).slice(0, 20000) : '아직 응답이 없어요.';
  if (o.err !== undefined){
    const e = $('#aiRawErr');
    if (o.err){ e.hidden = false; e.textContent = o.err; }
    else { e.hidden = true; e.textContent = ''; }
  }
  if (o.usage !== undefined) aiLastUsage = o.usage;
  if (o.reduced !== undefined) aiLastReduced = o.reduced;
  if (o.chars !== undefined) aiSentChars = o.chars;
  if (o.finish !== undefined) aiLastFinish = o.finish;
  if (o.model !== undefined) aiLastModel = o.model;
  if (o.requestedModel !== undefined) aiLastRequestedModel = o.requestedModel;
  if (o.fix !== undefined) aiLastFix = o.fix || null;
  if (o.chars !== undefined || o.usage !== undefined || o.reduced !== undefined || o.finish !== undefined || o.model !== undefined || o.requestedModel !== undefined || o.fix !== undefined){
    const parts = ['보낸 글자 수: ' + aiSentChars];
    if (aiLastReduced > 0) parts.push('색 ' + aiLastReduced + '개를 줄여서 보냄');
    parts.push(aiUsageText(aiLastUsage));
    const rt = aiReasoningTokens(aiLastUsage);
    if (rt != null) parts.push('추론 토큰: ' + rt);
    parts.push(aiCostLine(aiLastUsage));
    if (aiLastFinish) parts.push('finish_reason: ' + aiLastFinish);
    if (aiLastModel) parts.push('실제 모델: ' + aiLastModel);
    if (aiLastFix) parts.push(aiLastFix);
    $('#aiStatsText').textContent = parts.join('\n');
  }
  if (o.err) $('#aiRawDetails').open = true;
}
function updateAiBusyUI(){
  const busyAny = aiBusy || aiAutoRunning;
  const g = $('#aiGenerateBtn');
  g.disabled = busyAny; g.textContent = aiBusy ? '찍는 중…' : '찍기';
  $('#aiCancelBtn').hidden = !aiBusy;
  const ab = $('#aiAutoBtn');
  if (ab) ab.disabled = busyAny;
  const cc = $('#aiCandCancelAll');
  if (cc) cc.hidden = !aiBusy;
  updateAiCandUI();
}
function applyAiFrameTo(target, frame, colors, opts){
  if (!(opts && opts.noUndo)) pushUndo();
  frames[target] = frame;
  importColors = colors.slice(0, 32);
  renderImportColors();
  if (target === cur) commit();
  else { updThumb(target); save(); }
  updateAiTargetLine();
}
const AI_LENGTH_MSG = '출력 토큰이 모자라서 응답이 잘렸어요 (최대 출력 토큰을 늘리거나 추론 강도를 낮춰 보세요)';
async function doAiGenerate(){
  if (aiAutoRunning){ toast('찍는 중이에요. 끝난 뒤 다시 눌러 주세요'); return; }
  if (aiBusy) return;
  const snap = aiSnapSettings();
  const needKey = snap.model.indexOf('test/') !== 0;
  if ((!aiApiKey && needKey) || !snap.model){ toast('AI 설정에서 키와 모델을 입력해 주세요'); $('#aiSettingsDlg').showModal(); return; }
  const ctx = aiContext();
  const target = ctx.target, n = N;
  if (aiRefImg && aiRefBlocked()){ toast('이 모델은 이미지를 받을 수 없어요'); return; }
  const sendImg = aiShouldSendImageManual(ctx);
  const built = aiBuildMessages(snap, ctx, n, sendImg ? {image: sendImg} : null);
  const body = aiRequestBody(snap, built.messages);
  const bodyText = aiBodyText(body);
  const sentFull = 'SYSTEM:\n' + built.messages[0].content + '\n\nUSER:\n' + aiUserDisplayText(built.messages[1].content, built.img);
  const imgShort = aiImageShort(built.img);
  setAiDebug({sent: sentFull, body: bodyText, chars: sentFull.length, raw: '', err: '', usage: null, reduced: built.reduced, finish: null, model: null, requestedModel: snap.model, fix: null});
  if ((snap.candidates | 0) > 1) return aiRunCandidates(snap, ctx, target, n, built, body, sentFull, bodyText);
  aiBusy = true; updateAiBusyUI();
  aiAbort = new AbortController();
  const t0 = Date.now();
  const aiPromptHead = ($('#aiPrompt').value.trim() || '').slice(0, 60);
  try {
    const res = await callAI(built.messages, aiAbort.signal, {model: snap.model, params: snap.params, fakeResp: snap.fakeResp, fakeIndex: 0});
    const emptyRaw = res.rawJson || res.text;
    setAiDebug({raw: res.text.trim() ? res.text : emptyRaw, usage: res.usage, finish: res.finishReason, model: res.model});
    if (res.finishReason === 'length'){
      aiLogCall({snap, ctx, n, i: 0, count: 1, seed: snap.params.seed != null ? snap.params.seed : null, result: {state: 'fail', reason: AI_LENGTH_MSG, usage: res.usage, finish: res.finishReason, model: res.model, raw: emptyRaw}, ms: Date.now() - t0, prompt: aiPromptHead, img: imgShort});
      toast(AI_LENGTH_MSG); setAiDebug({err: AI_LENGTH_MSG}); return;
    }
    if (!res.text.trim()){
      const emptyReason = res.responseError ? '응답 오류: ' + res.responseError : '빈 응답';
      aiLogCall({snap, ctx, n, i: 0, count: 1, seed: snap.params.seed != null ? snap.params.seed : null, result: {state: 'fail', reason: emptyReason, usage: res.usage, finish: res.finishReason, model: res.model, raw: emptyRaw}, ms: Date.now() - t0, prompt: aiPromptHead, img: imgShort});
      toast(emptyReason); setAiDebug({raw: emptyRaw, err: emptyReason}); return;
    }
    const r = parseAiResponse(res.text, n, snap.format, snap.autoFix);
    if (!r.ok){
      aiLogCall({snap, ctx, n, i: 0, count: 1, seed: snap.params.seed != null ? snap.params.seed : null, result: {state: 'fail', reason: r.reason, usage: res.usage, finish: res.finishReason, model: res.model, raw: res.text}, ms: Date.now() - t0, prompt: aiPromptHead, img: imgShort});
      toast(r.reason); setAiDebug({raw: res.text, err: r.reason}); return;
    }
    if (N !== n || !frames[target] || r.frame.length !== N * N){
      aiLogCall({snap, ctx, n, i: 0, count: 1, seed: snap.params.seed != null ? snap.params.seed : null, result: {state: 'fail', reason: '캔버스 크기가 바뀌어서 적용하지 않았어요', usage: res.usage, finish: res.finishReason, model: res.model, raw: res.text}, ms: Date.now() - t0, prompt: aiPromptHead, img: imgShort});
      toast('캔버스 크기가 바뀌어서 적용하지 않았어요'); return;
    }
    applyAiFrameTo(target, r.frame, r.colors);
    setAiDebug({fix: r.fix});
    aiLogCall({snap, ctx, n, i: 0, count: 1, seed: snap.params.seed != null ? snap.params.seed : null, result: {state: 'ok', usage: res.usage, finish: res.finishReason, model: res.model, fix: r.fix, raw: res.text}, ms: Date.now() - t0, prompt: aiPromptHead, img: imgShort});
    toast('AI 그림을 찍었어요' + (r.fix ? ' (' + r.fix + ')' : ''));
  } catch(err){
    if (err && err.name === 'AbortError'){
      aiLogCall({snap, ctx, n, i: 0, count: 1, seed: snap.params.seed != null ? snap.params.seed : null, result: {state: 'cancelled', reason: '취소됨'}, ms: Date.now() - t0, prompt: aiPromptHead, img: imgShort});
      toast('취소했어요');
    }
    else {
      const info = aiFormatError(err, snap.model);
      aiLogCall({snap, ctx, n, i: 0, count: 1, seed: snap.params.seed != null ? snap.params.seed : null, result: {state: 'fail', reason: info.guide || info.text, usage: null, finish: null, model: null, body: info.body}, ms: Date.now() - t0, prompt: aiPromptHead, img: imgShort});
      aiErrorToast('실패: ' + (info.guide || info.text));
      setAiDebug({err: info.text});
    }
  } finally {
    aiBusy = false; aiAbort = null; updateAiBusyUI();
  }
}
$('#aiGenerateBtn').addEventListener('click', doAiGenerate);
function aiCancelAll(){
  if (aiAbort) aiAbort.abort();
  for (const c of aiCandControllers) try { c.abort(); } catch(e){}
}
$('#aiCancelBtn').addEventListener('click', aiCancelAll);
const aiCandCancelAllBtn = $('#aiCandCancelAll');
if (aiCandCancelAllBtn) aiCandCancelAllBtn.addEventListener('click', aiCancelAll);
function aiCandMeta(r){
  const L = ['#' + (r.i + 1)];
  if (r.state === 'wait'){ L.push('대기 중…'); return L.join('\n'); }
  if (r.state === 'cancelled'){ L.push('취소됨'); return L.join('\n'); }
  if (r.state !== 'ok'){ L.push('실패'); if (r.reason) L.push(String(r.reason).slice(0, 200)); return L.join('\n'); }
  L.push('성공');
  if (r.fix) L.push(r.fix);
  const bits = [];
  if (r.usage && typeof r.usage.completion_tokens === 'number') bits.push('출력 ' + r.usage.completion_tokens + '토큰');
  bits.push(aiUsageCostText(r.usage, r.requestedModel || r.model, r.model));
  if (r.ms != null) bits.push(r.ms + 'ms');
  if (r.seed != null) bits.push('seed ' + r.seed);
  if (r.finish) bits.push(r.finish);
  L.push(bits.join(' · '));
  return L.join('\n');
}
function aiRenderCandidates(bundle){
  const grid = $('#aiCandGrid');
  grid.innerHTML = '';
  const info = $('#aiCandInfo');
  const okCount = bundle.results.filter(r => r.state === 'ok').length;
  info.textContent = '대상: ' + aiTargetName(bundle.target) + ' · ' + bundle.results.length + '장 중 ' + okCount + '장 성공';
  bundle.results.forEach(r => {
    const cell = document.createElement('button');
    const applied = bundle.appliedIndex === r.i;
    cell.className = 'cand-cell' + (r.state === 'ok' ? ' pickable' : '') + (applied ? ' applied' : '');
    cell.disabled = r.state !== 'ok';
    const cv = document.createElement('canvas');
    if (r.state === 'ok' && r.frame) drawThumb(cv, r.frame);
    else { cv.width = bundle.n; cv.height = bundle.n; }
    const meta = document.createElement('div');
    meta.className = 'cand-meta';
    meta.textContent = aiCandMeta(r) + (applied ? '\n적용됨' : '');
    cell.append(cv, meta);
    if (r.state === 'ok') cell.addEventListener('click', () => aiApplyCandidate(bundle, r));
    grid.append(cell);
  });
}
function aiApplyCandidate(bundle, r){
  if (!r || r.state !== 'ok' || !r.frame) return;
  if (N !== bundle.n || !frames[bundle.target] || r.frame.length !== N * N){ toast('캔버스 크기가 바뀌어서 적용하지 않았어요'); return; }
  applyAiFrameTo(bundle.target, r.frame, r.colors);
  bundle.appliedIndex = r.i;
  aiRenderCandidates(bundle);
  setAiDebug({fix: r.fix});
  toast('후보 ' + (r.i + 1) + '을(를) 적용했어요' + (r.fix ? ' (' + r.fix + ')' : ''));
}
async function aiRunCandidates(snap, ctx, target, n, built, body, sentFull, bodyText){
  if (aiAutoRunning){ toast('찍는 중이에요. 끝난 뒤 다시 눌러 주세요'); return; }
  if (aiBusy) return;
  aiBusy = true; updateAiBusyUI();
  const count = Math.max(2, Math.min(4, snap.candidates | 0));
  const bundle = {target, n, format: snap.format, autoFix: snap.autoFix, results: [], at: Date.now(), appliedIndex: null};
  for (let i = 0; i < count; i++) bundle.results.push({i, state: 'wait'});
  aiRenderCandidates(bundle);
  $('#aiCandDlg').showModal();
  aiCandControllers = [];
  aiLastCandidates = bundle;
  updateAiCandUI();
  const baseSeed = snap.params.seed;
  await Promise.all(bundle.results.map(async r => {
    const ctl = new AbortController();
    aiCandControllers.push(ctl);
    const t1 = Date.now();
    const seed = baseSeed != null ? baseSeed + r.i : null;
    const params = seed != null ? Object.assign({}, snap.params, {seed}) : snap.params;
    r.requestedModel = snap.model;
    try {
      const res = await callAI(built.messages, ctl.signal, {model: snap.model, params, fakeResp: snap.fakeResp, fakeIndex: r.i});
      r.ms = Date.now() - t1;
      const emptyRaw = res.rawJson || res.text;
      r.usage = res.usage; r.finish = res.finishReason; r.model = res.model; r.seed = seed; r.raw = res.text.trim() ? res.text : emptyRaw;
      if (res.finishReason === 'length'){ r.state = 'fail'; r.reason = AI_LENGTH_MSG; }
      else if (!res.text.trim()){ r.state = 'fail'; r.reason = res.responseError ? '응답 오류: ' + res.responseError : '빈 응답'; }
      else {
        const pr = parseAiResponse(res.text, n, snap.format, snap.autoFix);
        if (!pr.ok){ r.state = 'fail'; r.reason = pr.reason; }
        else { r.state = 'ok'; r.frame = pr.frame; r.colors = pr.colors; r.fix = pr.fix; }
      }
    } catch(err){
      r.ms = Date.now() - t1;
      if (err && err.name === 'AbortError'){ r.state = 'cancelled'; r.reason = '취소됨'; }
      else {
        r.state = 'fail';
        const info = aiFormatError(err, snap.model);
        r.reason = info.guide || info.text;
        r.status = info.status; r.body = info.body;
      }
    }
    aiLogCall({snap, ctx, n, i: r.i, count, seed, result: r, ms: r.ms, prompt: ($('#aiPrompt').value.trim() || '').slice(0, 60), img: aiImageShort(built.img)});
    aiRenderCandidates(bundle);
  }));
  aiCandControllers = [];
  aiBusy = false; updateAiBusyUI();
  updateAiCandUI();
  const okCount = bundle.results.filter(r => r.state === 'ok').length;
  toast('후보 ' + count + '장 중 ' + okCount + '장 성공');
}
$('#aiCandReviewBtn').addEventListener('click', () => {
  if (!aiLastCandidates) return;
  aiRenderCandidates(aiLastCandidates);
  $('#aiCandDlg').showModal();
});
$('#aiCandClose').addEventListener('click', () => $('#aiCandDlg').close());
$('#aiForceNew').addEventListener('change', updateAiTargetLine);
$('#aiCopyPromptBtn').addEventListener('click', async () => {
  const ctx0 = aiContext();
  const img0 = aiShouldSendImageManual(ctx0);
  const built = aiBuildMessages(aiSnapSettings(), ctx0, N, img0 ? {image: img0} : null);
  const full = 'SYSTEM:\n' + built.messages[0].content + '\n\nUSER:\n' + aiUserDisplayText(built.messages[1].content, built.img);
  setAiDebug({sent: full, chars: full.length, reduced: built.reduced});
  try { await navigator.clipboard.writeText(full); toast('보낼 프롬프트를 복사했어요'); }
  catch(e){
    const ta = document.createElement('textarea');
    ta.value = full; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast('보낼 프롬프트를 복사했어요'); }
    catch(e2){ toast('복사하지 못했어요'); }
    ta.remove();
  }
});
$('#aiPasteBtn').addEventListener('click', () => {
  $('#aiPasteFmt').textContent = '형식: ' + (AI_FORMAT_LABEL[aiFormat] || aiFormat);
  $('#aiPasteDlg').showModal();
});
$('#aiPasteCancel').addEventListener('click', () => $('#aiPasteDlg').close());
$('#aiPasteApply').addEventListener('click', () => {
  const text = $('#aiPasteText').value;
  $('#aiPasteDlg').close();
  const target = cur, n = N;
  const r = parseAiResponse(text, n, aiFormat, aiAutoFix);
  if (!r.ok){ toast(r.reason); setAiDebug({raw: text, err: r.reason}); return; }
  if (!frames[target] || r.frame.length !== N * N){ toast('캔버스 크기가 바뀌어서 적용하지 않았어요'); return; }
  setAiDebug({raw: text, err: ''});
  applyAiFrameTo(target, r.frame, r.colors);
  setAiDebug({fix: r.fix});
  toast('붙여넣은 그림을 현재 프레임에 적용했어요' + (r.fix ? ' (' + r.fix + ')' : ''));
});
$('#aiAutoBtn').addEventListener('click', aiOpenAutoSetup);
$('#aiAutoSetupClose').addEventListener('click', () => $('#aiAutoSetupDlg').close());
$('#aiAutoDesc').addEventListener('input', e => { aiAutoDesc = e.target.value; saveAiSettings(); aiUpdateAutoSetup(); });
$('#aiAutoRetry').addEventListener('change', e => {
  let v = parseInt(e.target.value, 10);
  if (!Number.isInteger(v)) v = 2;
  e.target.value = Math.max(0, Math.min(3, v));
});
document.querySelectorAll('input[name="aiAutoRight"]').forEach(r => r.addEventListener('change', aiUpdateAutoSetup));
const aiAutoRefPickBtn = $('#aiAutoRefPick');
if (aiAutoRefPickBtn) aiAutoRefPickBtn.addEventListener('click', () => $('#aiAutoRefFile').click());
const aiAutoRefFileInp = $('#aiAutoRefFile');
if (aiAutoRefFileInp) aiAutoRefFileInp.addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) aiSetRefFile(f);
});
const aiAutoRefClearBtn = $('#aiAutoRefClear');
if (aiAutoRefClearBtn) aiAutoRefClearBtn.addEventListener('click', aiClearRefImg);
$('#aiAutoStart').addEventListener('click', aiRunAuto);
$('#aiAutoStop').addEventListener('click', () => {
  aiAutoStopReq = true;
  if (aiAutoCtl) try { aiAutoCtl.abort(); } catch(e){}
});
$('#aiAutoClose').addEventListener('click', () => $('#aiAutoProgDlg').close());
function aiAutoCloseProg(){
  if (isMz()){
    cur = mzIdx(0, 1);
    renderAll(); save();
  }
}
$('#aiAutoProgDlg').addEventListener('cancel', e => { if (aiAutoRunning) e.preventDefault(); });
$('#aiAutoProgDlg').addEventListener('close', () => {
  if (aiAutoRunning) $('#aiAutoProgDlg').showModal();
  else aiAutoCloseProg();
});

/* ---------- MZ 12장 자동 찍기 ---------- */
const AI_AUTO_POSES = {
  DOWN_STAND: 'Front view facing the viewer, standing still. Both eyes visible, arms at the sides, feet together, nearly left-right symmetric.',
  LEFT_STAND: 'Same character as the reference pictures: same colors, height, head size and outline. Side view facing LEFT, standing still. Only one eye visible, face points left. Feet together.',
  UP_STAND: 'Same character as the reference pictures: same colors, height, head size, body width and outline. Back view, standing still. Face not visible, only the back of the head. Arms at the sides, feet together.',
  RIGHT_STAND: 'Same character as the reference pictures: same colors, height, head size and outline. Side view facing RIGHT, standing still. It should look like the left-facing reference flipped horizontally. Feet together.',
  DOWN_WALK_0: 'Walking pose. Change only the legs and arms: the viewer-left foot steps forward (1 pixel lower), the viewer-right foot steps back (looks shorter). Arms swing slightly opposite to the legs. Keep the head, face and torso pixels unchanged.',
  DOWN_WALK_2: 'Walking pose. Change only the legs and arms: the viewer-right foot steps forward (1 pixel lower), the viewer-left foot steps back (looks shorter). Arms swing slightly opposite to the legs. Keep the head, face and torso pixels unchanged.',
  LEFT_WALK_0: 'Walking pose, side view facing left. Change only the legs and arms: the near leg steps forward (to the left), the far leg steps back (to the right), legs apart. Draw the far leg one shade darker. Arms swing opposite to the legs. Keep the head, face and torso pixels unchanged.',
  LEFT_WALK_2: 'Walking pose, side view facing left. Change only the legs and arms: the far leg steps forward (to the left), the near leg steps back (to the right), legs apart. Draw the far leg one shade darker. Arms swing opposite to the legs. Keep the head, face and torso pixels unchanged.',
  UP_WALK_0: 'Walking pose, back view. Change only the legs and arms: the viewer-left foot steps forward (away from the viewer, looks shorter), the viewer-right foot steps back (sole slightly visible). Arms swing slightly opposite to the legs. Keep the head and torso pixels unchanged.',
  UP_WALK_2: 'Walking pose, back view. Change only the legs and arms: the viewer-right foot steps forward (away from the viewer, looks shorter), the viewer-left foot steps back (sole slightly visible). Arms swing slightly opposite to the legs. Keep the head and torso pixels unchanged.',
  RIGHT_WALK_0: 'Walking pose, side view facing right. Change only the legs and arms: the near leg steps forward (to the right), the far leg steps back (to the left), legs apart. Draw the far leg one shade darker. Arms swing opposite to the legs. Keep the head, face and torso pixels unchanged.',
  RIGHT_WALK_2: 'Walking pose, side view facing right. Change only the legs and arms: the far leg steps forward (to the right), the near leg steps back (to the left), legs apart. Draw the far leg one shade darker. Arms swing opposite to the legs. Keep the head, face and torso pixels unchanged.'
};
function aiFramesEqual(a, b){
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] || '') !== (b[i] || '')) return false;
  return true;
}
function aiAutoRightMode(){
  const r = document.querySelector('input[name="aiAutoRight"]:checked');
  return r && r.value === 'ai' ? 'ai' : 'mirror';
}
function aiAutoExistMode(){
  const r = document.querySelector('input[name="aiAutoExist"]:checked');
  return r && r.value === 'over' ? 'over' : 'skip';
}
function aiAutoRetryN(){
  const v = parseInt(($('#aiAutoRetry') || {}).value, 10);
  return Number.isInteger(v) ? Math.max(0, Math.min(3, v)) : 2;
}
function aiAvgCostFor(model, format){
  let sum = 0, n = 0;
  for (const e of aiLogAll()){
    if ((e.model || '') === (model || '') && (e.format || '') === (format || '')
      && e.costUsd != null && isFinite(Number(e.costUsd))){ sum += Number(e.costUsd); n++; }
  }
  return n ? sum / n : null;
}
function aiRenderAutoRef(){
  const prev = $('#aiAutoRefPrev'), meta = $('#aiAutoRefMeta'), clear = $('#aiAutoRefClear');
  if (!prev || !meta || !clear) return;
  if (aiRefImg){
    prev.src = aiRefImg.dataUrl;
    prev.hidden = false;
    meta.textContent = aiRefImg.name + ' · ' + aiRefImg.w + 'x' + aiRefImg.h + ' · ' + aiDataUrlKB(aiRefImg.dataUrl) + 'KB';
    clear.hidden = false;
  } else {
    prev.removeAttribute('src');
    prev.hidden = true;
    meta.textContent = '';
    clear.hidden = true;
  }
  aiUpdateAutoSetup();
}
function aiUpdateAutoSetup(){
  const desc = $('#aiAutoDesc'), start = $('#aiAutoStart'), info = $('#aiAutoInfo');
  if (!desc || !start || !info) return;
  const hasDesc = desc.value.trim() !== '';
  start.disabled = !(hasDesc || aiRefImg);
  const rightAi = aiAutoRightMode() === 'ai';
  const calls = rightAi ? 12 : 9;
  let t = (rightAi ? 'AI 호출 약 12번' : 'AI 호출 약 9번 (오른쪽도 AI로 찍으면 12번)')
    + ' · 모델: ' + (aiModelName || '(없음)') + ' · 형식: ' + (AI_FORMAT_LABEL[aiFormat] || aiFormat);
  const avg = aiAvgCostFor(aiModelName, aiFormat);
  if (avg != null) t += ' · 예상 비용 약 ' + aiFormatUsd(avg * calls);
  info.textContent = t;
}
function aiOpenAutoSetup(){
  if (!isMz()) return;
  if (aiBusy){ toast('찍는 중이에요. 끝난 뒤 다시 눌러 주세요'); return; }
  if ($('#aiAutoSetupDlg').open) return;
  $('#aiAutoDesc').value = aiAutoDesc.trim() ? aiAutoDesc : $('#aiPrompt').value;
  aiRenderAutoRef();
  aiUpdateAutoSetup();
  $('#aiAutoSetupDlg').showModal();
}
function aiAutoBuildSteps(rightMode){
  const S = (kind, target, poseKey, label, extra) => Object.assign({kind, target, poseKey, label, status: 'wait', ms: null, costUsd: null, costEst: false, retries: 0, reason: ''}, extra || {});
  const steps = [
    S('create', mzIdx(0, 1), 'DOWN_STAND', '아래 정지'),
    S('create', mzIdx(1, 1), 'LEFT_STAND', '왼쪽 정지'),
    S('create', mzIdx(3, 1), 'UP_STAND', '위 정지')
  ];
  if (rightMode === 'ai') steps.push(S('create', mzIdx(2, 1), 'RIGHT_STAND', '오른쪽 정지'));
  steps.push(
    S('edit', mzIdx(0, 0), 'DOWN_WALK_0', '아래 걷기 0'),
    S('edit', mzIdx(0, 2), 'DOWN_WALK_2', '아래 걷기 2'),
    S('edit', mzIdx(1, 0), 'LEFT_WALK_0', '왼쪽 걷기 0'),
    S('edit', mzIdx(1, 2), 'LEFT_WALK_2', '왼쪽 걷기 2'),
    S('edit', mzIdx(3, 0), 'UP_WALK_0', '위 걷기 0'),
    S('edit', mzIdx(3, 2), 'UP_WALK_2', '위 걷기 2')
  );
  if (rightMode === 'ai') steps.push(
    S('edit', mzIdx(2, 0), 'RIGHT_WALK_0', '오른쪽 걷기 0'),
    S('edit', mzIdx(2, 2), 'RIGHT_WALK_2', '오른쪽 걷기 2')
  );
  else steps.push(S('mirror', -1, '', '오른쪽 3칸'));
  return steps;
}
function aiAutoStatusText(st){
  switch (st.status){
    case 'wait': return '대기';
    case 'run': return '진행 중';
    case 'ok': return st.retries > 0 ? '성공(재시도 ' + st.retries + '번)' : '성공';
    case 'skip': return '건너뜀';
    case 'mirror': return '반전';
    case 'fail': return '실패' + (st.reason ? ' · ' + st.reason : '');
    case 'failstop': return '앞 단계 실패로 중단';
    case 'stop': return '중지됨';
    default: return st.status;
  }
}
function aiFmtSec(ms){
  if (ms == null) return '';
  return (Math.round(ms / 100) / 10).toFixed(1) + '초';
}
function aiFmtElapsed(ms){
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return (Math.round(ms / 100) / 10).toFixed(1) + '초';
  return ((s / 60) | 0) + '분 ' + (s % 60) + '초';
}
function aiAutoCostText(st){
  if (st.costUsd == null || !isFinite(st.costUsd)) return '알 수 없음';
  return aiFormatCost(st.costUsd, st.costEst);
}
function aiAutoRenderList(steps){
  const list = $('#aiAutoProgList');
  if (!list) return;
  list.innerHTML = '';
  for (const st of steps){
    const row = document.createElement('div');
    row.className = 'auto-step';
    const cv = document.createElement('canvas');
    if (st.kind === 'mirror') drawThumb(cv, frames[mzIdx(2, 1)] || blank(48));
    else if (st.target >= 0 && frames[st.target]) drawThumb(cv, frames[st.target]);
    else { cv.width = 48; cv.height = 48; }
    const t = document.createElement('div');
    t.className = 't';
    const kind = st.kind === 'create' ? '생성' : (st.kind === 'edit' ? '수정' : '반전');
    let line = st.label + ' · ' + kind + ' · ' + aiAutoStatusText(st);
    if (st.status === 'ok'){
      line += ' · ' + aiFmtSec(st.ms) + ' · ' + aiAutoCostText(st);
    }
    t.textContent = line;
    row.append(cv, t);
    list.append(row);
  }
}
function aiAutoRenderSum(steps, t0, totalCost, anyEst){
  const el = $('#aiAutoProgSum');
  if (!el) return;
  const done = steps.filter(s => ['ok', 'skip', 'mirror', 'fail', 'failstop', 'stop'].indexOf(s.status) >= 0).length;
  let t = done + ' / ' + steps.length + ' 단계 · 경과 ' + aiFmtElapsed(Date.now() - t0);
  if (totalCost != null) t += ' · 누적 비용 ' + aiFormatCost(totalCost, anyEst) + (anyEst ? ' (추정 포함)' : '');
  else t += ' · 누적 비용 알 수 없음';
  el.textContent = t;
}
let aiAutoRunning = false, aiAutoStopReq = false, aiAutoCtl = null;
function aiAutoClassifyThrow(err){
  if (err && err.name === 'AbortError') return 'abort';
  const status = err && err.status != null ? err.status : null;
  if (status == null) return 'retry';
  if (status === 429 || status >= 500) return 'retry';
  return 'fatal';
}
async function aiRunAuto(){
  if (aiAutoRunning) return;
  if (aiBusy){ toast('찍는 중이에요. 끝난 뒤 다시 눌러 주세요'); return; }
  if (!isMz() || N !== 48){ toast('MZ 캐릭터 모드에서만 쓸 수 있어요'); return; }
  if (aiRefImg && aiRefBlocked()){ toast('이 모델은 이미지를 받을 수 없어요'); return; }
  const descRaw = $('#aiAutoDesc').value;
  const desc = descRaw.trim();
  if (!desc && !aiRefImg) return;
  aiAutoDesc = descRaw;
  saveAiSettings();
  const snap = aiSnapSettings();
  const needKey = snap.model.indexOf('test/') !== 0;
  if ((!aiApiKey && needKey) || !snap.model){ toast('AI 설정에서 키와 모델을 입력해 주세요'); return; }
  const rightMode = aiAutoRightMode(), existMode = aiAutoExistMode(), maxRetry = aiAutoRetryN();
  const steps = aiAutoBuildSteps(rightMode);
  const total = steps.length;
  $('#aiAutoSetupDlg').close();
  aiAutoRunning = true; aiAutoStopReq = false;
  updateAiBusyUI();
  $('#aiAutoStop').hidden = false;
  $('#aiAutoClose').hidden = true;
  $('#aiAutoProgDlg').showModal();
  pushUndo();
  const t0 = Date.now();
  let callNo = 0, totalCost = 0, costKnown = false, anyEst = false, stopped = false, failed = false;
  aiAutoRenderList(steps);
  aiAutoRenderSum(steps, t0, null, false);
  const baseSeed = snap.params.seed;
  for (let i = 0; i < steps.length; i++){
    const st = steps[i];
    if (aiAutoStopReq){ st.status = 'stop'; continue; }
    if (failed){ st.status = 'failstop'; continue; }
    if (existMode === 'skip'){
      if (st.kind === 'create' && !isBlankFrame(frames[st.target])){ st.status = 'skip'; aiAutoRenderList(steps); aiAutoRenderSum(steps, t0, costKnown ? totalCost : null, anyEst); continue; }
      if (st.kind === 'edit'){
        const idlePic = frames[mzIdx(mzDirOf(st.target), 1)];
        if (!isBlankFrame(frames[st.target]) && !aiFramesEqual(frames[st.target], idlePic)){ st.status = 'skip'; aiAutoRenderList(steps); aiAutoRenderSum(steps, t0, costKnown ? totalCost : null, anyEst); continue; }
      }
    }
    if (st.kind === 'mirror'){
      let applied = 0;
      for (let p = 0; p < 3; p++){
        if (existMode === 'skip' && !isBlankFrame(frames[mzIdx(2, p)])) continue;
        frames[mzIdx(2, p)] = flipFrameH(frames[mzIdx(1, p)], 48);
        applied++;
      }
      st.status = applied ? 'mirror' : 'skip';
      renderAll(); save();
      aiAutoRenderList(steps); aiAutoRenderSum(steps, t0, costKnown ? totalCost : null, anyEst);
      continue;
    }
    // create / edit 호출
    st.status = 'run';
    aiAutoRenderList(steps);
    const target = st.target, n = 48;
    const pose = AI_AUTO_POSES[st.poseKey];
    const prompt = desc ? desc + '\n' + pose : pose;
    let backup = null;
    if (st.kind === 'edit') backup = frames[target].slice();
    const t1 = Date.now();
    let attempt = 0, done = false;
    const imgShort = (st.kind === 'create' && aiRefImg) ? aiImageShort(aiRefImg) : '';
    const autoTag = '자동 ' + (i + 1) + '/' + total;
    while (attempt <= maxRetry && !done){
      if (aiAutoStopReq){
        if (backup){ frames[target] = backup; if (target === cur) drawEditor(); updThumb(target); }
        st.status = 'stop'; stopped = true; done = true; break;
      }
      if (st.kind === 'edit') frames[target] = frames[mzIdx(mzDirOf(target), 1)].slice();
      const ctx = aiContext(target, st.kind === 'create' ? {forceCreate: true} : {forceCreate: false, noRefs: true});
      const sendImg = (st.kind === 'create' && aiRefImg) ? aiRefImg : null;
      const built = aiBuildMessages(snap, ctx, n, {prompt, image: sendImg || undefined});
      const body = aiRequestBody(snap, built.messages);
      const userText = aiUserDisplayText(built.messages[1].content, built.img);
      const sentFull = 'SYSTEM:\n' + built.messages[0].content + '\n\nUSER:\n' + userText;
      setAiDebug({sent: sentFull, body: aiBodyText(body), chars: sentFull.length, raw: '', err: '', usage: null, reduced: built.reduced, finish: null, model: null, requestedModel: snap.model, fix: null});
      const params = Object.assign({}, snap.params);
      if (baseSeed != null) params.seed = baseSeed + attempt;
      const seed = params.seed != null ? params.seed : null;
      aiAutoCtl = new AbortController();
      const tag = autoTag + (attempt > 0 ? ' 재시도 ' + attempt : '');
      try {
        const res = await callAI(built.messages, aiAutoCtl.signal, {model: snap.model, params, fakeResp: snap.fakeResp, fakeIndex: callNo++});
        const emptyRaw = res.rawJson || res.text;
        setAiDebug({raw: res.text.trim() ? res.text : emptyRaw, usage: res.usage, finish: res.finishReason, model: res.model});
        if (res.finishReason === 'length'){
          st.reason = AI_LENGTH_MSG;
          aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'fail', reason: AI_LENGTH_MSG, usage: res.usage, finish: res.finishReason, model: res.model, raw: emptyRaw}, ms: Date.now() - t1, prompt: st.poseKey, img: imgShort, auto: tag});
          toast(AI_LENGTH_MSG); setAiDebug({err: AI_LENGTH_MSG});
          st.status = 'fail'; failed = true; done = true;
          if (backup){ frames[target] = backup; if (target === cur) drawEditor(); updThumb(target); }
        } else if (!res.text.trim()){
          const er = res.responseError ? '응답 오류: ' + res.responseError : '빈 응답';
          if (attempt < maxRetry){
            aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'fail', reason: er, usage: res.usage, finish: res.finishReason, model: res.model, raw: emptyRaw}, ms: Date.now() - t1, prompt: st.poseKey, img: imgShort, auto: tag});
            attempt++;
          } else {
            aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'fail', reason: er, usage: res.usage, finish: res.finishReason, model: res.model, raw: emptyRaw}, ms: Date.now() - t1, prompt: st.poseKey, img: imgShort, auto: tag});
            toast(er); setAiDebug({raw: emptyRaw, err: er});
            st.status = 'fail'; st.reason = er; failed = true; done = true;
            if (backup){ frames[target] = backup; if (target === cur) drawEditor(); updThumb(target); }
          }
        } else {
          const r = parseAiResponse(res.text, n, snap.format, snap.autoFix);
          if (!r.ok){
            if (attempt < maxRetry){
              aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'fail', reason: r.reason, usage: res.usage, finish: res.finishReason, model: res.model, raw: res.text}, ms: Date.now() - t1, prompt: st.poseKey, img: imgShort, auto: tag});
              attempt++;
            } else {
              aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'fail', reason: r.reason, usage: res.usage, finish: res.finishReason, model: res.model, raw: res.text}, ms: Date.now() - t1, prompt: st.poseKey, img: imgShort, auto: tag});
              toast(r.reason); setAiDebug({raw: res.text, err: r.reason});
              st.status = 'fail'; st.reason = r.reason; failed = true; done = true;
              if (backup){ frames[target] = backup; if (target === cur) drawEditor(); updThumb(target); }
            }
          } else if (!isMz() || N !== 48){
            aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'fail', reason: '모드나 캔버스가 바뀌어서 중단했어요', usage: res.usage, finish: res.finishReason, model: res.model, raw: res.text}, ms: Date.now() - t1, prompt: st.poseKey, img: imgShort, auto: tag});
            st.status = 'fail'; st.reason = '모드나 캔버스가 바뀌어서 중단했어요'; failed = true; done = true;
            if (backup){ frames[target] = backup; if (target === cur) drawEditor(); updThumb(target); }
          } else {
            applyAiFrameTo(target, r.frame, r.colors, {noUndo: true});
            save();
            setAiDebug({fix: r.fix});
            st.ms = Date.now() - t1; st.retries = attempt;
            const ci = aiCostNumbers(res.usage, snap.model, res.model);
            if (ci.costUsd != null && isFinite(ci.costUsd)){ st.costUsd = ci.costUsd; st.costEst = !!ci.costEst; totalCost += ci.costUsd; costKnown = true; if (ci.costEst) anyEst = true; }
            aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'ok', usage: res.usage, finish: res.finishReason, model: res.model, fix: r.fix, raw: res.text}, ms: st.ms, prompt: st.poseKey, img: imgShort, auto: tag});
            st.status = 'ok'; done = true;
          }
        }
      } catch(err){
        const kind = aiAutoClassifyThrow(err);
        if (kind === 'abort'){
          aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'cancelled', reason: '취소됨'}, ms: Date.now() - t1, prompt: st.poseKey, img: imgShort, auto: autoTag + (attempt > 0 ? ' 재시도 ' + attempt : '')});
          if (backup){ frames[target] = backup; if (target === cur) drawEditor(); updThumb(target); }
          st.status = 'stop'; stopped = true; done = true;
        } else if (kind === 'retry' && attempt < maxRetry){
          const info = aiFormatError(err, snap.model);
          aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'fail', reason: info.guide || info.text, usage: null, finish: null, model: null, body: info.body}, ms: Date.now() - t1, prompt: st.poseKey, img: imgShort, auto: tag});
          const wait = (err.status == null || err.status === 429 || (err.status >= 500 && err.status <= 599));
          attempt++;
          if (wait && !aiAutoStopReq){
            try { await aiWait(2000, aiAutoCtl.signal); }
            catch(e2){
              aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'cancelled', reason: '취소됨'}, ms: Date.now() - t1, prompt: st.poseKey, img: imgShort, auto: autoTag});
              if (backup){ frames[target] = backup; if (target === cur) drawEditor(); updThumb(target); }
              st.status = 'stop'; stopped = true; done = true;
            }
          }
        } else {
          const info = aiFormatError(err, snap.model);
          aiLogCall({snap, ctx, n, i: 0, count: 1, seed, result: {state: 'fail', reason: info.guide || info.text, usage: null, finish: null, model: null, body: info.body}, ms: Date.now() - t1, prompt: st.poseKey, img: imgShort, auto: tag});
          aiErrorToast('실패: ' + (info.guide || info.text));
          setAiDebug({err: info.text});
          if (backup){ frames[target] = backup; if (target === cur) drawEditor(); updThumb(target); }
          st.status = 'fail'; st.reason = info.guide || info.text; failed = true; done = true;
        }
      }
    }
    if (aiAutoStopReq && st.status === 'run') st.status = 'stop';
    if (st.status === 'run'){ st.status = 'stop'; stopped = true; }
    aiAutoRenderList(steps);
    aiAutoRenderSum(steps, t0, costKnown ? totalCost : null, anyEst);
    if (stopped){
      for (let j = i + 1; j < steps.length; j++) steps[j].status = 'stop';
      aiAutoRenderList(steps);
      aiAutoRenderSum(steps, t0, costKnown ? totalCost : null, anyEst);
      break;
    }
    if (failed){
      for (let j = i + 1; j < steps.length; j++) steps[j].status = 'failstop';
      aiAutoRenderList(steps);
      aiAutoRenderSum(steps, t0, costKnown ? totalCost : null, anyEst);
      break;
    }
  }
  aiAutoCtl = null;
  aiAutoRunning = false;
  updateAiBusyUI();
  const okN = steps.filter(s => s.status === 'ok').length;
  $('#aiAutoStop').hidden = true;
  $('#aiAutoClose').hidden = false;
  aiAutoRenderList(steps);
  aiAutoRenderSum(steps, t0, costKnown ? totalCost : null, anyEst);
  if (stopped) toast('자동 찍기를 중지했어요');
  else if (failed) toast('자동 찍기가 실패로 멈췄어요');
  else toast('자동 찍기 끝! ' + okN + '/' + total + ' 단계 성공');
}

/* ---------- 실험 기록 ---------- */
const KEY_AILOG = 'dot-gongbang.ailog';
const KEY_AIRAW = 'dot-gongbang.airaw';
let aiLogSeq = 0, aiLogCache = null, aiRawCache = null;
function aiLsSet(key, arr){
  for (let k = 0; k < 8; k++){
    try { localStorage.setItem(key, JSON.stringify(arr)); return; }
    catch(e){
      if (arr.length <= 1){ try { localStorage.removeItem(key); } catch(e2){} return; }
      arr.splice(0, Math.max(1, (arr.length / 4) | 0));
    }
  }
}
function aiLogAll(){
  if (!aiLogCache){
    try { aiLogCache = JSON.parse(localStorage.getItem(KEY_AILOG) || '[]') || []; }
    catch(e){ aiLogCache = []; }
    if (!Array.isArray(aiLogCache)) aiLogCache = [];
    for (const e of aiLogCache){
      if (e && e.costUsd === undefined){
        let v = null, est = false;
        if (typeof e.cost === 'string'){
          est = /추정/.test(e.cost);
          const m = /\$\s*([0-9.+\-eE]+)/.exec(e.cost);
          if (m){
            const n = Number(m[1]);
            if (isFinite(n)) v = n;
          }
        }
        e.costUsd = v;
        e.costEst = !!est;
        if ('cost' in e) delete e.cost;
      } else if (e && e.costEst === undefined){
        e.costEst = false;
      }
    }
  }
  return aiLogCache;
}
function aiRawAll(){
  if (!aiRawCache){
    try { aiRawCache = JSON.parse(localStorage.getItem(KEY_AIRAW) || '[]') || []; }
    catch(e){ aiRawCache = []; }
    if (!Array.isArray(aiRawCache)) aiRawCache = [];
  }
  return aiRawCache;
}
function aiLogRaw(id, text){
  const arr = aiRawAll();
  arr.push({id, text: String(text == null ? '' : text).slice(0, 20000)});
  while (arr.length > 20) arr.shift();
  aiLsSet(KEY_AIRAW, arr);
}
function aiRawGet(id){
  const arr = aiRawAll();
  for (const r of arr) if (r.id === id) return r.text;
  return null;
}
function aiLogCall(o){
  try {
    const r = o.result || {};
    const p = (o.snap && o.snap.params) || {};
    const u = r.usage || null;
    const rt = aiReasoningTokens(u);
    const reqModel = (o.snap && o.snap.model) || '';
    const costInfo = aiCostNumbers(u, reqModel, r.model || '');
    const entry = {
      id: 'L' + Date.now().toString(36) + (aiLogSeq++),
      at: new Date().toLocaleString(),
      model: reqModel,
      actual: r.model || '',
      format: (o.snap && o.snap.format) || '',
      reasoning: p.reasoning || '',
      maxTokens: p.maxTokens != null ? p.maxTokens : '',
      temperature: p.temperature != null ? p.temperature : '',
      seed: o.seed != null ? o.seed : (p.seed != null ? p.seed : ''),
      sysCustom: !!(o.snap && o.snap.sysTemplate && o.snap.sysTemplate.trim()),
      target: aiTargetName(o.ctx.target),
      mode: o.ctx.create ? '생성' : '수정',
      cand: o.count > 1 ? (o.i + 1) + '/' + o.count : '',
      prompt: (o.prompt || '').slice(0, 60),
      status: r.state === 'ok' ? '성공' : (r.state === 'cancelled' ? '취소' : '실패'),
      reason: r.state === 'ok' ? '' : (r.reason || ''),
      fix: r.fix || '',
      finish: r.finish || '',
      inTok: u && u.prompt_tokens != null ? u.prompt_tokens : '',
      outTok: u && u.completion_tokens != null ? u.completion_tokens : '',
      reTok: rt != null ? rt : '',
      costUsd: costInfo.costUsd,
      costEst: !!costInfo.costEst,
      ms: o.ms != null ? o.ms : '',
      img: o.img || '',
      auto: o.auto || ''
    };
    const arr = aiLogAll();
    arr.push(entry);
    while (arr.length > 200) arr.shift();
    aiLsSet(KEY_AILOG, arr);
    aiLogRaw(entry.id, r.raw != null ? r.raw : (r.body || ''));
  } catch(e){}
}
const AI_LOG_COLS = ['시각', '모델', '실제 모델', '형식', '추론', 'max', 'temp', 'seed', 'sys', '대상', '생성/수정', '후보', '프롬프트', '결과', '이유', '보정', 'finish', '입력', '출력', '추론', '비용', '시간(ms)', '참고 이미지', '자동'];
function aiLogRow(e){
  return [e.at, e.model, e.actual, e.format, e.reasoning, e.maxTokens, e.temperature, e.seed,
    e.sysCustom ? '수정' : '기본', e.target, e.mode, e.cand, e.prompt, e.status, e.reason, e.fix,
    e.finish, e.inTok, e.outTok, e.reTok, aiFormatCost(e.costUsd, e.costEst), e.ms, e.img || '', e.auto || ''];
}
function aiCsvRow(e){
  return [e.at, e.model, e.actual, e.format, e.reasoning, e.maxTokens, e.temperature, e.seed,
    e.sysCustom ? '수정' : '기본', e.target, e.mode, e.cand, e.prompt, e.status, e.reason, e.fix,
    e.finish, e.inTok, e.outTok, e.reTok,
    (e.costUsd != null && isFinite(e.costUsd) ? String(e.costUsd) : ''), (e.costEst ? '예' : '아니오'), e.ms, e.img || '', e.auto || ''];
}
const AI_CSV_COLS = ['시각', '모델', '실제 모델', '형식', '추론', 'max', 'temp', 'seed', 'sys', '대상', '생성/수정', '후보', '프롬프트', '결과', '이유', '보정', 'finish', '입력', '출력', '추론', '비용($)', '비용 추정', '시간(ms)', '참고 이미지', '자동'];
function aiLogSummary(){
  const arr = aiLogAll();
  if (!arr.length) return '기록이 없어요.';
  const groups = {};
  for (const e of arr){
    const k = (e.model || '?') + '+' + (e.format || '?');
    const g = groups[k] || (groups[k] = {ok: 0, n: 0, cost: 0, costN: 0, ms: 0, msN: 0});
    g.n++;
    if (e.status === '성공') g.ok++;
    if (e.costUsd != null && isFinite(Number(e.costUsd))){ g.cost += Number(e.costUsd); g.costN++; }
    else if (typeof e.cost === 'string'){
      const m = /\$\s*([0-9.+\-eE]+)/.exec(e.cost);
      if (m){ const n = Number(m[1]); if (isFinite(n)){ g.cost += n; g.costN++; } }
    }
    if (e.ms !== '' && e.ms != null && !isNaN(Number(e.ms))){ g.ms += Number(e.ms); g.msN++; }
  }
  const parts = Object.keys(groups).map(k => {
    const g = groups[k];
    return k + ': 성공 ' + g.ok + '/전체 ' + g.n
      + ', 평균 ' + (g.costN ? aiFormatUsd(g.cost / g.costN) : '-')
      + ', 평균 ' + (g.msN ? Math.round(g.ms / g.msN) + 'ms' : '-');
  });
  const okAll = arr.filter(e => e.status === '성공').length;
  return '총 ' + arr.length + '건 · 성공 ' + okAll + '건 / ' + parts.join(' / ');
}
function aiRenderLog(){
  $('#aiLogSummary').textContent = aiLogSummary();
  const tb = $('#aiLogBody');
  tb.innerHTML = '';
  const arr = aiLogAll().slice().reverse();
  for (const e of arr){
    const tr = document.createElement('tr');
    for (const v of aiLogRow(e)){
      const td = document.createElement('td');
      td.textContent = v == null ? '' : String(v);
      tr.append(td);
    }
    const td = document.createElement('td');
    if (aiRawGet(e.id) != null){
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = '원문'; b.style.minHeight = '28px'; b.style.fontSize = '12px';
      b.addEventListener('click', () => {
        $('#aiRawView').textContent = aiRawGet(e.id) || '(없음)';
        $('#aiRawDlg').showModal();
      });
      td.append(b);
    }
    tr.append(td);
    tb.append(tr);
  }
}
function aiCsvCell(v){
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
$('#aiLogBtn').addEventListener('click', () => { aiRenderLog(); $('#aiLogDlg').showModal(); });
$('#aiLogClose').addEventListener('click', () => $('#aiLogDlg').close());
$('#aiRawClose').addEventListener('click', () => $('#aiRawDlg').close());
$('#aiLogClear').addEventListener('click', () => {
  if (!confirm('실험 기록을 모두 지울까요?')) return;
  aiLogCache = []; aiRawCache = [];
  try { localStorage.removeItem(KEY_AILOG); } catch(e){}
  try { localStorage.removeItem(KEY_AIRAW); } catch(e){}
  aiRenderLog();
});
$('#aiLogCsv').addEventListener('click', () => {
  const head = AI_CSV_COLS.concat(['원문id']).map(aiCsvCell).join(',');
  const lines = aiLogAll().map(e => aiCsvRow(e).concat([e.id]).map(aiCsvCell).join(','));
  saveFile('ai-log.csv', new Blob(['﻿' + head + '\n' + lines.join('\n')], {type: 'text/csv'}));
});

