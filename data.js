// ═══════════════════════════════════════════
// data.js — Olema Treener course data
// Pronouns + olema verb forms + professions
// Uses engine.js (COURSE contract)
// ═══════════════════════════════════════════

// ══ WORD DATA ══
const PRONOUNS = [
  { et:'ma', full:'mina', ru:'я', plural:false },
  { et:'sa', full:'sina', ru:'ты', plural:false },
  { et:'ta', full:'tema', ru:'он/она', plural:false },
  { et:'me', full:'meie', ru:'мы', plural:true },
  { et:'te', full:'teie', ru:'вы', plural:true },
  { et:'nad', full:'nemad', ru:'они', plural:true },
];

const OLEMA = { ma:'olen', sa:'oled', ta:'on', me:'oleme', te:'olete', nad:'on' };

const PROFESSIONS = [
  { sg:'arst', pl:'arstid', ru:'врач', ruPl:'врачи' },
  { sg:'õpetaja', pl:'õpetajad', ru:'учитель', ruPl:'учителя' },
  { sg:'programmeerija', pl:'programmeerijad', ru:'программист', ruPl:'программисты' },
  { sg:'õpilane', pl:'õpilased', ru:'ученик', ruPl:'ученики' },
];

function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

// ══ GENERATE ALL SENTENCE COMBOS ══
// Each combo: {pronoun, prof, pos:{et,ru,words}, neg:{et,ru,words}, q:{et,ru,words}}
const COMBOS = [];

PRONOUNS.forEach(pr => {
  const verb = OLEMA[pr.et];
  PROFESSIONS.forEach(prof => {
    const noun = pr.plural ? prof.pl : prof.sg;
    const ruNoun = pr.plural ? prof.ruPl : prof.ru;
    COMBOS.push({
      pronoun: pr, prof, noun, verb,
      pos: {
        et: `${cap(pr.et)} ${verb} ${noun}`,
        ru: `${cap(pr.ru)} — ${ruNoun}`,
        words: [cap(pr.et), verb, noun],
      },
      neg: {
        et: `${cap(pr.et)} ei ole ${noun}`,
        ru: `${cap(pr.ru)} — не ${ruNoun}`,
        words: [cap(pr.et), 'ei', 'ole', noun],
      },
      q: {
        et: `Kas ${pr.et} ${verb} ${noun}`,
        ru: `${cap(pr.ru)} — ${ruNoun}?`,
        words: ['Kas', pr.et, verb, noun],
      },
    });
  });
});

// Flat pattern arrays per form (used by stages)
const POS_PATTERNS = COMBOS.map(c => ({ et:c.pos.et, ru:c.pos.ru, words:c.pos.words }));
const NEG_PATTERNS = COMBOS.map(c => ({ et:c.neg.et, ru:c.neg.ru, words:c.neg.words }));
const Q_PATTERNS   = COMBOS.map(c => ({ et:c.q.et, ru:c.q.ru, words:c.q.words }));

const FORM_MAP = { pos:POS_PATTERNS, neg:NEG_PATTERNS, q:Q_PATTERNS };

// ═══════════════════════════════════════════
// ══ EXERCISE GENERATORS ══
// ═══════════════════════════════════════════

function makePatternChoice(pattern, key, allPatterns){
  const wrongs = shuffle(allPatterns.filter(p => p.et !== pattern.et)).slice(0,3).map(p => p.et);
  return { type:'choice', label:'Выбери перевод', qText:pattern.ru, qRu:'',
    answer:pattern.et, options:shuffle([pattern.et, ...wrongs]),
    reveal:pattern.et, _audio:pattern.et, _skillKey:key };
}

function makePatternChoiceReverse(pattern, key, allPatterns){
  const wrongs = shuffle(allPatterns.filter(p => p.ru !== pattern.ru)).slice(0,3).map(p => p.ru);
  return { type:'choice', label:'Что означает?', qText:pattern.et, qRu:'',
    answer:pattern.ru, options:shuffle([pattern.ru, ...wrongs]),
    reveal:pattern.et, _audio:pattern.et, _skillKey:key };
}

