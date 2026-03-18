const PRONOUNS = [
  { et: 'ma', etFull: 'mina', ru: 'я', person: 1, plural: false },
  { et: 'sa', etFull: 'sina', ru: 'ты', person: 2, plural: false },
  { et: 'ta', etFull: 'tema', ru: 'он/она', person: 3, plural: false },
  { et: 'me', etFull: 'meie', ru: 'мы', person: 1, plural: true },
  { et: 'te', etFull: 'teie', ru: 'вы', person: 2, plural: true },
  { et: 'nad', etFull: 'nemad', ru: 'они', person: 3, plural: true },
];

const OLEMA = {
  ma: 'olen',
  sa: 'oled',
  ta: 'on',
  me: 'oleme',
  te: 'olete',
  nad: 'on',
};

const PROFESSIONS = [
  { sg: 'arst', pl: 'arstid', ru: 'врач', ruPl: 'врачи' },
  { sg: 'õpetaja', pl: 'õpetajad', ru: 'учитель', ruPl: 'учителя' },
  { sg: 'programmeerija', pl: 'programmeerijad', ru: 'программист', ruPl: 'программисты' },
  { sg: 'õpilane', pl: 'õpilased', ru: 'ученик', ruPl: 'ученики' },
];

const SAVE_KEY = 'olema_save';
const TOTAL = 50;
const UP = 2;
const MAXLVL = 2;

let skillState = {};
let correct = 0;
let wrong = 0;
let streak = 0;
let best = 0;
let qNum = 0;
let ans = false;
let curEx = null;

function $(id) {
  return document.getElementById(id);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function unique(arr) {
  return [...new Set(arr)];
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[?.!]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function showScr(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 1600);
}

function makeSentence(pronoun, prof, form) {
  const verb = OLEMA[pronoun.et];
  const noun = pronoun.plural ? prof.pl : prof.sg;
  const ruNoun = pronoun.plural ? prof.ruPl : prof.ru;

  if (form === 'pos') {
    return {
      et: `${cap(pronoun.et)} ${verb} ${noun}`,
      ru: `${cap(pronoun.ru)} — ${ruNoun}`,
      words: [cap(pronoun.et), verb, noun],
    };
  }

  if (form === 'neg') {
    return {
      et: `${cap(pronoun.et)} ei ole ${noun}`,
      ru: `${cap(pronoun.ru)} — не ${ruNoun}`,
      words: [cap(pronoun.et), 'ei', 'ole', noun],
    };
  }

  return {
    et: `Kas ${pronoun.et} ${verb} ${noun}?`,
    ru: `${cap(pronoun.ru)} — ${ruNoun}?`,
    words: ['Kas', pronoun.et, verb, noun],
  };
}

function getNegativeChoiceOptions() {
  const wrongs = shuffle(['ei olen', 'ei oled', 'ei oleme', 'ei olete']).slice(0, 3);
  return shuffle(['ei ole', ...wrongs]);
}

// ── AUDIO ──
function getAudioFile(sentence) {
  let name = sentence.toLowerCase().trim().replace(/\?$/, '').trim();
  name = name.replace(/[^a-zõäöü\s]/g, '');
  name = name.replace(/\s+/g, '_').trim();
  return 'audio/' + name + '.mp3';
}

let currentAudio = null;

function playAudio(sentence) {
  return new Promise((resolve) => {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    const file = getAudioFile(sentence);
    currentAudio = new Audio(file);
    currentAudio.onended = resolve;
    currentAudio.onerror = resolve;
    currentAudio.play().catch(resolve);
  });
}

function stopAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

function initSkills() {
  skillState = {};

  PRONOUNS.forEach((pr) => {
    ['pos', 'neg', 'question'].forEach((form) => {
      const key = `${pr.et}_${form}`;
      skillState[key] = {
        level: 0,           // exercise difficulty: 0=choice, 1=build, 2=typing
        streak: 0,          // consecutive correct at current level
        done: false,         // mastered at least once
        // SM-2 fields
        ef: 2.5,             // easiness factor (min 1.3)
        interval: 0,         // days until next review
        reps: 0,             // consecutive correct reviews
        nextReview: 0,       // timestamp when due (0 = new, review immediately)
        lastReview: 0,       // timestamp of last review
        totalCorrect: 0,     // lifetime correct count
        totalWrong: 0,       // lifetime wrong count
      };
    });
  });
}

function saveProgress() {
  const data = {
    skillState,
    correct,
    wrong,
    best,
    total: correct + wrong,
    ts: Date.now(),
  };

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {}
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    // Migrate old saves: add SM-2 fields if missing
    if (data.skillState) {
      Object.values(data.skillState).forEach((sk) => {
        if (sk.ef === undefined) sk.ef = 2.5;
        if (sk.interval === undefined) sk.interval = 0;
        if (sk.reps === undefined) sk.reps = 0;
        if (sk.nextReview === undefined) sk.nextReview = 0;
        if (sk.lastReview === undefined) sk.lastReview = 0;
        if (sk.totalCorrect === undefined) sk.totalCorrect = 0;
        if (sk.totalWrong === undefined) sk.totalWrong = 0;
      });
    }

    return data;
  } catch (e) {
    return null;
  }
}

function allDoneFromData(data) {
  return data?.skillState && Object.values(data.skillState).filter((s) => s.done).length >= 18;
}

function hasSave() {
  const data = loadProgress();
  if (!data || !data.skillState) return false;
  // Has save if at least one skill has been reviewed
  return Object.values(data.skillState).some((s) => s.lastReview > 0);
}

