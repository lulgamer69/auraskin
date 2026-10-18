let currentAudio = null;

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
  if (!audioBase64 || typeof window === 'undefined' || typeof window.Audio !== 'function') return false;
  stopSpeaking();
  const audio = new window.Audio(`data:audio/wav;base64,${audioBase64}`);
  currentAudio = audio;
  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null;
    onFinished?.();
  };
  audio.onerror = () => {
    if (currentAudio === audio) currentAudio = null;
    onPlaybackError?.();
  };
  try {
    await audio.play();
    return true;
  } catch {
    if (currentAudio === audio) currentAudio = null;
    return false;
  }
}

export function stopSpeaking() {
  if (typeof window === 'undefined') return;
  window.speechSynthesis?.cancel();
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}
