const CACHE_NAME = 'olema-v2';

const STATIC = ['./', './index.html', './styles.css', './engine.js', './data.js', './manifest.json'];

// Generate audio file list (72 files: 6 pronouns × 4 professions × 3 forms)
const pronouns = ['ma', 'sa', 'ta', 'me', 'te', 'nad'];
const olema = { ma: 'olen', sa: 'oled', ta: 'on', me: 'oleme', te: 'olete', nad: 'on' };
const professions = [
  { sg: 'arst', pl: 'arstid' },
  { sg: 'õpetaja', pl: 'õpetajad' },
  { sg: 'programmeerija', pl: 'programmeerijad' },
  { sg: 'õpilane', pl: 'õpilased' },
];
const pluralPronouns = ['me', 'te', 'nad'];

const toFile = text => {
  let name = text.toLowerCase().trim().replace(/[?.!,]/g, '').trim();
  name = name.replace(/[^a-zõäöü0-9\s]/g, '');
  name = name.replace(/\s+/g, '_').trim();
  return './audio/' + name + '.mp3';
};

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const AUDIO = [];
pronouns.forEach(pr => {
  const verb = olema[pr];
  const isPlural = pluralPronouns.includes(pr);
  professions.forEach(prof => {
    const noun = isPlural ? prof.pl : prof.sg;
    AUDIO.push(toFile(`${cap(pr)} ${verb} ${noun}`));
    AUDIO.push(toFile(`${cap(pr)} ei ole ${noun}`));
    AUDIO.push(toFile(`Kas ${pr} ${verb} ${noun}`));
  });
});

const ALL = [...STATIC, ...new Set(AUDIO)];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ALL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(c => c || fetch(e.request).then(r => {
      if (r.ok) { const cl = r.clone(); caches.open(CACHE_NAME).then(ca => ca.put(e.request, cl)); }
      return r;
    })).catch(() => e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)
  );
});