function checkSaved() {
  let contBtn = $('continueBtn');

  if (!contBtn) {
    const primary = $('startBtn');
    contBtn = document.createElement('button');
    contBtn.id = 'continueBtn';
    contBtn.className = 'btn btn-secondary';
    contBtn.addEventListener('click', () => startGame(true));
    primary.parentNode.insertBefore(contBtn, primary.nextSibling);
  }

  if (hasSave()) {
    const data = loadProgress();
    const now = Date.now();
    const skills = Object.values(data.skillState);
    const mastered = skills.filter((s) => s.done).length;
    const due = skills.filter((s) => s.lastReview > 0 && s.nextReview <= now).length;
    const fresh = skills.filter((s) => s.reps === 0 && s.lastReview === 0).length;

    contBtn.style.display = '';
    if (due > 0) {
      contBtn.textContent = `Повторить (${due} на повторение)`;
    } else if (fresh > 0) {
      contBtn.textContent = `Продолжить (${fresh} новых)`;
    } else {
      contBtn.textContent = `Продолжить (${mastered}/18 освоено)`;
    }
  } else {
    contBtn.style.display = 'none';
  }
}

function openPauseModal() {
  $('pauseModal').classList.add('show');
}

function closePauseModal() {
  $('pauseModal').classList.remove('show');
}

function restartFromPause() {
  closePauseModal();
  startGame(false);
}

function goHomeFromPause() {
  closePauseModal();
  saveProgress();
  showScr('startScreen');
  checkSaved();
  renderStartScreenBadges();
  refreshHeatmaps();
}

function updStats() {
  const answered = correct + wrong;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const pct = Math.round((qNum / TOTAL) * 100);

  $('correctCount').textContent = correct;
  $('wrongCount').textContent = wrong;
  $('streakCount').textContent = streak;
  $('accuracyCount').textContent = `${accuracy}%`;

  $('progressTitle').textContent = `Вопрос ${Math.min(qNum, TOTAL)} из ${TOTAL}`;
  $('progressText').textContent = `${Math.min(qNum, TOTAL)} / ${TOTAL}`;
  $('progressPercent').textContent = `${pct}%`;
  $('progressFill').style.width = `${pct}%`;

  const now = Date.now();
  const due = Object.values(skillState).filter((s) => s.lastReview > 0 && s.nextReview <= now).length;
  const mastered = Object.values(skillState).filter((s) => s.done).length;
  $('sessionMeta').textContent = `Освоено: ${mastered}/18 · На повторение: ${due}`;
  renderXpBar();
}

function pickSkill() {
  const now = Date.now();
  const entries = Object.entries(skillState);

  // 1. New skills (never reviewed) — highest priority
  const fresh = entries.filter(([_, s]) => s.reps === 0 && s.lastReview === 0);

  // 2. Overdue skills (nextReview <= now)
  const overdue = entries.filter(([_, s]) => s.lastReview > 0 && s.nextReview <= now);

  // 3. Not-yet-due skills (for padding if needed)
  const upcoming = entries.filter(([_, s]) => s.lastReview > 0 && s.nextReview > now);

  // Priority: overdue first, then fresh, then upcoming (sorted by closest due date)
  let pool;

  if (overdue.length > 0) {
    // Prioritize most overdue items (sort by how far past due)
    overdue.sort((a, b) => a[1].nextReview - b[1].nextReview);
    pool = overdue;
  } else if (fresh.length > 0) {
    pool = fresh;
  } else if (upcoming.length > 0) {
    // All reviewed and not yet due — pick closest to being due
    upcoming.sort((a, b) => a[1].nextReview - b[1].nextReview);
    pool = upcoming;
  } else {
    return null;
  }

  // Weight: lower level + lower EF + more errors = higher weight
  const weighted = [];
  pool.slice(0, 8).forEach(([key, s]) => {
    const levelW = 3 - s.level;
    const efW = s.ef < 2.0 ? 3 : s.ef < 2.5 ? 2 : 1; // harder items get more weight
    const errorW = s.totalWrong > s.totalCorrect ? 2 : 1;
    const w = Math.max(1, levelW + efW + errorW);
    for (let i = 0; i < w; i++) weighted.push(key);
  });

  return weighted[Math.floor(Math.random() * weighted.length)];
}

function makeTargetedChoice(pr, prof, form) {
  const s = makeSentence(pr, prof, form);
  const verb = OLEMA[pr.et];
  const _skillKey = `${pr.et}_${form}`;
  const noun = pr.plural ? prof.pl : prof.sg;

  if (Math.random() > 0.5) {
    // fill verb
    if (form === 'neg') {
      return {
        type: 'choice',
        label: 'Выбери форму',
        qText: `${cap(pr.et)} ____ ${noun}`,
        qRu: s.ru,
        answer: 'ei ole',
        options: getNegativeChoiceOptions(),
        reveal: s.et,
        _skillKey
      };
    }

    const wrongs = shuffle(unique(Object.values(OLEMA).filter(v => v !== verb)));

    if (form === 'question') {
      return {
        type: 'choice',
        label: 'Выбери форму',
        qText: `Kas ${pr.et} ___ ${noun}?`,
        qRu: s.ru,
        answer: verb,
        options: shuffle([verb, ...wrongs.slice(0, 3)]),
        reveal: s.et,
        _skillKey
      };
    }

    return {
      type: 'choice',
      label: 'Выбери форму',
      qText: `${cap(pr.et)} ___ ${noun}`,
      qRu: s.ru,
      answer: verb,
      options: shuffle([verb, ...wrongs.slice(0, 3)]),
      reveal: s.et,
      _skillKey
    };
  }

  // fill pronoun
  const pronounOptions = shuffle(
    PRONOUNS
      .filter(p => p.et !== pr.et)
      .slice(0, 3)
      .map(p => (form === 'question' ? p.et : cap(p.et)))
  );

  if (form === 'question') {
    return {
      type: 'choice',
      label: 'Выбери местоимение',
      qText: `Kas ___ ${verb} ${noun}?`,
      qRu: s.ru,
      answer: pr.et,
      options: shuffle([pr.et, ...pronounOptions]),
      reveal: s.et,
      _skillKey
    };
  }

  if (form === 'neg') {
    return {
      type: 'choice',
      label: 'Выбери местоимение',
      qText: `___ ei ole ${noun}`,
      qRu: s.ru,
      answer: cap(pr.et),
      options: shuffle([cap(pr.et), ...pronounOptions]),
      reveal: s.et,
      _skillKey
    };
  }

  return {
    type: 'choice',
    label: 'Выбери местоимение',
    qText: `___ ${verb} ${noun}`,
    qRu: s.ru,
    answer: cap(pr.et),
    options: shuffle([cap(pr.et), ...pronounOptions]),
    reveal: s.et,
    _skillKey
  };
}

