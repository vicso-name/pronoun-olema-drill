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

function init() {
  initSkills();
  bindEvents();
  checkSaved();
}

init();