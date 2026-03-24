// ═══════════════════════════════════════════
// engine.js — Leitner 3-box trainer engine
// Topic-agnostic. Reads window.COURSE from data.js.
//
// COURSE contract:
//   .saveKey          — localStorage key
//   .sessionLen       — questions per session
//   .streakNeeded     — correct in a row to advance box
//   .stages[]         — [{id, label}]
//   .getAllSkillKeys() — returns all skill key strings
//   .getStageSkillKeys(stageId) — returns keys for one stage
//   .makeExercise(skillKey, box) — returns exercise object
//   .renderStudy(container, helpers) — builds study tab content
//   .faqHtml          — FAQ modal content
//   .ui.title, .ui.subtitle, .ui.startPoints[], .ui.infoText
// ═══════════════════════════════════════════

// ══ HELPERS (global — used by data.js at runtime) ══
function $(id){ return document.getElementById(id); }
function shuffle(a){ const b=[...a]; for(let i=b.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]; } return b; }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function normalize(s){ return String(s||'').toLowerCase().replace(/[?.!,]/g,'').replace(/\s+/g,' ').trim(); }
function showScr(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); }
function showToast(text){ const t=$('toast'); t.textContent=text; t.classList.add('show'); clearTimeout(showToast._t); showToast._t=setTimeout(()=>t.classList.remove('show'),1600); }

// ══ AUDIO ══
let currentAudio = null, audioGen = 0;

function getAudioFile(text){
  let name = text.toLowerCase().trim().replace(/[?.!,]/g,'').trim()
    .replace(/[^a-zõäöü0-9\s]/g,'').replace(/\s+/g,'_').trim();
  return 'audio/' + name + '.mp3';
}

function playAudio(text){
  stopAudio();
  const gen = ++audioGen;
  return new Promise(resolve => {
    const a = new Audio(getAudioFile(text));
    currentAudio = a;
    const done = () => { if(gen === audioGen) currentAudio = null; resolve(); };
    a.onended = done;
    a.onerror = done;
    a.play().catch(done);
  });
}

function stopAudio(){
  if(currentAudio){
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio = null;
  }
}

// ═══════════════════════════════════════════
// ══ LEITNER STATE ══
// ═══════════════════════════════════════════
let skillState = {}, currentStage = 1;
let correct = 0, wrong = 0, streak = 0, best = 0, qNum = 0;
let ans = false, curEx = null;

function makeSkill(){ return { box:0, streak:0, totalCorrect:0, totalWrong:0 }; }

function initSkills(){
  skillState = {};
  COURSE.getAllSkillKeys().forEach(key => { skillState[key] = makeSkill(); });
}

// ══ STAGE HELPERS ══
function getStage(id){ return COURSE.stages.find(s => s.id === id) || COURSE.stages[0]; }
function getStageSkillKeys(sid){ return COURSE.getStageSkillKeys(sid || currentStage); }
function getStageSkills(sid){ return getStageSkillKeys(sid || currentStage).map(k => [k, skillState[k]]).filter(([_, s]) => s); }
function getStageMastered(sid){ return getStageSkills(sid).filter(([_, s]) => s.box >= 2).length; }
function getStageTotal(sid){ return getStageSkillKeys(sid || currentStage).length; }
function isStageComplete(sid){ return getStageMastered(sid) === getStageTotal(sid); }
function getMaxUnlockedStage(){
  for(let i = COURSE.stages.length; i >= 1; i--){
    if(i === 1) return 1;
    if(isStageComplete(i - 1)) return i;
  }
  return 1;
}

// ══ SAVE / LOAD ══
function saveProgress(){
  try { localStorage.setItem(COURSE.saveKey, JSON.stringify({ skillState, currentStage, ts: Date.now() })); } catch(e){}
}