function makeTargetedBuild(pr, prof, form) {
  const s = makeSentence(pr, prof, form);
  const skillKey = `${pr.et}_${form}`;

  const distractors = [];
  if (form === 'pos') distractors.push('ei');
  if (form !== 'question') distractors.push('Kas');

  const allVerbs = unique(Object.values(OLEMA));
  const extraVerb = pick(allVerbs.filter((v) => !s.words.includes(v)));
  if (extraVerb) distractors.push(extraVerb);

  return {
    type: 'build',
    label: 'Собери предложение',
    qRu: s.ru,
    answer: s.words,
    bank: shuffle([...s.words, ...distractors.slice(0, 2)]),
    reveal: s.et,
    _skillKey: skillKey,
  };
}

function makeTargetedTransform(pr, prof, form) {
  const targetForm = form === 'neg' ? 'neg' : 'pos';
  const sourceForm = targetForm === 'neg' ? 'pos' : 'neg';

  const source = makeSentence(pr, prof, sourceForm);
  const target = makeSentence(pr, prof, targetForm);
  const task = sourceForm === 'pos' ? 'Сделай отрицание:' : 'Сделай утверждение:';

  return {
    type: 'typing',
    label: 'Преобразуй',
    qText: task,
    source: source.et,
    answer: normalize(target.et),
    reveal: target.et,
    _skillKey: `${pr.et}_${targetForm}`,
  };
}

function makeTargetedTranslate(pr, prof, form) {
  const s = makeSentence(pr, prof, form);
  return {
    type: 'typing',
    label: 'Перевод',
    qText: 'Переведи на эстонский:',
    qRu: s.ru,
    answer: normalize(s.et),
    reveal: s.et,
    _skillKey: `${pr.et}_${form}`,
  };
}

function makeExForSkill(skillKey) {
  const [pronEt, form] = skillKey.split('_');
  const pr = PRONOUNS.find((p) => p.et === pronEt);
  const prof = pick(PROFESSIONS);

  // Progressive distribution across 50 questions:
  // Q 1-10:  80% choice, 15% build,  5% typing   (разогрев)
  // Q 11-25: 40% choice, 25% build, 35% typing   (переход)
  // Q 26-50: 15% choice, 15% build, 70% typing   (хардкор)
  // Overall ~40% choice, 20% build, 40% typing

  const roll = Math.random();
  let type;

  if (qNum <= 10) {
    if (roll < 0.80) type = 'choice';
    else if (roll < 0.95) type = 'build';
    else type = 'typing';
  } else if (qNum <= 25) {
    if (roll < 0.40) type = 'choice';
    else if (roll < 0.65) type = 'build';
    else type = 'typing';
  } else {
    if (roll < 0.15) type = 'choice';
    else if (roll < 0.30) type = 'build';
    else type = 'typing';
  }

  if (type === 'choice') {
    return makeTargetedChoice(pr, prof, form);
  }

  if (type === 'build') {
    return makeTargetedBuild(pr, prof, form);
  }

  // typing (translate, transform, ru-to-et, dictation)
  if (form === 'question') {
    return pick([
      makeTargetedRuToEtTyping,
      makeTargetedDictation
    ])(pr, prof, form);
  }

  return pick([
    makeTargetedRuToEtTyping,
    makeTargetedTranslate,
    makeTargetedTransform,
    makeTargetedDictation
  ])(pr, prof, form);
}

function makeTargetedRuToEtTyping(pr, prof, form) {
  const s = makeSentence(pr, prof, form);

  return {
    type: 'typing',
    label: 'Введи перевод',
    qText: 'Напиши по-эстонски:',
    qRu: s.ru,
    answer: normalize(s.et),
    reveal: s.et,
    _skillKey: `${pr.et}_${form}`
  };
}

function makeTargetedDictation(pr, prof, form) {
  const s = makeSentence(pr, prof, form);

  return {
    type: 'dictation',
    label: 'Аудио-диктант',
    qText: 'Послушай и напиши:',
    audioSentence: s.et,
    answer: normalize(s.et),
    reveal: s.et,
    _skillKey: `${pr.et}_${form}`
  };
}

function startGame(resume = false) {
  if (resume && hasSave()) {
    const data = loadProgress();
    skillState = data.skillState;
    correct = data.correct || 0;
    wrong = data.wrong || 0;
    best = data.best || 0;
  } else {
    initSkills();
    correct = 0;
    wrong = 0;
    best = 0;
  }

  streak = 0;
  qNum = 0;
  ans = false;
  curEx = null;

  $('resultBarFill').style.width = '0%';
  closePauseModal();
  showScr('gameScreen');
  nextQ();
}

function nextQ() {
  if (qNum >= TOTAL) {
    showResults();
    return;
  }

  const skillKey = pickSkill();
  if (!skillKey) {
    showResults();
    return;
  }

  curEx = makeExForSkill(skillKey);
  qNum++;
  renderEx();
}

function renderEx() {
  ans = false;

  const ex = curEx;
  const card = $('questionCard');
  card.classList.remove('animate-in');
  void card.offsetWidth;
  card.classList.add('animate-in');

  $('correctReveal').textContent = '';
  $('nextBtn').style.display = 'none';
  $('qHint').textContent = '';
  $('exerciseTypeLabel').textContent = ex.label || 'Задание';

  $('qText').textContent = ex.qText || '';

  if (ex.qRu) {
    $('qRu').textContent = ex.qRu;
    $('qRu').style.display = '';
  } else {
    $('qRu').style.display = 'none';
  }

  $('exerciseArea').innerHTML = '';
  stopAudio();
  hideReplayBtn();

  if (ex.type === 'choice') renderChoice(ex);
  if (ex.type === 'build') renderBuild(ex);
  if (ex.type === 'typing') renderTyping(ex);
  if (ex.type === 'dictation') renderDictation(ex);

  updStats();
}

