from google.cloud import texttospeech
import os
import re

# Путь к сервисному JSON-ключу
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "alefbettutor-6097c797d04a.json"

client = texttospeech.TextToSpeechClient()

# ── ДАННЫЕ ──
PRONOUNS = [
    {"et": "ma", "plural": False},
    {"et": "sa", "plural": False},
    {"et": "ta", "plural": False},
    {"et": "me", "plural": True},
    {"et": "te", "plural": True},
    {"et": "nad", "plural": True},
]

OLEMA = {
    "ma": "olen", "sa": "oled", "ta": "on",
    "me": "oleme", "te": "olete", "nad": "on"
}

PROFESSIONS = [
    {"sg": "arst", "pl": "arstid"},
    {"sg": "õpetaja", "pl": "õpetajad"},
    {"sg": "programmeerija", "pl": "programmeerijad"},
    {"sg": "õpilane", "pl": "õpilased"},
]

def cap(s):
    return s[0].upper() + s[1:]

def make_filename(text):
    """Превращает текст в имя файла: 'Ma olen arst' -> 'ma_olen_arst'"""
    name = text.lower().strip().rstrip("?").strip()
    name = re.sub(r'[^a-zõäöü\s]', '', name)
    name = re.sub(r'\s+', '_', name.strip())
    return name

# ── ГЕНЕРАЦИЯ СПИСКА ПРЕДЛОЖЕНИЙ ──
sentences = []

for pr in PRONOUNS:
    verb = OLEMA[pr["et"]]
    for prof in PROFESSIONS:
        noun = prof["pl"] if pr["plural"] else prof["sg"]

        # Утверждение: Ma olen arst
        pos = f"{cap(pr['et'])} {verb} {noun}"
        sentences.append(pos)

        # Отрицание: Ma ei ole arst
        neg = f"{cap(pr['et'])} ei ole {noun}"
        sentences.append(neg)

        # Вопрос: Kas ma olen arst?
        q = f"Kas {pr['et']} {verb} {noun}?"
        sentences.append(q)

# Убираем дубликаты (на всякий случай)
sentences = list(dict.fromkeys(sentences))

print(f"📚 Всего предложений: {len(sentences)}")

# ── ГЕНЕРАЦИЯ АУДИО ──
output_dir = "audio"
os.makedirs(output_dir, exist_ok=True)

# Эстонский голос Google Cloud TTS
voice = texttospeech.VoiceSelectionParams(
    language_code="et-EE",
    name="et-EE-Chirp3-HD-Umbriel",
)

audio_config = texttospeech.AudioConfig(
    audio_encoding=texttospeech.AudioEncoding.MP3,
    speaking_rate=0.9,  # Чуть медленнее для обучения
)

generated = []
errors = []

for i, text in enumerate(sentences, 1):
    filename = f"{make_filename(text)}.mp3"
    filepath = os.path.join(output_dir, filename)

    # Пропускаем если уже существует
    if os.path.exists(filepath):
        print(f"[{i}/{len(sentences)}] ⏭ Уже есть: {filename}")
        generated.append(filename)
        continue

    print(f"[{i}/{len(sentences)}] 🎵 {text} -> {filename}")

    try:
        synthesis_input = texttospeech.SynthesisInput(text=text)
        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config
        )

        with open(filepath, "wb") as out:
            out.write(response.audio_content)

        generated.append(filename)

    except Exception as e:
        print(f"  ❌ Ошибка: {e}")
        errors.append((text, str(e)))

print(f"\n🎉 Готово! Создано: {len(generated)} файлов")
if errors:
    print(f"⚠ Ошибки: {len(errors)}")
    for text, err in errors:
        print(f"  - {text}: {err}")

print(f"\n📁 Файлы в папке: {output_dir}/")
print(f"💡 Скопируй папку audio/ в репозиторий pronoun-olema-drill")