function loadProgress(){
  try {
    const raw = localStorage.getItem(COURSE.saveKey);
    if(!raw) return null;
    const d = JSON.parse(raw);
    if(!d.skillState) return null;
    Object.values(d.skillState).forEach(sk => {
      if(sk.box === undefined) sk.box = sk.level || 0;
      if(sk.streak === undefined) sk.streak = 0;
      if(sk.totalCorrect === undefined) sk.totalCorrect = 0;
      if(sk.totalWrong === undefined) sk.totalWrong = 0;
    });
    return d;
  } catch(e){ return null; }
}

// ══ SKILL PICKER ══
function pickSkill(){
  const entries = getStageSkills();
  const box0 = entries.filter(([_, s]) => s.box === 0);
  const box1 = entries.filter(([_, s]) => s.box === 1);
  const box2 = entries.filter(([_, s]) => s.box === 2);
  const pool = box0.length ? box0 : box1.length ? box1 : box2.length ? box2 : null;
  if(!pool) return null;
  const weighted = [];
  pool.forEach(([key, s]) => {
    const w = Math.max(1, 1 + s.totalWrong - s.totalCorrect);
    for(let i = 0; i < w; i++) weighted.push(key);
  });
  return weighted[Math.floor(Math.random() * weighted.length)];
}

// ═══════════════════════════════════════════
// ══ GAME FLOW ══
// ═══════════════════════════════════════════
function startGame(){
  correct = 0; wrong = 0; best = 0; streak = 0; qNum = 0; ans = false; curEx = null;
  $('resultBarFill').style.width = '0%';
  closePauseModal(); showScr('gameScreen'); nextQ();
}

function nextQ(){
  if(qNum >= COURSE.sessionLen){ showResults(); return; }
  const sk = pickSkill();
  if(!sk){ showResults(); return; }
  const box = skillState[sk] ? skillState[sk].box : 0;
  curEx = COURSE.makeExercise(sk, box);
  qNum++; renderEx();
}

function renderEx(){
  ans = false;
  const ex = curEx;
  const card = $('questionCard');
  card.classList.remove('animate-in'); void card.offsetWidth; card.classList.add('animate-in');
  $('correctReveal').textContent = '';
  $('nextBtn').style.display = 'none';
  $('qHint').textContent = '';
  $('exerciseTypeLabel').textContent = ex.label || 'Задание';
  $('qText').textContent = ex.qText || '';
  if(ex.qRu && ex.qRu.length > 0){ $('qRu').textContent = ex.qRu; $('qRu').style.display = ''; }
  else { $('qRu').style.display = 'none'; }
  $('exerciseArea').innerHTML = '';
  stopAudio(); hideReplayBtn();
  if(ex.type === 'choice') renderChoice(ex);
  if(ex.type === 'build') renderBuild(ex);
  if(ex.type === 'typing') renderTyping(ex);
  if(ex.type === 'dictation') renderDictation(ex);
  updStats();
}

// ══ RENDERERS ══
function renderChoice(ex){
  const wrap = document.createElement('div'); wrap.className = 'options';
  ex.options.forEach(opt => {
    const b = document.createElement('button'); b.className = 'option-btn'; b.textContent = opt; b.dataset.value = opt;
    b.addEventListener('click', () => {
      if(ans) return; ans = true;
      const ok = opt === ex.answer;
      wrap.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
        if(btn.dataset.value === ex.answer) btn.classList.add('correct-answer');
        else if(btn === b && !ok) btn.classList.add('wrong-answer');
        else btn.classList.add('dimmed');
      });
      proc(ok);
    });
    wrap.appendChild(b);
  });
  $('exerciseArea').appendChild(wrap);
}