function renderChoice(ex) {
  const wrap = document.createElement('div');
  wrap.className = 'options';

  ex.options.forEach((opt) => {
    const b = document.createElement('button');
    b.className = 'option-btn';
    b.textContent = opt;
    b.dataset.value = opt;

    b.addEventListener('click', () => {
      if (ans) return;
      ans = true;

      const ok = opt === ex.answer;

      wrap.querySelectorAll('.option-btn').forEach((btn) => {
        btn.disabled = true;
        if (btn.dataset.value === ex.answer) btn.classList.add('correct-answer');
        else if (btn === b && !ok) btn.classList.add('wrong-answer');
        else btn.classList.add('dimmed');
      });

      proc(ok);
    });

    wrap.appendChild(b);
  });

  $('exerciseArea').appendChild(wrap);
}

function renderBuild(ex) {
  $('qText').textContent = 'Собери предложение из слов:';

  const target = document.createElement('div');
  target.className = 'build-target';

  const bank = document.createElement('div');
  bank.className = 'word-bank';

  const submit = document.createElement('button');
  submit.className = 'build-submit';
  submit.textContent = 'Проверить';
  submit.disabled = true;

  const selected = [];

  ex.bank.forEach((word, index) => {
    const chip = document.createElement('span');
    chip.className = 'word-chip';
    chip.textContent = word;
    chip.dataset.idx = index;

    chip.addEventListener('click', () => {
      if (ans || chip.classList.contains('used')) return;
      chip.classList.add('used');
      selected.push({ word, index });
      renderTarget();
    });

    bank.appendChild(chip);
  });

  function renderTarget() {
    target.innerHTML = '';
    submit.disabled = selected.length === 0;

    selected.forEach((item, i) => {
      const chip = document.createElement('span');
      chip.className = 'word-chip in-target';
      chip.textContent = item.word;

      chip.addEventListener('click', () => {
        if (ans) return;
        selected.splice(i, 1);
        const originalChip = bank.querySelector(`.word-chip[data-idx="${item.index}"]`);
        if (originalChip) originalChip.classList.remove('used');
        renderTarget();
      });

      target.appendChild(chip);
    });
  }

  submit.addEventListener('click', () => {
    if (ans || selected.length === 0) return;
    ans = true;

    const built = selected.map((i) => i.word).join(' ');
    const ok = built === ex.answer.join(' ');

    target.classList.add(ok ? 'correct' : 'wrong');

    if (!ok) {
      $('correctReveal').textContent = `Правильный вариант: ${ex.reveal}`;
    }

    bank.querySelectorAll('.word-chip').forEach((chip) => {
      chip.style.pointerEvents = 'none';
    });

    submit.style.display = 'none';

    proc(ok);
  });

  $('exerciseArea').appendChild(target);
  $('exerciseArea').appendChild(bank);
  $('exerciseArea').appendChild(submit);
}

function renderTyping(ex) {
  if (ex.source) {
    const src = document.createElement('div');
    src.className = 'transform-source';
    src.textContent = ex.source;
    $('exerciseArea').appendChild(src);
  }

  const wrap = document.createElement('div');
  wrap.className = 'typing-area';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'typing-input';
  inp.placeholder = 'Напишите ответ по-эстонски...';
  inp.autocomplete = 'off';
  inp.spellcheck = false;

  const btn = document.createElement('button');
  btn.className = 'typing-submit';
  btn.textContent = 'Проверить';

  btn.addEventListener('click', () => checkTyping(inp, ex, btn));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkTyping(inp, ex, btn);
  });

  wrap.appendChild(inp);
  wrap.appendChild(btn);
  $('exerciseArea').appendChild(wrap);

  setTimeout(() => inp.focus(), 80);
}

function checkTyping(inp, ex, btn) {
  if (ans) return;

  const val = normalize(inp.value);
  if (!val) {
    showToast('Сначала введи ответ');
    return;
  }

  ans = true;
  inp.disabled = true;
  if (btn) btn.style.display = 'none';

  const ok = val === normalize(ex.answer);
  inp.classList.add(ok ? 'correct' : 'wrong');

  if (!ok) {
    inp.classList.add('shake');
    $('correctReveal').textContent = `Правильный вариант: ${ex.reveal}`;
  }

  proc(ok);
}

function renderDictation(ex) {
  $('qRu').style.display = 'none';

  const area = $('exerciseArea');

  // Play button
  const playRow = document.createElement('div');
  playRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:16px;';

  const playBtn = document.createElement('button');
  playBtn.className = 'btn btn-secondary';
  playBtn.style.cssText = 'width:auto;padding:12px 20px;font-size:1.2rem;';
  playBtn.textContent = '🔊 Послушать';
  playBtn.addEventListener('click', () => playAudio(ex.audioSentence));

  playRow.appendChild(playBtn);
  area.appendChild(playRow);

  // Auto-play on render
  setTimeout(() => playAudio(ex.audioSentence), 300);

  // Input area
  const wrap = document.createElement('div');
  wrap.className = 'typing-area';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'typing-input';
  inp.placeholder = 'Напиши что услышал(а)...';
  inp.autocomplete = 'off';
  inp.spellcheck = false;

  const btn = document.createElement('button');
  btn.className = 'typing-submit';
  btn.textContent = 'Проверить';

  btn.addEventListener('click', () => checkTyping(inp, ex, btn));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkTyping(inp, ex, btn);
  });

  wrap.appendChild(inp);
  wrap.appendChild(btn);
  area.appendChild(wrap);

  setTimeout(() => inp.focus(), 400);
}

// ── AUDIO REPLAY BUTTON (shown after answer) ──
function showReplayBtn(sentence) {
  hideReplayBtn();
  const container = $('correctReveal').parentNode;
  const row = document.createElement('div');
  row.id = 'audioReplayRow';
  row.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px;';

  const btn = document.createElement('button');
  btn.className = 'btn btn-secondary';
  btn.style.cssText = 'width:auto;padding:8px 16px;font-size:0.85rem;';
  btn.textContent = '🔊 Послушать ещё';
  btn.addEventListener('click', () => playAudio(sentence));

  row.appendChild(btn);
  $('nextBtn').parentNode.insertBefore(row, $('nextBtn'));
}

