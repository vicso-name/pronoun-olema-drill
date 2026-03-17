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
const TOTAL = 30;
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

function initSkills() {
  skillState = {};

  PRONOUNS.forEach((pr) => {
    ['pos', 'neg', 'question'].forEach((form) => {
      const key = `${pr.et}_${form}`;
      skillState[key] = { level: 0, streak: 0, done: false };
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
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function allDoneFromData(data) {
  return data?.skillState && Object.values(data.skillState).filter((s) => s.done).length >= 18;
}

function hasSave() {
  const data = loadProgress();
  return Boolean(data && data.skillState && !allDoneFromData(data));
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
    const mastered = Object.values(data.skillState).filter((s) => s.done).length;
    contBtn.style.display = '';
    contBtn.textContent = `Продолжить обучение (${mastered}/18 освоено)`;
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

  $('sessionMeta').textContent = `Отвечено: ${answered} · Осталось: ${Math.max(TOTAL - qNum, 0)}`;
}

function pickSkill() {
  const unmastered = Object.entries(skillState).filter(([_, s]) => !s.done);
  if (!unmastered.length) return null;

  const weighted = [];

  unmastered.forEach(([key, s]) => {
    const weight = 4 - s.level + (s.streak === 0 ? 2 : 0);
    for (let i = 0; i < weight; i++) weighted.push(key);
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
  const sk = skillState[skillKey];

  if (sk.level === 0) return makeTargetedChoice(pr, prof, form);
  if (sk.level === 1) return makeTargetedBuild(pr, prof, form);
  if (form === 'question') return makeTargetedTranslate(pr, prof, form);

  return pick([makeTargetedTransform, makeTargetedTranslate])(pr, prof, form);
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

  if (ex.type === 'choice') renderChoice(ex);
  if (ex.type === 'build') renderBuild(ex);
  if (ex.type === 'typing') renderTyping(ex);

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
  inp.placeholder = 'Введите ответ...';
  inp.autocomplete = 'off';
  inp.spellcheck = false;

  const btn = document.createElement('button');
  btn.className = 'typing-submit';
  btn.textContent = 'Проверить';

  btn.addEventListener('click', () => checkTyping(inp, ex));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkTyping(inp, ex);
  });

  wrap.appendChild(inp);
  wrap.appendChild(btn);
  $('exerciseArea').appendChild(wrap);

  setTimeout(() => inp.focus(), 80);
}

function checkTyping(inp, ex) {
  if (ans) return;

  const val = normalize(inp.value);
  if (!val) {
    showToast('Сначала введи ответ');
    return;
  }

  ans = true;
  inp.disabled = true;

  const ok = val === normalize(ex.answer);
  inp.classList.add(ok ? 'correct' : 'wrong');

  if (!ok) {
    inp.classList.add('shake');
    $('correctReveal').textContent = `Правильный вариант: ${ex.reveal}`;
  }

  proc(ok);
}

function proc(ok) {
  if (curEx._skillKey && skillState[curEx._skillKey]) {
    const sk = skillState[curEx._skillKey];

    if (ok) {
      sk.streak++;
      if (sk.streak >= UP) {
        if (sk.level < MAXLVL) {
          sk.level++;
          sk.streak = 0;
        } else {
          sk.done = true;
        }
      }
    } else {
      sk.streak = 0;
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

  $('nextBtn').style.display = 'block';
  $('nextBtn').textContent = qNum >= TOTAL ? 'Результаты' : 'Далее';
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