function renderBuild(ex){
  $('qText').textContent = 'Собери предложение:';
  const target = document.createElement('div'); target.className = 'build-target';
  const bank = document.createElement('div'); bank.className = 'word-bank';
  const submit = document.createElement('button'); submit.className = 'build-submit'; submit.textContent = 'Проверить'; submit.disabled = true;
  const selected = [];
  ex.bank.forEach((word, index) => {
    const chip = document.createElement('span'); chip.className = 'word-chip'; chip.textContent = word; chip.dataset.idx = index;
    chip.addEventListener('click', () => {
      if(ans || chip.classList.contains('used')) return;
      chip.classList.add('used'); selected.push({ word, index }); rt();
    });
    bank.appendChild(chip);
  });
  function rt(){
    target.innerHTML = ''; submit.disabled = selected.length === 0;
    selected.forEach((item, i) => {
      const chip = document.createElement('span'); chip.className = 'word-chip in-target'; chip.textContent = item.word;
      chip.addEventListener('click', () => {
        if(ans) return; selected.splice(i, 1);
        const o = bank.querySelector(`.word-chip[data-idx="${item.index}"]`);
        if(o) o.classList.remove('used'); rt();
      });
      target.appendChild(chip);
    });
  }
  submit.addEventListener('click', () => {
    if(ans || selected.length === 0) return; ans = true;
    const built = selected.map(i => i.word).join(' ');
    const ok = built === ex.answer.join(' ');
    target.classList.add(ok ? 'correct' : 'wrong');
    if(!ok) $('correctReveal').textContent = `Правильный вариант: ${ex.reveal}`;
    bank.querySelectorAll('.word-chip').forEach(c => c.style.pointerEvents = 'none');
    submit.style.display = 'none'; proc(ok);
  });
  $('exerciseArea').appendChild(target);
  $('exerciseArea').appendChild(bank);
  $('exerciseArea').appendChild(submit);
}

function renderTyping(ex){
  const wrap = document.createElement('div'); wrap.className = 'typing-area';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'typing-input'; inp.placeholder = 'Напиши по-эстонски...';
  inp.autocomplete = 'off'; inp.spellcheck = false;
  const btn = document.createElement('button'); btn.className = 'typing-submit'; btn.textContent = 'Проверить';
  btn.addEventListener('click', () => checkTyping(inp, ex, btn));
  inp.addEventListener('keydown', e => { if(e.key === 'Enter') checkTyping(inp, ex, btn); });
  wrap.appendChild(inp); wrap.appendChild(btn);
  $('exerciseArea').appendChild(wrap);
  setTimeout(() => inp.focus(), 80);
}

function checkTyping(inp, ex, btn){
  if(ans) return;
  const val = normalize(inp.value);
  if(!val){ showToast('Сначала введи ответ'); return; }
  ans = true; inp.disabled = true; if(btn) btn.style.display = 'none';
  const ok = val === normalize(ex.answer);
  inp.classList.add(ok ? 'correct' : 'wrong');
  if(!ok){ inp.classList.add('shake'); $('correctReveal').textContent = `Правильный вариант: ${ex.reveal}`; }
  proc(ok);
}

function renderDictation(ex){
  $('qRu').style.display = 'none';
  const area = $('exerciseArea');
  const playRow = document.createElement('div'); playRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:16px;';
  const playBtn = document.createElement('button'); playBtn.className = 'btn btn-secondary';
  playBtn.style.cssText = 'width:auto;padding:12px 20px;font-size:1.2rem;'; playBtn.textContent = '🔊 Послушать';
  let isPlaying = false;
  playBtn.addEventListener('click', () => {
    if(isPlaying) return; isPlaying = true; playBtn.disabled = true; playBtn.style.opacity = '0.5';
    playAudio(ex.audioSentence).then(() => { isPlaying = false; playBtn.disabled = false; playBtn.style.opacity = '1'; });
  });
  playRow.appendChild(playBtn); area.appendChild(playRow);
  playAudio(ex.audioSentence).catch(() => {});
  const wrap = document.createElement('div'); wrap.className = 'typing-area';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'typing-input'; inp.placeholder = 'Напиши что услышал(а)...';
  inp.autocomplete = 'off'; inp.spellcheck = false;
  const btn = document.createElement('button'); btn.className = 'typing-submit'; btn.textContent = 'Проверить';
  btn.addEventListener('click', () => checkTyping(inp, ex, btn));
  inp.addEventListener('keydown', e => { if(e.key === 'Enter') checkTyping(inp, ex, btn); });
  wrap.appendChild(inp); wrap.appendChild(btn); area.appendChild(wrap);
  setTimeout(() => inp.focus(), 80);
}