function hideReplayBtn() {
  const existing = $('audioReplayRow');
  if (existing) existing.remove();
}

function proc(ok) {
  const now = Date.now();
  const DAY = 86400000; // ms in a day

  if (curEx._skillKey && skillState[curEx._skillKey]) {
    const sk = skillState[curEx._skillKey];
    sk.lastReview = now;

    // SM-2 quality score: 0-5
    // Higher = easier recall. Exercise type affects score.
    let quality;
    if (ok) {
      if (curEx.type === 'typing') quality = 5;      // hardest exercise, easy recall = best score
      else if (curEx.type === 'build') quality = 4;
      else quality = 3;                                // choice = lowest correct score
    } else {
      quality = 1;                                     // wrong answer
    }

    if (ok) {
      sk.totalCorrect++;
      sk.streak++;

      // Level progression (exercise difficulty)
      if (sk.streak >= UP) {
        if (sk.level < MAXLVL) { sk.level++; sk.streak = 0; }
        else { sk.done = true; }
      }

      // SM-2 interval calculation
      if (sk.reps === 0) {
        sk.interval = 1;           // first correct: review in 1 day
      } else if (sk.reps === 1) {
        sk.interval = 3;           // second correct: review in 3 days
      } else {
        sk.interval = Math.round(sk.interval * sk.ef);
      }
      sk.reps++;

      // Update easiness factor
      sk.ef = sk.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (sk.ef < 1.3) sk.ef = 1.3;

      // Set next review time
      sk.nextReview = now + (sk.interval * DAY);

    } else {
      sk.totalWrong++;
      sk.streak = 0;

      // SM-2: wrong answer resets repetitions, review again soon
      sk.reps = 0;
      sk.interval = 0;
      sk.nextReview = now + (10 * 60 * 1000); // review in 10 minutes

      // Decrease EF slightly
      sk.ef = Math.max(1.3, sk.ef - 0.2);

      // Level regression
      if (sk.level > 0) sk.level--;
    }
  }

  if (ok) {
    correct++;
    streak++;
    if (streak > best) best = streak;
  } else {
    wrong++;
    streak = 0;
  }

  gamifyOnAnswer(ok, curEx.type);
  updStats();
  saveProgress();

  // Get the sentence to play (reveal has the correct Estonian sentence)
  const sentence = curEx.reveal || curEx.audioSentence || '';
  const nextBtn = $('nextBtn');
  nextBtn.textContent = qNum >= TOTAL ? 'Результаты' : 'Далее';

  if (sentence) {
    // Auto-play audio, show next button after it finishes
    showReplayBtn(sentence);
    setTimeout(() => {
      playAudio(sentence).then(() => {
        nextBtn.style.display = 'block';
      });
    }, 300);
  } else {
    nextBtn.style.display = 'block';
  }
}

function showResults() {
  showScr('resultScreen');

  const answered = correct + wrong;
  const pct = answered ? Math.round((correct / answered) * 100) : 0;

  $('resultCorrect').textContent = correct;
  $('resultWrong').textContent = wrong;
  $('resultBest').textContent = best;
  $('resultPercent').textContent = `${pct}% точность · ${answered} ответов`;

  let emoji = '🎉';
  let title = 'Отличный результат!';
  let subtitle = 'Ты уверенно ориентируешься в местоимениях и формах olema.';

  if (pct < 40) {
    emoji = '📚';
    title = 'Нужно ещё немного практики';
    subtitle = 'Это нормально. Повтори ещё раз — с каждым кругом формы будут запоминаться легче.';
  } else if (pct < 70) {
    emoji = '💪';
    title = 'Хорошее начало';
    subtitle = 'База уже формируется. Ещё одна сессия — и результат станет заметно лучше.';
  } else if (pct < 90) {
    emoji = '🔥';
    title = 'Очень хорошо!';
    subtitle = 'Ты уже уверенно держишь темп. Попробуй пройти ещё раз без ошибок.';
  }

  $('resultEmoji').textContent = emoji;
  $('resultTitle').textContent = title;
  $('resultSubtitle').textContent = subtitle;

  setTimeout(() => {
    $('resultBarFill').style.width = `${pct}%`;
  }, 140);

  gamifyOnSessionEnd();
  renderResultBadges();
  refreshHeatmaps();
  checkSaved();
}

function bindEvents() {
  $('startBtn').addEventListener('click', () => startGame(false));
  $('pauseBtn').addEventListener('click', openPauseModal);
  $('resumeBtn').addEventListener('click', closePauseModal);
  $('restartBtn').addEventListener('click', restartFromPause);
  $('pauseHomeBtn').addEventListener('click', goHomeFromPause);
  $('retryBtn').addEventListener('click', () => startGame(false));
  $('homeBtn').addEventListener('click', () => {
    showScr('startScreen');
    checkSaved();
    renderStartScreenBadges();
    refreshHeatmaps();
  });
  $('nextBtn').addEventListener('click', nextQ);

  $('pauseModal').addEventListener('click', (e) => {
    if (e.target.id === 'pauseModal') closePauseModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('pauseModal').classList.contains('show')) closePauseModal();
      else if ($('gameScreen').classList.contains('active')) openPauseModal();
    }

    if (e.key === 'Enter' && $('nextBtn').style.display === 'block') {
      nextQ();
    }
  });
}

// ═══════════════════════════════════════════
// ── GAMIFICATION (XP, Daily Streak, Badges)
// ═══════════════════════════════════════════

const GAMIFY_KEY = 'olema_gamify';

const XP_TABLE = {
  choice: 10,
  build: 20,
  typing: 30,
  dictation: 35,
};

