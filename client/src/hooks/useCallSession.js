import { useEffect, useRef, useState } from 'react';
import { endConversation, getConversationSpeech, sendConversationTurn } from '../services/api.js';
import { canSpeak, createSpeechRecognition, playGeneratedSpeech, prepareSpeechVoices, speakReply, stopSpeaking } from '../services/voiceService.js';

function createSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function needsTranscriptReview(result) {
  const best = result?.[0];
  const second = result?.[1];
  const confidence = best?.confidence;
  const secondConfidence = second?.confidence;
  const hasConfidence = Number.isFinite(confidence) && confidence > 0;

  // Only pause when recognition reports low confidence or two distinct choices
  // are similarly likely. Browsers that do not expose confidence auto-send.
  const lowConfidence = hasConfidence && confidence < 0.68;
  const normalizedBest = best?.transcript?.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const normalizedSecond = second?.transcript?.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const closeCompetingTranscript = hasConfidence
    && Number.isFinite(secondConfidence)
    && secondConfidence > 0
    && normalizedSecond
    && normalizedSecond !== normalizedBest
    && Math.abs(confidence - secondConfidence) <= 0.12;

  return lowConfidence || closeCompetingTranscript;
}

/** Shares one conversation flow between browser voice calls and typed chat. */
export default function useCallSession() {
  const [mode, setMode] = useState('voice');
  const [status, setStatus] = useState('Idle');
  const [callActive, setCallActive] = useState(false);
  const [ending, setEnding] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [pendingTranscript, setPendingTranscript] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const sessionIdRef = useRef('');
  const activeRef = useRef(false);
  const modeRef = useRef('voice');
  const processingRef = useRef(false);
  const turnPromiseRef = useRef(null);
  const transcriptRef = useRef([]);
  const restartTimerRef = useRef(null);
  const recognitionRunningRef = useRef(false);
  const reviewPendingRef = useRef(false);
  const lastVoiceUtteranceRef = useRef({ text: '', at: 0 });

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  function updateTranscript(nextTranscript) {
    transcriptRef.current = nextTranscript;
    setTranscript(nextTranscript);
  }

  function chooseMode(nextMode) {
    if (!['voice', 'chat'].includes(nextMode) || nextMode === modeRef.current) return;
    if (activeRef.current && nextMode === 'voice') {
      if (!canSpeak()) {
        setError('Spoken replies are not supported in this browser. Try the latest Chrome or Edge.');
        return;
      }
      const recognition = configureRecognition();
      if (!recognition) return;
      modeRef.current = 'voice';
      setMode('voice');
      prepareSpeechVoices();
      setError('');
      if (status !== 'Thinking') listenAgain();
      return;
    }
    if (activeRef.current && nextMode === 'chat') {
      window.clearTimeout(restartTimerRef.current);
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      recognitionRunningRef.current = false;
      stopSpeaking();
      if (status === 'Speaking') processingRef.current = false;
      modeRef.current = 'chat';
      setMode('chat');
      if (status !== 'Thinking') setStatus('Idle');
      setError('');
      return;
    }
    modeRef.current = nextMode;
    setMode(nextMode);
    setError('');
  }

  function beginSession(nextMode) {
    modeRef.current = nextMode;
    setMode(nextMode);
    setError('');
    setSummary(null);
    updateTranscript([]);
    setPendingTranscript('');
    reviewPendingRef.current = false;
    lastVoiceUtteranceRef.current = { text: '', at: 0 };
    recognitionRunningRef.current = false;
    sessionIdRef.current = createSessionId();
    activeRef.current = true;
    processingRef.current = false;
    setCallActive(true);
    setStatus(nextMode === 'voice' ? 'Listening' : 'Idle');
  }

  function listenAgain() {
    if (!activeRef.current || modeRef.current !== 'voice' || !recognitionRef.current || reviewPendingRef.current) return;
    processingRef.current = false;
    setStatus('Listening');
    queueListeningRestart(recognitionRef.current);
  }

  function queueListeningRestart(recognition) {
    if (!activeRef.current || modeRef.current !== 'voice') return;
    window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (activeRef.current && modeRef.current === 'voice' && !processingRef.current) startListening(recognition);
    }, 300);
  }

  function startListening(recognition) {
    if (recognitionRunningRef.current) return;
    try {
      recognition.start();
    } catch (startError) {
      if (startError.name === 'InvalidStateError') {
        queueListeningRestart(recognition);
      } else {
        activeRef.current = false;
        setCallActive(false);
        setStatus('Idle');
        setError('The microphone could not start. Check browser permissions and try again.');
      }
    }
  }

  function configureRecognition() {
    const recognition = createSpeechRecognition();
    if (!recognition) {
      setError('Voice input is not supported in this browser. Try the latest Chrome or Edge.');
      return null;
    }
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    // A second hypothesis helps detect ambiguity without interrupting clear turns.
    recognition.maxAlternatives = 2;
    recognitionRef.current = recognition;
    recognition.onresult = (event) => {
      const result = event.results?.[event.resultIndex];
      const text = result?.[0]?.transcript?.trim();
      if (!text || !activeRef.current || processingRef.current) return;
      processingRef.current = true;
      setStatus('Thinking');
      if (!activeRef.current || modeRef.current !== 'voice') return;
      processingRef.current = false;
      if (needsTranscriptReview(result)) {
        reviewPendingRef.current = true;
        setPendingTranscript(text);
        setStatus('Reviewing');
      } else {
        reviewPendingRef.current = false;
        void submitMessage(text);
      }
    };
    recognition.onstart = () => { recognitionRunningRef.current = true; };
    recognition.onerror = (event) => {
      if (!activeRef.current || modeRef.current !== 'voice' || ['aborted', 'no-speech'].includes(event.error)) return;
      activeRef.current = false;
      setCallActive(false);
      setStatus('Idle');
      const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Microphone access was blocked. Allow it in your browser settings, then start a new call.'
        : 'We could not hear that clearly. Check your microphone and try again.';
      setError(message);
    };
    recognition.onend = () => {
      recognitionRunningRef.current = false;
      if (activeRef.current && !processingRef.current && !reviewPendingRef.current && modeRef.current === 'voice') listenAgain();
    };
    return recognition;
  }

  async function submitMessage(rawText, { alternatives = [] } = {}) {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text || !activeRef.current || processingRef.current) return;
    if (modeRef.current === 'voice') {
      const normalized = text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const previous = lastVoiceUtteranceRef.current;
      const elapsed = Date.now() - previous.at;
      const isOverlappingRecognition = elapsed < 3000
        && Math.min(normalized.length, previous.text.length) >= 12
        && (normalized === previous.text || normalized.includes(previous.text) || previous.text.includes(normalized));
      if (isOverlappingRecognition) return;
      lastVoiceUtteranceRef.current = { text: normalized, at: Date.now() };
    }
    const transcriptBeforeTurn = transcriptRef.current;
    processingRef.current = true;
    updateTranscript([...transcriptRef.current, { role: 'customer', text, timestamp: new Date().toISOString() }]);
    setStatus('Thinking');
    setError('');
    try {
      const turnRequest = sendConversationTurn(sessionIdRef.current, text, alternatives);
      turnPromiseRef.current = turnRequest;
      const result = await turnRequest;
      updateTranscript(result.transcript);
      if (!activeRef.current) return;

      if (modeRef.current === 'voice') {
        const finishSpeech = () => {
          if (result.callEnded) void endCall();
          else listenAgain();
        };
        let audioData = null;
        try {
          const speech = await getConversationSpeech(sessionIdRef.current);
          audioData = speech?.audioData;
        } catch {
          // Keep the reply useful even when server-side voice generation is unavailable.
        }
        if (!activeRef.current) return;
        if (modeRef.current !== 'voice') {
          if (result.callEnded) void endCall();
          else { processingRef.current = false; setStatus('Idle'); }
          return;
        }
        setStatus('Speaking');
        const browserFallback = () => speakReply(result.reply, finishSpeech);
        if (audioData) {
          const started = await playGeneratedSpeech(audioData, finishSpeech, browserFallback);
          if (!started) browserFallback();
        } else {
          speakReply(result.reply, finishSpeech);
        }
      } else if (result.callEnded) {
        void endCall();
      } else {
        processingRef.current = false;
        setStatus('Idle');
      }
    } catch (requestError) {
      processingRef.current = false;
      lastVoiceUtteranceRef.current = { text: '', at: 0 };
      // The optimistic customer message was never accepted by the backend.
      // Restore the last server-confirmed transcript so end-call recap and
      // feedback only use messages that the backend actually recorded.
      updateTranscript(transcriptBeforeTurn);
      if (activeRef.current) {
        if (modeRef.current === 'voice') {
          reviewPendingRef.current = false;
          setStatus('Listening');
          listenAgain();
        }
        setError(modeRef.current === 'voice'
          ? `${requestError.message} That message wasn’t sent. Please say it again or switch to Chat.`
          : requestError.message);
        if (modeRef.current !== 'voice') setStatus('Idle');
      }
    } finally {
      turnPromiseRef.current = null;
    }
  }

  async function submitReviewedTranscript() {
    const text = pendingTranscript.trim();
    if (!text || !activeRef.current || processingRef.current) return;
    reviewPendingRef.current = false;
    setPendingTranscript('');
    processingRef.current = false;
    await submitMessage(text);
  }

  function discardReviewedTranscript() {
    if (!activeRef.current) return;
    reviewPendingRef.current = false;
    setPendingTranscript('');
    listenAgain();
  }

  function updateReviewedTranscript(text) {
    setPendingTranscript(text);
  }

  function startCall() {
    if (activeRef.current || ending) return;
    if (!canSpeak()) {
      setError('Spoken replies are not supported in this browser. Try the latest Chrome or Edge.');
      return;
    }
    const recognition = configureRecognition();
    if (!recognition) return;
    beginSession('voice');
    prepareSpeechVoices();
    listenAgain();
  }

  function startChat() {
    if (activeRef.current || ending) return;
    beginSession('chat');
    recognitionRef.current = null;
  }

  async function endCall() {
    if (!activeRef.current || ending) return;
    activeRef.current = false;
    processingRef.current = true;
    setCallActive(false);
    setEnding(true);
    setSummaryLoading(transcriptRef.current.length > 0);
    setStatus(transcriptRef.current.length > 0 ? 'Thinking' : 'Idle');
    window.clearTimeout(restartTimerRef.current);
    recognitionRef.current?.stop();
    recognitionRunningRef.current = false;
    reviewPendingRef.current = false;
    setPendingTranscript('');
    stopSpeaking();

    if (turnPromiseRef.current) await turnPromiseRef.current.catch(() => {});
    if (transcriptRef.current.length > 0) {
      try {
        const result = await endConversation(sessionIdRef.current);
        setSummary(result.summary);
        updateTranscript(result.transcript);
        setError('');
      } catch (requestError) {
        setError(requestError.message);
      }
    }
    setSummaryLoading(false);
    setEnding(false);
    setStatus('Idle');
    recognitionRef.current = null;
  }

  async function retrySummary() {
    if (!sessionIdRef.current || summaryLoading) return;
    setSummaryLoading(true);
    try {
      const result = await endConversation(sessionIdRef.current);
      setSummary(result.summary);
      updateTranscript(result.transcript);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => () => {
    activeRef.current = false;
    window.clearTimeout(restartTimerRef.current);
    recognitionRef.current?.stop();
    recognitionRunningRef.current = false;
    stopSpeaking();
  }, []);

  return {
    mode, chooseMode, status, callActive, ending, transcript, summary, summaryLoading, error,
    pendingTranscript, sessionId: sessionIdRef.current,
    startCall, startChat, submitMessage, submitReviewedTranscript, discardReviewedTranscript, updateReviewedTranscript, endCall, retrySummary,
  };
}
