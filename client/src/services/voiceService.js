let currentAudio = null;
let currentAudioContext = null;
let currentAudioSource = null;
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
  let resolveStarted;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  resolvePlaybackStart = resolveStarted;

  function finishPlayback() {
    if (generation !== playbackGeneration) return;
    currentAudio = null;
    currentAudioSource = null;
    const context = currentAudioContext;
    currentAudioContext = null;
    if (context && context.state !== 'closed') void context.close();
    resolvePlaybackStart = null;
    onFinished?.();
  }

  if (segments.length > 1 && (window.AudioContext || window.webkitAudioContext)) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    currentAudioContext = context;
    try {
      const decoded = await Promise.all(segments.map(async (segment) => {
        const binary = window.atob(segment);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return context.decodeAudioData(bytes.buffer);
      }));
      if (generation !== playbackGeneration) return started;

      const channelCount = Math.max(...decoded.map((audio) => audio.numberOfChannels));
      const frameCount = decoded.reduce((total, audio) => total + audio.length, 0);
      const combined = context.createBuffer(channelCount, frameCount, context.sampleRate);
      let offset = 0;
      for (const audio of decoded) {
        for (let channel = 0; channel < channelCount; channel += 1) {
          const sourceChannel = audio.getChannelData(Math.min(channel, audio.numberOfChannels - 1));
          combined.getChannelData(channel).set(sourceChannel, offset);
        }
        offset += audio.length;
      }

      const source = context.createBufferSource();
      currentAudioSource = source;
      source.buffer = combined;
      source.connect(context.destination);
      source.onended = finishPlayback;
      await context.resume();
      if (generation !== playbackGeneration) return started;
      source.start();
      resolveStarted(true);
      if (resolvePlaybackStart === resolveStarted) resolvePlaybackStart = null;
    } catch {
      if (generation !== playbackGeneration) return started;
      currentAudioSource = null;
      currentAudioContext = null;
      if (context.state !== 'closed') void context.close();
      resolveStarted(false);
      if (resolvePlaybackStart === resolveStarted) resolvePlaybackStart = null;
    }
    return started;
  }

  const audio = new window.Audio(`data:audio/wav;base64,${segments[0]}`);
  currentAudio = audio;
  let hasStarted = false;
  audio.onended = finishPlayback;
  audio.onerror = () => {
    if (generation !== playbackGeneration) return;
    currentAudio = null;
    if (!hasStarted) {
      resolveStarted(false);
      if (resolvePlaybackStart === resolveStarted) resolvePlaybackStart = null;
    } else onPlaybackError?.();
  };
  try {
    await audio.play();
    if (generation !== playbackGeneration) return started;
    hasStarted = true;
    resolveStarted(true);
    if (resolvePlaybackStart === resolveStarted) resolvePlaybackStart = null;
  } catch {
    if (generation !== playbackGeneration) return started;
    currentAudio = null;
    resolveStarted(false);
    if (resolvePlaybackStart === resolveStarted) resolvePlaybackStart = null;
    return false;
  }
  return started;
}

export function stopSpeaking() {
  if (typeof window === 'undefined') return;
  playbackGeneration += 1;
  resolvePlaybackStart?.(false);
  resolvePlaybackStart = null;
  window.speechSynthesis?.cancel();
  if (currentAudioSource) {
    currentAudioSource.onended = null;
    try { currentAudioSource.stop(); } catch { /* It may have already finished. */ }
    currentAudioSource.disconnect();
    currentAudioSource = null;
  }
  if (currentAudioContext && currentAudioContext.state !== 'closed') {
    void currentAudioContext.close();
    currentAudioContext = null;
  }
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}