const BADGES = [
  { id: 'first_session', icon: '🌱', name: 'Первые шаги', desc: 'Заверши первую сессию', check: g => g.sessionsCompleted >= 1 },
  { id: 'streak_5', icon: '🔥', name: 'Разогрев', desc: '5 правильных подряд за сессию', check: g => g.bestSessionStreak >= 5 },
  { id: 'streak_10', icon: '⚡', name: 'Молния', desc: '10 правильных подряд', check: g => g.bestSessionStreak >= 10 },
  { id: 'streak_20', icon: '🌪', name: 'Ураган', desc: '20 правильных подряд', check: g => g.bestSessionStreak >= 20 },
  { id: 'xp_100', icon: '⭐', name: 'Сотня', desc: 'Набери 100 XP', check: g => g.xp >= 100 },
  { id: 'xp_500', icon: '🌟', name: 'Полтысячи', desc: 'Набери 500 XP', check: g => g.xp >= 500 },
  { id: 'xp_1000', icon: '💎', name: 'Тысячник', desc: 'Набери 1000 XP', check: g => g.xp >= 1000 },
  { id: 'daily_3', icon: '📅', name: '3 дня подряд', desc: 'Занимайся 3 дня подряд', check: g => g.dailyStreak >= 3 },
  { id: 'daily_7', icon: '🏆', name: 'Неделя!', desc: '7 дней подряд', check: g => g.dailyStreak >= 7 },
  { id: 'daily_14', icon: '👑', name: 'Две недели', desc: '14 дней без перерыва', check: g => g.dailyStreak >= 14 },
  { id: 'all_reviewed', icon: '🗺', name: 'Полный обзор', desc: 'Повтори все 18 навыков', check: g => g.skillsReviewed >= 18 },
  { id: 'all_mastered', icon: '🎓', name: 'Магистр', desc: 'Освой все 18 навыков', check: g => g.skillsMastered >= 18 },
  { id: 'correct_50', icon: '📝', name: 'Полсотни', desc: '50 правильных ответов всего', check: g => g.totalCorrect >= 50 },
  { id: 'correct_200', icon: '📚', name: 'Книжный червь', desc: '200 правильных ответов', check: g => g.totalCorrect >= 200 },
  { id: 'dictation_10', icon: '🎧', name: 'Слушатель', desc: '10 диктантов правильно', check: g => g.dictationCorrect >= 10 },
  { id: 'perfect_session', icon: '💯', name: 'Идеально!', desc: 'Сессия без единой ошибки', check: g => g.hadPerfectSession },
];

let gamifyState = null;

function initGamify() {
  const saved = loadGamify();
  if (saved) {
    gamifyState = saved;
  } else {
    gamifyState = {
      xp: 0,
      level: 1,
      dailyStreak: 0,
      lastPracticeDate: null,  // 'YYYY-MM-DD'
      bestDailyStreak: 0,
      sessionsCompleted: 0,
      bestSessionStreak: 0,
      totalCorrect: 0,
      totalWrong: 0,
      dictationCorrect: 0,
      hadPerfectSession: false,
      skillsReviewed: 0,
      skillsMastered: 0,
      earnedBadges: [],        // array of badge ids
    };
  }
  updateDailyStreak();
}