function showReplayBtn(sentence){
  hideReplayBtn();
  const row = document.createElement('div'); row.id = 'audioReplayRow';
  row.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px;';
  const btn = document.createElement('button'); btn.className = 'btn btn-secondary';
  btn.style.cssText = 'width:auto;padding:8px 16px;font-size:0.85rem;'; btn.textContent = '🔊 Послушать';
  btn.addEventListener('click', () => playAudio(sentence));
  row.appendChild(btn); $('nextBtn').parentNode.insertBefore(row, $('nextBtn'));
}
function hideReplayBtn(){ const el = $('audioReplayRow'); if(el) el.remove(); }

// ══ PROC (Leitner) ══
function proc(ok){
  if(curEx._skillKey && skillState[curEx._skillKey]){
    const sk = skillState[curEx._skillKey];
    if(ok){
      sk.totalCorrect++; sk.streak++;
      if(sk.streak >= COURSE.streakNeeded && sk.box < 2){ sk.box++; sk.streak = 0; }
    } else {
      sk.totalWrong++; sk.box = 0; sk.streak = 0;
    }
  }
  if(ok){ correct++; streak++; if(streak > best) best = streak; }
  else { wrong++; streak = 0; }
  updStats(); saveProgress();
  const sentence = curEx._audio || curEx.audioSentence || curEx.reveal || '';
  const nextBtn = $('nextBtn');
  nextBtn.textContent = qNum >= COURSE.sessionLen ? 'Результаты' : 'Далее';
  if(sentence){
    showReplayBtn(sentence);
    let shown = false;
    const show = () => { if(shown) return; shown = true; nextBtn.style.display = 'block'; };
    playAudio(sentence).then(show).catch(show);
    setTimeout(show, 4000);
  } else {
    nextBtn.style.display = 'block';
  }
}

// ══ STATS ══
function updStats(){
  const answered = correct + wrong;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const pct = Math.round((qNum / COURSE.sessionLen) * 100);
  $('correctCount').textContent = correct;
  $('wrongCount').textContent = wrong;
  $('streakCount').textContent = streak;
  $('accuracyCount').textContent = `${accuracy}%`;
  $('progressTitle').textContent = `Вопрос ${Math.min(qNum, COURSE.sessionLen)} из ${COURSE.sessionLen}`;
  $('progressText').textContent = `${Math.min(qNum, COURSE.sessionLen)} / ${COURSE.sessionLen}`;
  $('progressPercent').textContent = `${pct}%`;
  $('progressFill').style.width = `${pct}%`;
  const st = getStage(currentStage);
  const m = getStageMastered();
  const t = getStageTotal();
  $('sessionMeta').textContent = `Stage ${currentStage}: ${st.label} · ${m}/${t} освоено`;
}

// ══ RESULTS ══
function showResults(){
  showScr('resultScreen');
  const answered = correct + wrong;
  const pct = answered ? Math.round((correct / answered) * 100) : 0;
  $('resultCorrect').textContent = correct;
  $('resultWrong').textContent = wrong;
  $('resultBest').textContent = best;
  $('resultPercent').textContent = `${pct}% точность · ${answered} ответов`;
  setTimeout(() => { $('resultBarFill').style.width = `${pct}%`; }, 140);
  const st = getStage(currentStage);
  const m = getStageMastered(); const t = getStageTotal(); const complete = m === t;
  $('resultEmoji').textContent = '';
  $('resultTitle').textContent = `Stage ${currentStage}: ${st.label}`;
  $('resultSubtitle').textContent = complete ? `Все ${t} навыков освоены!` : `Освоено: ${m} из ${t}`;
  renderResultProgress(m, t, complete); saveProgress();
}