function makePatternBuild(pattern, key, allPatterns){
  const distractors = [];
  const other = pick(allPatterns.filter(p => p.et !== pattern.et));
  if(other){
    const diff = other.words.filter(w => !pattern.words.includes(w));
    if(diff.length) distractors.push(pick(diff));
  }
  const other2 = pick(allPatterns.filter(p => p.et !== pattern.et && p !== other));
  if(other2){
    const diff2 = other2.words.filter(w => !pattern.words.includes(w) && !distractors.includes(w));
    if(diff2.length) distractors.push(pick(diff2));
  }
  return { type:'build', label:'Собери предложение', qRu:pattern.ru,
    answer:pattern.words, bank:shuffle([...pattern.words, ...distractors]),
    reveal:pattern.et, _audio:pattern.et, _skillKey:key };
}

function makePatternTyping(pattern, key){
  return { type:'typing', label:'Переведи на эстонский', qText:'Переведи:', qRu:pattern.ru,
    answer:normalize(pattern.et), reveal:pattern.et, _audio:pattern.et, _skillKey:key };
}

function makeTransform(combo, fromForm, toForm, key){
  const source = combo[fromForm];
  const target = combo[toForm];
  const labels = { pos:'утверждение', neg:'отрицание', q:'вопрос' };
  return { type:'typing', label:`${cap(labels[fromForm])} → ${labels[toForm]}`,
    qText:source.et, qRu:`Преобразуй в ${labels[toForm]}:`,
    answer:normalize(target.et), reveal:target.et, _audio:target.et, _skillKey:key };
}

function makeDictation(pattern, key){
  return { type:'dictation', label:'Аудио-диктант', qText:'Послушай и напиши:',
    audioSentence:pattern.et, answer:normalize(pattern.et), reveal:pattern.et, _skillKey:key };
}