function loadGamify() {
  try {
    const raw = localStorage.getItem(GAMIFY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveGamify() {
  try { localStorage.setItem(GAMIFY_KEY, JSON.stringify(gamifyState)); } catch (e) {}
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function updateDailyStreak() {
  const today = todayStr();
  if (!gamifyState.lastPracticeDate) return; // no history yet

  const last = gamifyState.lastPracticeDate;
  if (last === today) return; // already practiced today

  // Check if yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split('T')[0];

  if (last === yStr) {
    // Streak continues (will be incremented on first answer today)
  } else if (last < yStr) {
    // Missed a day — reset streak
    gamifyState.dailyStreak = 0;
  }
  saveGamify();
}

function recordPracticeToday() {
  const today = todayStr();
  if (gamifyState.lastPracticeDate !== today) {
    gamifyState.dailyStreak++;
    if (gamifyState.dailyStreak > gamifyState.bestDailyStreak) {
      gamifyState.bestDailyStreak = gamifyState.dailyStreak;
    }
    gamifyState.lastPracticeDate = today;
    saveGamify();
  }
}

function getXpForLevel(level) {
  // XP needed to reach next level: 50, 120, 210, 320...
  return level * 50 + (level - 1) * 20;
}

function getTotalXpForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += getXpForLevel(i);
  return total;
}

function addXp(amount) {
  gamifyState.xp += amount;
  // Check level up
  while (gamifyState.xp >= getTotalXpForLevel(gamifyState.level + 1)) {
    gamifyState.level++;
    showToast(`🎉 Уровень ${gamifyState.level}!`);
  }
  saveGamify();
}

function gamifyOnAnswer(ok, exerciseType) {
  recordPracticeToday();

  if (ok) {
    const baseXp = XP_TABLE[exerciseType] || 10;
    const streakBonus = Math.min(streak, 10) * 2; // up to +20 bonus for streak
    const totalXp = baseXp + streakBonus;
    addXp(totalXp);
    gamifyState.totalCorrect++;
    if (exerciseType === 'dictation') gamifyState.dictationCorrect++;
  } else {
    gamifyState.totalWrong++;
  }

  // Update skill counts from skillState
  gamifyState.skillsReviewed = Object.values(skillState).filter(s => s.lastReview > 0).length;
  gamifyState.skillsMastered = Object.values(skillState).filter(s => s.done).length;

  if (streak > gamifyState.bestSessionStreak) {
    gamifyState.bestSessionStreak = streak;
  }

  checkNewBadges();
  saveGamify();
}

function gamifyOnSessionEnd() {
  gamifyState.sessionsCompleted++;
  if (wrong === 0 && correct >= 10) {
    gamifyState.hadPerfectSession = true;
  }
  checkNewBadges();
  saveGamify();
}

function checkNewBadges() {
  BADGES.forEach(badge => {
    if (!gamifyState.earnedBadges.includes(badge.id) && badge.check(gamifyState)) {
      gamifyState.earnedBadges.push(badge.id);
      showToast(`${badge.icon} ${badge.name}!`);
    }
  });
}

// ── GAMIFY UI (injected dynamically) ──

function renderXpBar() {
  let bar = $('xpBarWidget');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'xpBarWidget';
    bar.style.cssText = 'margin-bottom:14px;padding:10px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);';
    // Insert after stats
    const stats = document.querySelector('.stats');
    if (stats) stats.parentNode.insertBefore(bar, stats.nextSibling);
  }

  const g = gamifyState;
  const currentLevelXp = getTotalXpForLevel(g.level);
  const nextLevelXp = getTotalXpForLevel(g.level + 1);
  const progress = nextLevelXp > currentLevelXp
    ? ((g.xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100
    : 100;

  bar.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:.78rem;font-weight:800;">⭐ Уровень ${g.level}</span>
      <span style="font-size:.72rem;font-family:'DM Mono',monospace;color:var(--text-dim);">${g.xp} XP${g.dailyStreak > 0 ? ' · 🔥 ' + g.dailyStreak + ' д.' : ''}</span>
    </div>
    <div style="height:6px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden;">
      <div style="height:100%;width:${Math.min(progress, 100)}%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent-2));transition:width .4s ease;"></div>
    </div>
  `;
}

function renderStartScreenBadges() {
  let container = $('startBadges');
  if (!container) {
    container = document.createElement('div');
    container.id = 'startBadges';
    container.style.cssText = 'width:100%;margin-top:8px;';
    const info = document.querySelector('.start-info');
    if (info) info.parentNode.insertBefore(container, info);
  }

  const g = gamifyState;
  if (!g || g.xp === 0) { container.innerHTML = ''; return; }

  const earned = BADGES.filter(b => g.earnedBadges.includes(b.id));
  const badgeIcons = earned.map(b => `<span title="${b.name}" style="font-size:1.3rem;cursor:default;">${b.icon}</span>`).join(' ');

  container.innerHTML = `
    <div style="padding:14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);text-align:center;">
      <div style="display:flex;justify-content:center;gap:16px;margin-bottom:8px;">
        <span style="font-size:.78rem;font-weight:700;">⭐ Ур. ${g.level}</span>
        <span style="font-size:.78rem;font-weight:700;">${g.xp} XP</span>
        <span style="font-size:.78rem;font-weight:700;">🔥 ${g.dailyStreak} д.</span>
      </div>
      ${earned.length > 0 ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;">${badgeIcons}</div>` : ''}
      <div style="margin-top:6px;font-size:.7rem;color:var(--text-dim);font-family:'DM Mono',monospace;">${earned.length}/${BADGES.length} достижений</div>
    </div>
  `;
}

function renderResultBadges() {
  let container = $('resultBadges');
  if (!container) {
    container = document.createElement('div');
    container.id = 'resultBadges';
    container.style.cssText = 'width:100%;margin-top:12px;';
    const resultPercent = $('resultPercent');
    if (resultPercent) resultPercent.parentNode.insertBefore(container, resultPercent.nextSibling);
  }

  const g = gamifyState;
  const sessionXp = correct * 20; // approximate

  const earned = BADGES.filter(b => g.earnedBadges.includes(b.id));
  const badgeIcons = earned.map(b => `<span title="${b.name}: ${b.desc}" style="font-size:1.5rem;cursor:default;">${b.icon}</span>`).join(' ');

  container.innerHTML = `
    <div style="padding:14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);text-align:center;">
      <div style="font-size:.78rem;font-weight:700;margin-bottom:8px;">⭐ Уровень ${g.level} · ${g.xp} XP · 🔥 ${g.dailyStreak} д.</div>
      ${earned.length > 0 ? `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;">${badgeIcons}</div>` : '<div style="font-size:.8rem;color:var(--text-dim);">Продолжай — первые достижения уже близко!</div>'}
    </div>
  `;
}

// ═══════════════════════════════════════════
// ── ANALYTICS (Heatmap & Weak Spots)
// ═══════════════════════════════════════════

function getSkillStrength(sk) {
  // Returns 0-100 strength score for a skill
  if (!sk || sk.lastReview === 0) return -1; // not started
  const ratio = sk.totalCorrect + sk.totalWrong > 0
    ? sk.totalCorrect / (sk.totalCorrect + sk.totalWrong)
    : 0;
  const efScore = ((sk.ef - 1.3) / (2.5 - 1.3)); // 0-1 based on easiness
  const levelScore = sk.level / MAXLVL;
  const repsScore = Math.min(sk.reps / 5, 1);
  return Math.round((ratio * 30 + efScore * 25 + levelScore * 25 + repsScore * 20));
}

function strengthToColor(strength) {
  if (strength < 0) return 'rgba(255,255,255,.04)'; // not started
  if (strength < 25) return 'rgba(255,107,122,.35)'; // weak — red
  if (strength < 50) return 'rgba(255,204,102,.30)'; // medium — yellow
  if (strength < 75) return 'rgba(69,208,255,.25)';  // good — blue
  return 'rgba(61,220,151,.30)';                      // strong — green
}

function strengthToLabel(strength) {
  if (strength < 0) return '—';
  if (strength < 25) return 'Слабо';
  if (strength < 50) return 'Средне';
  if (strength < 75) return 'Хорошо';
  return 'Сильно';
}

function strengthToBorder(strength) {
  if (strength < 0) return 'rgba(255,255,255,.06)';
  if (strength < 25) return 'rgba(255,107,122,.4)';
  if (strength < 50) return 'rgba(255,204,102,.35)';
  if (strength < 75) return 'rgba(69,208,255,.3)';
  return 'rgba(61,220,151,.35)';
}

function getWeakSpots() {
  // Return top 3 weakest skills that have been reviewed
  return Object.entries(skillState)
    .filter(([_, sk]) => sk.lastReview > 0)
    .map(([key, sk]) => ({ key, strength: getSkillStrength(sk), sk }))
    .sort((a, b) => a.strength - b.strength)
    .slice(0, 3);
}

function formatSkillKey(key) {
  const [pron, form] = key.split('_');
  const pronLabel = { ma:'ma', sa:'sa', ta:'ta', me:'me', te:'te', nad:'nad' }[pron] || pron;
  const formLabel = { pos:'✓', neg:'✗', question:'?' }[form] || form;
  const formRu = { pos:'утв.', neg:'отр.', question:'вопр.' }[form] || form;
  return { pronLabel, formLabel, formRu };
}

function renderHeatmap(containerId) {
  let container = $(containerId);
  if (!container) return;

  const pronouns = ['ma', 'sa', 'ta', 'me', 'te', 'nad'];
  const forms = ['pos', 'neg', 'question'];
  const formHeaders = ['✓ Утв.', '✗ Отр.', '? Вопр.'];
  const state = skillState;

  // Check if any skills have been reviewed
  const anyReviewed = Object.values(state).some(sk => sk.lastReview > 0);
  if (!anyReviewed) {
    container.innerHTML = `
      <div style="padding:16px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);text-align:center;">
        <div style="font-size:.82rem;color:var(--text-dim);">Пройди хотя бы одну сессию — и здесь появится карта твоих знаний</div>
      </div>
    `;
    return;
  }

  // Build grid HTML
  let gridHtml = `
    <div style="display:grid;grid-template-columns:auto 1fr 1fr 1fr;gap:4px;font-family:'DM Mono',monospace;font-size:.72rem;">
      <div style="padding:6px;"></div>
  `;

  formHeaders.forEach(h => {
    gridHtml += `<div style="padding:6px;text-align:center;color:var(--text-dim);font-weight:600;font-size:.68rem;">${h}</div>`;
  });

  pronouns.forEach(pron => {
    gridHtml += `<div style="padding:8px 10px;font-weight:700;color:var(--text);font-size:.82rem;">${pron}</div>`;

    forms.forEach(form => {
      const key = `${pron}_${form}`;
      const sk = state[key];
      const strength = getSkillStrength(sk);
      const bg = strengthToColor(strength);
      const border = strengthToBorder(strength);
      const label = strength >= 0 ? strength : '';
      const levelDots = sk && sk.lastReview > 0
        ? '●'.repeat(sk.level + 1) + '○'.repeat(MAXLVL - sk.level)
        : '';

      gridHtml += `
        <div style="padding:8px 4px;text-align:center;border-radius:10px;background:${bg};border:1px solid ${border};transition:all .2s;">
          <div style="font-weight:700;font-size:.82rem;">${label}</div>
          <div style="font-size:.6rem;color:var(--text-dim);margin-top:2px;">${levelDots}</div>
        </div>
      `;
    });
  });

  gridHtml += '</div>';

  // Weak spots
  const weakSpots = getWeakSpots();
  let weakHtml = '';
  if (weakSpots.length > 0) {
    weakHtml = `
      <div style="margin-top:12px;padding:12px;border-radius:12px;background:rgba(255,107,122,.06);border:1px solid rgba(255,107,122,.15);">
        <div style="font-size:.72rem;font-weight:700;color:rgba(255,107,122,.9);margin-bottom:8px;">⚠ Слабые места:</div>
        ${weakSpots.map(w => {
          const { pronLabel, formRu } = formatSkillKey(w.key);
          const details = `${w.sk.totalCorrect}✓ ${w.sk.totalWrong}✗`;
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:.78rem;">
            <span><strong>${pronLabel}</strong> · ${formRu}</span>
            <span style="color:var(--text-dim);font-family:'DM Mono',monospace;font-size:.7rem;">${details} · сила ${w.strength}</span>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  // Legend
  const legendHtml = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;justify-content:center;">
      <span style="font-size:.65rem;color:var(--text-dim);">
        <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:rgba(255,107,122,.35);vertical-align:middle;"></span> Слабо
      </span>
      <span style="font-size:.65rem;color:var(--text-dim);">
        <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:rgba(255,204,102,.30);vertical-align:middle;"></span> Средне
      </span>
      <span style="font-size:.65rem;color:var(--text-dim);">
        <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:rgba(69,208,255,.25);vertical-align:middle;"></span> Хорошо
      </span>
      <span style="font-size:.65rem;color:var(--text-dim);">
        <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:rgba(61,220,151,.30);vertical-align:middle;"></span> Сильно
      </span>
    </div>
  `;

  container.innerHTML = `
    <div style="padding:16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);">
      <div style="font-size:.78rem;font-weight:800;margin-bottom:12px;">📊 Карта знаний</div>
      ${gridHtml}
      ${legendHtml}
      ${weakHtml}
    </div>
  `;
}

function injectHeatmapContainers() {
  // Start screen heatmap
  if (!$('startHeatmap')) {
    const el = document.createElement('div');
    el.id = 'startHeatmap';
    el.style.cssText = 'width:100%;margin-top:12px;';
    const startBadges = $('startBadges');
    if (startBadges) {
      startBadges.parentNode.insertBefore(el, startBadges.nextSibling);
    } else {
      const info = document.querySelector('.start-info');
      if (info) info.parentNode.insertBefore(el, info);
    }
  }

  // Result screen heatmap
  if (!$('resultHeatmap')) {
    const el = document.createElement('div');
    el.id = 'resultHeatmap';
    el.style.cssText = 'width:100%;margin-top:12px;';
    const resultBadges = $('resultBadges');
    if (resultBadges) {
      resultBadges.parentNode.insertBefore(el, resultBadges.nextSibling);
    } else {
      const resultPercent = $('resultPercent');
      if (resultPercent) resultPercent.parentNode.insertBefore(el, resultPercent.nextSibling);
    }
  }
}

function refreshHeatmaps() {
  injectHeatmapContainers();
  renderHeatmap('startHeatmap');
  renderHeatmap('resultHeatmap');
}

function init() {
  initSkills();
  initGamify();
  bindEvents();
  checkSaved();
  renderStartScreenBadges();
  injectHeatmapContainers();
  renderHeatmap('startHeatmap');
}

init();