function renderResultProgress(mastered, total, complete){
  let c = $('resultProgress');
  if(!c){
    c = document.createElement('div'); c.id = 'resultProgress'; c.style.cssText = 'width:100%;margin-top:16px;';
    const hb = $('homeBtn'); if(hb) hb.parentNode.insertBefore(c, hb.nextSibling);
  }
  const skills = getStageSkills();
  const box0 = skills.filter(([_, s]) => s.box === 0).length;
  const box1 = skills.filter(([_, s]) => s.box === 1).length;
  const box2 = skills.filter(([_, s]) => s.box === 2).length;
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  c.innerHTML = `<div style="padding:14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-size:.82rem;font-weight:800;">Прогресс Stage ${currentStage}</span>
      <span style="font-size:.78rem;font-family:'DM Mono',monospace;color:var(--text-dim);">${mastered}/${total}</span>
    </div>
    <div style="height:8px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden;margin-bottom:12px;">
      <div style="height:100%;width:${pct}%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent-2));transition:width .6s;"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">
      <div style="padding:8px;border-radius:10px;background:rgba(255,107,122,.1);border:1px solid rgba(255,107,122,.18);">
        <div style="font-size:1.1rem;font-weight:900;color:var(--danger);">${box0}</div>
        <div style="font-size:.65rem;color:var(--text-dim);font-family:'DM Mono',monospace;">новых</div>
      </div>
      <div style="padding:8px;border-radius:10px;background:rgba(255,204,102,.1);border:1px solid rgba(255,204,102,.18);">
        <div style="font-size:1.1rem;font-weight:900;color:var(--warning);">${box1}</div>
        <div style="font-size:.65rem;color:var(--text-dim);font-family:'DM Mono',monospace;">учу</div>
      </div>
      <div style="padding:8px;border-radius:10px;background:rgba(6,214,160,.12);border:1px solid rgba(6,214,160,.2);">
        <div style="font-size:1.1rem;font-weight:900;color:var(--success);">${box2}</div>
        <div style="font-size:.65rem;color:var(--text-dim);font-family:'DM Mono',monospace;">освоено</div>
      </div>
    </div>
    ${complete && currentStage < COURSE.stages.length ? `<div style="margin-top:12px;"><button class="btn btn-primary" id="nextStageBtn" style="font-size:.95rem;">Начать Stage ${currentStage + 1}: ${getStage(currentStage + 1).label}</button></div>` : ''}
    ${complete && currentStage >= COURSE.stages.length ? `<div style="margin-top:12px;text-align:center;font-size:.9rem;font-weight:700;color:var(--success);">Все этапы пройдены!</div>` : ''}
  </div>`;
  const nsBtn = $('nextStageBtn');
  if(nsBtn) nsBtn.addEventListener('click', () => { currentStage++; saveProgress(); startGame(); });
}

// ══ START SCREEN ══
function renderStartScreen(){
  const save = loadProgress();
  if(save){
    skillState = save.skillState; currentStage = save.currentStage || 1;
    // Ensure new skills exist (course may have been updated)
    COURSE.getAllSkillKeys().forEach(k => { if(!skillState[k]) skillState[k] = makeSkill(); });
    if(isStageComplete(currentStage) && currentStage < COURSE.stages.length)
      currentStage = getMaxUnlockedStage();
  } else {
    initSkills(); currentStage = 1;
  }
  const m = getStageMastered(); const t = getStageTotal();
  $('startBtn').textContent = m > 0 ? `Продолжить · ${m}/${t} освоено` : `Начать Stage ${currentStage}`;
  renderStageIndicator();
}

