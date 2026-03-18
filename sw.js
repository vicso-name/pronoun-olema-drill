const CACHE_NAME = 'olema-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
];

// All 72 audio files
const AUDIO_FILES = [];
const pronouns = ['ma', 'sa', 'ta', 'me', 'te', 'nad'];
const olema = { ma: 'olen', sa: 'oled', ta: 'on', me: 'oleme', te: 'olete', nad: 'on' };
const professions = [
  { sg: 'arst', pl: 'arstid' },
  { sg: 'õpetaja', pl: 'õpetajad' },
  { sg: 'programmeerija', pl: 'programmeerijad' },
  { sg: 'õpilane', pl: 'õpilased' },
];
const pluralPronouns = ['me', 'te', 'nad'];

pronouns.forEach(pr => {
  const verb = olema[pr];
  const isPlural = pluralPronouns.includes(pr);
  professions.forEach(prof => {
    const noun = isPlural ? prof.pl : prof.sg;
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const toFile = text => {
      let name = text.toLowerCase().trim().replace(/\?$/, '').trim();
      name = name.replace(/[^a-zõäöü\s]/g, '');
      name = name.replace(/\s+/g, '_').trim();
      return './audio/' + name + '.mp3';
    };
    AUDIO_FILES.push(toFile(`${cap(pr)} ${verb} ${noun}`));
    AUDIO_FILES.push(toFile(`${cap(pr)} ei ole ${noun}`));
    AUDIO_FILES.push(toFile(`Kas ${pr} ${verb} ${noun}?`));
  });
});

const ALL_ASSETS = [...STATIC_ASSETS, ...AUDIO_FILES];

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ALL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first strategy
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Cache new requests on the fly
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback for HTML
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