// ═══════════════════════════════════════════
// ══ COURSE DEFINITION ══
// ═══════════════════════════════════════════
const COURSE = window.COURSE = {
  saveKey: 'olema_v2',
  sessionLen: 20,
  streakNeeded: 2,

  stages: [
    { id:1, label:'Утверждения', formType:'pos' },
    { id:2, label:'Отрицания',   formType:'neg' },
    { id:3, label:'Вопросы',     formType:'q' },
  ],

  getAllSkillKeys(){
    const keys = [];
    Object.entries(FORM_MAP).forEach(([form, patterns]) => {
      patterns.forEach((_, i) => keys.push(`${form}_${i}`));
    });
    return keys;
  },

  getStageSkillKeys(stageId){
    const st = this.stages.find(s => s.id === stageId);
    if(!st) return [];
    const patterns = FORM_MAP[st.formType];
    if(!patterns) return [];
    return patterns.map((_, i) => `${st.formType}_${i}`);
  },

  makeExercise(skillKey, box){
    const m = skillKey.match(/^(\w+)_(\d+)$/);
    if(!m) return makePatternChoice(POS_PATTERNS[0], skillKey, POS_PATTERNS);

    const form = m[1]; // pos, neg, q
    const idx = parseInt(m[2]);
    const patterns = FORM_MAP[form];
    if(!patterns || !patterns[idx]) return makePatternChoice(POS_PATTERNS[0], skillKey, POS_PATTERNS);

    const pattern = patterns[idx];
    const combo = COMBOS[idx];
    const roll = Math.random();

    // Difficulty by box
    let choiceP, buildP, typingP;
    if(box === 0)      { choiceP = 0.50; buildP = 0.65; typingP = 0.85; }
    else if(box === 1) { choiceP = 0.20; buildP = 0.35; typingP = 0.70; }
    else               { choiceP = 0.00; buildP = 0.10; typingP = 0.55; }

    if(roll < choiceP){
      return Math.random() > 0.5
        ? makePatternChoice(pattern, skillKey, patterns)
        : makePatternChoiceReverse(pattern, skillKey, patterns);
    }
    if(roll < buildP){
      return makePatternBuild(pattern, skillKey, patterns);
    }
    if(roll < typingP){
      // Mix between direct typing and transform
      if(Math.random() > 0.4 && combo){
        // Transform: convert between forms
        if(form === 'pos') return makeTransform(combo, 'pos', pick(['neg','q']), skillKey);
        if(form === 'neg') return makeTransform(combo, 'neg', pick(['pos','q']), skillKey);
        if(form === 'q')   return makeTransform(combo, 'q', pick(['pos','neg']), skillKey);
      }
      return makePatternTyping(pattern, skillKey);
    }
    return makeDictation(pattern, skillKey);
  },

  faqHtml: `
    <div style="font-size:.88rem;line-height:1.65;color:var(--text-dim);">
      <div style="margin-bottom:14px;">
        <div style="font-weight:800;color:var(--text);margin-bottom:4px;">🎯 Цель</div>
        Освоить эстонские местоимения (ma, sa, ta, me, te, nad), формы глагола <strong>olema</strong> (olen, oled, on, oleme, olete) и 4 профессии в утверждениях, отрицаниях и вопросах.
      </div>
      <div style="margin-bottom:14px;">
        <div style="font-weight:800;color:var(--text);margin-bottom:4px;">📦 Как учим</div>
        Каждая фраза — навык. Три ступени:<br>
        <span style="color:var(--danger);font-weight:700;">Новый</span> → <span style="color:var(--warning);font-weight:700;">Учу</span> → <span style="color:var(--success);font-weight:700;">Освоен</span><br>
        <strong>2 верных ответа подряд</strong> — навык продвигается.<br>
        <strong>1 ошибка</strong> — возврат в начало.
      </div>
      <div style="margin-bottom:14px;">
        <div style="font-weight:800;color:var(--text);margin-bottom:4px;">📝 3 этапа</div>
        <strong>Stage 1:</strong> Утверждения — Ma olen arst, Sa oled õpetaja...<br>
        <strong>Stage 2:</strong> Отрицания — Ma ei ole arst, Ta ei ole õpilane...<br>
        <strong>Stage 3:</strong> Вопросы — Kas sa oled arst? Kas nad on arstid?<br><br>
        Каждый следующий этап открывается когда <strong>все</strong> навыки текущего освоены.
      </div>
      <div style="margin-bottom:14px;">
        <div style="font-weight:800;color:var(--text);margin-bottom:4px;">🔄 Типы заданий</div>
        <strong>Выбор</strong> — выбери правильный перевод<br>
        <strong>Сборка</strong> — собери предложение из слов<br>
        <strong>Трансформация</strong> — преобразуй утверждение → отрицание → вопрос<br>
        <strong>Перевод</strong> — напиши по-эстонски<br>
        <strong>Аудио-диктант</strong> — послушай и напиши
      </div>
      <div>
        <div style="font-weight:800;color:var(--text);margin-bottom:4px;">💾 Прогресс</div>
        Сохраняется автоматически. Можно закрыть и продолжить позже.
      </div>
    </div>`,

  renderStudy(container, helpers){
    const { openDrill, stopAudio } = helpers;
    const tabs = [
      { id:'tabPos', label:'Утверждения' },
      { id:'tabNeg', label:'Отрицания' },
      { id:'tabQ',   label:'Вопросы' },
      { id:'tabRef', label:'Справка' },
    ];
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;justify-content:space-between;gap:6px;margin-bottom:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;';
    const panels = {};

    tabs.forEach((tab, i) => {
      const btn = document.createElement('button'); btn.className = 'study-tab'; btn.textContent = tab.label;
      if(i === 0) btn.classList.add('active');
      btn.addEventListener('click', () => {
        stopAudio();
        tabBar.querySelectorAll('.study-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Object.values(panels).forEach(p => p.style.display = 'none');
        panels[tab.id].style.display = '';
      });
      tabBar.appendChild(btn);
      const panel = document.createElement('div'); panel.style.display = i === 0 ? '' : 'none';
      panels[tab.id] = panel;
    });

    container.appendChild(tabBar);
    Object.values(panels).forEach(p => container.appendChild(p));

    // Build sentence rows
    function makeSection(title, items){
      const sec = document.createElement('div'); sec.style.marginBottom = '20px';
      const heading = document.createElement('div'); heading.className = 'study-note';
      heading.style.cssText = 'margin-bottom:10px;padding:10px 14px;';
      heading.innerHTML = `<strong>${title}</strong>`;
      sec.appendChild(heading);
      const grid = document.createElement('div'); grid.className = 'study-sentence-grid';
      items.forEach(p => {
        const row = document.createElement('div'); row.className = 'study-sentence';
        row.innerHTML = `<span class="ss-et">${p.et}</span><span class="ss-ru">${p.ru}</span>`;
        row.addEventListener('click', () => openDrill(p.et, p.et, p.ru, ''));
        grid.appendChild(row);
      });
      sec.appendChild(grid); return sec;
    }

    // Group by pronoun for each form tab
    function buildFormTab(panel, patterns, formLabel){
      PRONOUNS.forEach((pr, pi) => {
        const start = pi * PROFESSIONS.length;
        const slice = patterns.slice(start, start + PROFESSIONS.length);
        const emoji = pr.plural ? '👥' : '👤';
        panel.appendChild(makeSection(`${emoji} ${cap(pr.et)} (${pr.full}) — ${pr.ru}`, slice));
      });
    }

    buildFormTab(panels['tabPos'], POS_PATTERNS, 'Утверждения');
    buildFormTab(panels['tabNeg'], NEG_PATTERNS, 'Отрицания');
    buildFormTab(panels['tabQ'],   Q_PATTERNS,   'Вопросы');

    // Reference tab
    const ref = panels['tabRef'];
    const n1 = document.createElement('div'); n1.className = 'study-note';
    n1.innerHTML = `<strong>Глагол olema (быть)</strong><br><br>
      <span style="font-family:'DM Mono',monospace;font-size:.88rem;">
      ma <strong>olen</strong> — я есть<br>
      sa <strong>oled</strong> — ты есть<br>
      ta <strong>on</strong> — он/она есть<br>
      me <strong>oleme</strong> — мы есть<br>
      te <strong>olete</strong> — вы есть<br>
      nad <strong>on</strong> — они есть</span>`;
    ref.appendChild(n1);

    const n2 = document.createElement('div'); n2.className = 'study-note';
    n2.innerHTML = `<strong>Отрицание</strong><br><br>
      Всегда одинаково: местоимение + <strong>ei ole</strong> + существительное<br>
      <span style="font-family:'DM Mono',monospace;font-size:.88rem;">Ma <strong>ei ole</strong> arst — Я не врач</span>`;
    ref.appendChild(n2);

    const n3 = document.createElement('div'); n3.className = 'study-note';
    n3.innerHTML = `<strong>Вопрос</strong><br><br>
      <strong>Kas</strong> + местоимение + форма olema + существительное<br>
      <span style="font-family:'DM Mono',monospace;font-size:.88rem;"><strong>Kas</strong> sa oled arst? — Ты врач?</span>`;
    ref.appendChild(n3);

    const n4 = document.createElement('div'); n4.className = 'study-note';
    n4.innerHTML = `<strong>Множественное число профессий</strong><br><br>
      <span style="font-family:'DM Mono',monospace;font-size:.88rem;">
      arst → arst<strong>id</strong><br>
      õpetaja → õpetaja<strong>d</strong><br>
      programmeerija → programmeerija<strong>d</strong><br>
      õpilane → õpilas<strong>ed</strong></span><br><br>
      Используется с <strong>me, te, nad</strong> (множественное число).`;
    ref.appendChild(n4);
  },
};

// ══ BOOT ══
init();