function renderStageIndicator(){
  let host = $('stageIndicator');
  if(!host){
    host = document.createElement('div'); host.id = 'stageIndicator'; host.style.cssText = 'width:100%;margin-top:4px;';
    const info = document.querySelector('.start-info');
    if(info) info.parentNode.insertBefore(host, info);
  }
  const maxU = getMaxUnlockedStage();
  let html = '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">';
  COURSE.stages.forEach(stage => {
    const locked = stage.id > maxU;
    const complete = isStageComplete(stage.id);
    const active = stage.id === currentStage;
    const m = getStageMastered(stage.id); const t = getStageTotal(stage.id);
    let bg, border, color;
    if(complete){ bg = 'rgba(6,214,160,.15)'; border = 'rgba(6,214,160,.3)'; color = 'var(--success)'; }
    else if(active){ bg = 'rgba(14,165,233,.12)'; border = 'rgba(14,165,233,.3)'; color = 'var(--accent-2)'; }
    else if(locked){ bg = 'rgba(255,255,255,.02)'; border = 'rgba(255,255,255,.06)'; color = 'var(--text-dim)'; }
    else { bg = 'rgba(255,255,255,.04)'; border = 'rgba(255,255,255,.08)'; color = 'var(--text)'; }
    html += `<div style="padding:8px 12px;border-radius:10px;background:${bg};border:1px solid ${border};text-align:center;min-width:55px;${locked ? 'opacity:.4;' : ''}">
      <div style="font-size:.68rem;font-weight:800;color:${color};">${locked ? '🔒' : complete ? '✓' : stage.id}</div>
      <div style="font-size:.55rem;color:var(--text-dim);font-family:'DM Mono',monospace;margin-top:2px;">${locked ? '—' : `${m}/${t}`}</div>
    </div>`;
  });
  html += '</div>';
  host.innerHTML = html;
}

// ══ PAUSE ══
function openPauseModal(){ $('pauseModal').classList.add('show'); }
function closePauseModal(){ $('pauseModal').classList.remove('show'); }
function goHomeFromPause(){ closePauseModal(); saveProgress(); showScr('startScreen'); renderStartScreen(); }
function restartFromPause(){ closePauseModal(); startGame(); }

// ══ FAQ ══
function openFaq(){ $('faqContent').innerHTML = COURSE.faqHtml; $('faqModal').classList.add('show'); }
function closeFaq(){ $('faqModal').classList.remove('show'); }

// ══ DRILL ══
let drillTimer = null;

function openDrill(word, audioText, label, sublabel){
  stopAudio(); $('drillOverlay').classList.add('show');
  const phase = $('drillPhase');
  let cir = 0; const NEEDED = 3;

  function showP(){
    const showTime = cir === 0 ? 4000 : 2500;
    phase.innerHTML = `<div class="drill-num">${label}</div><div class="drill-ru">${sublabel}</div><div class="drill-hint">Запоминай написание:</div><div class="drill-word">${word}</div><div class="drill-timer"><div class="drill-timer-fill" id="drillTimerFill"></div></div><div class="drill-streak-dots">${Array.from({length:NEEDED}, (_, i) => `<div class="drill-streak-dot ${i < cir ? 'filled' : ''}"></div>`).join('')}</div><div style="font-size:.75rem;color:var(--text-dim);font-family:'DM Mono',monospace;">${cir > 0 ? `✓ ${cir}/${NEEDED}` : `Напиши правильно ${NEEDED} раза подряд`}</div>`;
    playAudio(audioText);
    const fill = $('drillTimerFill');
    if(fill){
      fill.style.width = '100%'; fill.style.transitionDuration = showTime + 'ms';
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = '0%'; }));
    }
    drillTimer = setTimeout(writeP, showTime);
  }

  function writeP(){
    phase.innerHTML = `<div class="drill-num">${label}</div><div class="drill-ru">${sublabel}</div><div class="drill-hint">Напиши по памяти:</div><div class="drill-streak-dots">${Array.from({length:NEEDED}, (_, i) => `<div class="drill-streak-dot ${i < cir ? 'filled' : ''}"></div>`).join('')}</div><div style="margin-top:12px;"><input type="text" class="drill-input" id="drillInput" placeholder="..." autocomplete="off" spellcheck="false"/></div><div style="margin-top:10px;"><button class="btn btn-primary" id="drillCheckBtn" style="padding:12px 20px;font-size:.95rem;">Проверить</button></div>`;
    const inp = $('drillInput'); setTimeout(() => inp.focus(), 100);
    function chk(){
      const val = normalize(inp.value); if(!val) return;
      const ok = val === normalize(word); inp.disabled = true; $('drillCheckBtn').style.display = 'none';
      if(ok){
        inp.classList.add('correct'); cir++;
        if(cir >= NEEDED) setTimeout(succP, 500); else setTimeout(showP, 800);
      } else {
        inp.classList.add('wrong'); cir = 0;
        setTimeout(() => {
          phase.innerHTML = `<div class="drill-num">${label}</div><div class="drill-hint" style="color:var(--danger);">Не совсем. Правильно:</div><div class="drill-word">${word}</div><div class="drill-streak-dots">${Array.from({length:NEEDED}, () => `<div class="drill-streak-dot"></div>`).join('')}</div><div style="font-size:.78rem;color:var(--text-dim);margin-top:8px;">Смотри внимательно...</div>`;
          playAudio(audioText); drillTimer = setTimeout(showP, 3000);
        }, 600);
      }
    }
    inp.addEventListener('keydown', e => { if(e.key === 'Enter') chk(); });
    $('drillCheckBtn').addEventListener('click', chk);
  }

  function succP(){
    playAudio(audioText);
    phase.innerHTML = `<div class="drill-num">${label}</div><div class="drill-success">✓ Запомнил!</div><div class="drill-word" style="color:var(--success);">${word}</div><div class="drill-streak-dots">${Array.from({length:NEEDED}, () => `<div class="drill-streak-dot filled"></div>`).join('')}</div><div style="margin-top:16px;"><button class="btn btn-primary" id="drillDoneBtn" style="padding:14px 20px;">Отлично!</button></div>`;
    $('drillDoneBtn').addEventListener('click', closeDrill);
  }

  showP();
}

