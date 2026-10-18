let currentAudio = null;
let playbackGeneration = 0;
let resolvePlaybackStart = null;

/** Browser speech adapter. Speech recognition is available only in supported browsers. */
export function createSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  return SpeechRecognition ? new SpeechRecognition() : null;
}

export function canSpeak() {
  return typeof window !== 'undefined'
    && (typeof window.Audio === 'function'
      || ('speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined'));
}

/** Warm the browser's voice list before the first reply; some browsers load it asynchronously. */
export function prepareSpeechVoices() {
  if (!canSpeak()) return;
  window.speechSynthesis.getVoices();
}

function chooseVoice(voices) {
  const englishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('en-'));
  const indianEnglish = englishVoices.filter((voice) => voice.lang.toLowerCase() === 'en-in');
  const naturalVoice = (list) => list.find((voice) => /natural|neural|online/i.test(voice.name));

  return naturalVoice(indianEnglish)
    ?? indianEnglish.find((voice) => /microsoft|google/i.test(voice.name))
    ?? indianEnglish[0]
    ?? naturalVoice(englishVoices)
    ?? englishVoices.find((voice) => /microsoft|google/i.test(voice.name))
    ?? englishVoices[0]
    ?? null;
}

export function speakReply(text, onFinished) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) {
    onFinished?.();
    return;
  }
  const utterance = new window.SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = chooseVoice(voices);
  utterance.lang = utterance.voice?.lang ?? 'en-IN';
  utterance.rate = 1.04;
  utterance.pitch = 1.03;
  utterance.onend = onFinished;
  utterance.onerror = onFinished;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** Plays the generated voice audio returned by the backend's server-side Groq TTS call. */
export async function playGeneratedSpeech(audioBase64, onFinished, onPlaybackError) {
  const segments = (Array.isArray(audioBase64) ? audioBase64 : [audioBase64]).filter(Boolean);
  if (segments.length === 0 || typeof window === 'undefined' || typeof window.Audio !== 'function') return false;
  stopSpeaking();
  const generation = playbackGeneration;
  let index = 0;
  let hasStarted = false;
  let resolveStarted;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  resolvePlaybackStart = resolveStarted;

  function playNextSegment() {
    if (generation !== playbackGeneration) {
      if (!hasStarted) {
        resolveStarted(false);
        if (resolvePlaybackStart === resolveStarted) resolvePlaybackStart = null;
      }
      return;
    }
    if (index >= segments.length) {
      currentAudio = null;
      resolvePlaybackStart = null;
      onFinished?.();
      return;
    }

    const audio = new window.Audio(`data:audio/wav;base64,${segments[index]}`);
    currentAudio = audio;
    audio.onended = () => {
      if (generation !== playbackGeneration) return;
      if (currentAudio === audio) currentAudio = null;
      index += 1;
      playNextSegment();
    };
    audio.onerror = () => {
      if (generation !== playbackGeneration) return;
      if (currentAudio === audio) currentAudio = null;
      if (!hasStarted) {
        resolveStarted(false);
        if (resolvePlaybackStart === resolveStarted) resolvePlaybackStart = null;
      } else onPlaybackError?.();
    };
    audio.play().then(() => {
      if (generation !== playbackGeneration || hasStarted) return;
      hasStarted = true;
      resolveStarted(true);
      if (resolvePlaybackStart === resolveStarted) resolvePlaybackStart = null;
    }).catch(() => {
      if (generation !== playbackGeneration) return;
      if (currentAudio === audio) currentAudio = null;
      if (!hasStarted) {
        resolveStarted(false);
        if (resolvePlaybackStart === resolveStarted) resolvePlaybackStart = null;
      } else onPlaybackError?.();
    });
  }

  playNextSegment();
  return started;
}

export function stopSpeaking() {
  if (typeof window === 'undefined') return;
  playbackGeneration += 1;
  resolvePlaybackStart?.(false);
  resolvePlaybackStart = null;
  window.speechSynthesis?.cancel();
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}