function closeDrill(){
  if(drillTimer){ clearTimeout(drillTimer); drillTimer = null; }
  stopAudio(); $('drillOverlay').classList.remove('show'); $('drillPhase').innerHTML = '';
}

// ══ STUDY MODE ══
function openStudy(){
  const c = $('studyContent'); c.innerHTML = '';
  COURSE.renderStudy(c, { openDrill, playAudio, stopAudio });
  showScr('studyScreen');
}

// ══ EVENTS ══
function bindEvents(){
  $('startBtn').addEventListener('click', () => startGame());
  $('studyBtn').addEventListener('click', openStudy);
  $('faqBtn').addEventListener('click', openFaq);
  $('faqCloseBtn').addEventListener('click', closeFaq);
  $('faqModal').addEventListener('click', e => { if(e.target.id === 'faqModal') closeFaq(); });
  $('studyBackBtn').addEventListener('click', () => { stopAudio(); showScr('startScreen'); renderStartScreen(); });
  $('drillClose').addEventListener('click', closeDrill);
  $('drillOverlay').addEventListener('click', e => { if(e.target.id === 'drillOverlay') closeDrill(); });
  $('pauseBtn').addEventListener('click', openPauseModal);
  $('resumeBtn').addEventListener('click', closePauseModal);
  $('restartBtn').addEventListener('click', restartFromPause);
  $('pauseHomeBtn').addEventListener('click', goHomeFromPause);
  $('retryBtn').addEventListener('click', () => startGame());
  $('homeBtn').addEventListener('click', () => { showScr('startScreen'); renderStartScreen(); });
  $('nextBtn').addEventListener('click', nextQ);
  $('pauseModal').addEventListener('click', e => { if(e.target.id === 'pauseModal') closePauseModal(); });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      if($('faqModal').classList.contains('show')) closeFaq();
      else if($('drillOverlay').classList.contains('show')) closeDrill();
      else if($('pauseModal').classList.contains('show')) closePauseModal();
      else if($('studyScreen').classList.contains('active')){ stopAudio(); showScr('startScreen'); renderStartScreen(); }
      else if($('gameScreen').classList.contains('active')) openPauseModal();
    }
    if(e.key === 'Enter' && $('nextBtn').style.display === 'block') nextQ();
  });
}

// ══ INIT (called by data.js after defining COURSE) ══
function init(){
  initSkills();
  const save = loadProgress();
  if(save){
    skillState = save.skillState; currentStage = save.currentStage || 1;
    COURSE.getAllSkillKeys().forEach(k => { if(!skillState[k]) skillState[k] = makeSkill(); });
  }
  bindEvents(); renderStartScreen();
}