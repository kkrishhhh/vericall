/**
 * Deepgram live STT — encapsulates WebSocket URL + browser audio → PCM streaming.
 * Used by the call page; keeps STT wiring in one place for easier tuning.
 */

/**
 * Raw PCM must match encoding + sample_rate or Deepgram returns silence / no transcripts.
 * Browsers usually use 44100 or 48000 Hz — pass the real AudioContext rate.
 *
 * Do NOT put the API key in the query string from the browser — handshake often fails.
 * Use `Sec-WebSocket-Protocol`: `new WebSocket(url, ["token", apiKey])` (Deepgram docs).
 */
export function buildDeepgramListenUrl(sampleRate: number): string {
  const rate = Math.round(sampleRate);
  const q = new URLSearchParams({
    model: "nova-2",
    language: "en-IN",
    encoding: "linear16",
    sample_rate: String(rate),
    channels: "1",
    smart_format: "true",
    interim_results: "true",
    utterance_end_ms: "1500",
    vad_events: "true",
  });
  return `wss://api.deepgram.com/v1/listen?${q.toString()}`;
}

export interface DeepgramSttHandlers {
  onFinalTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
  onUtteranceEnd?: () => void;
  onOpen?: () => void;
  onListeningChange?: (listening: boolean) => void;
  /** WebSocket / network failure — show typing fallback in UI */
  onError?: () => void;
}

export interface DeepgramSttConnection {
  close: () => void;
  setMuted: (isMuted: boolean) => void;
}

/**
 * Opens Deepgram WebSocket and streams mono linear16 PCM from the given MediaStream.
 */
export function connectDeepgramStt(
  token: string,
  mediaStream: MediaStream,
  handlers: DeepgramSttHandlers,
): DeepgramSttConnection {
  // Create context first so WebSocket URL uses the actual hardware sample rate.
  const audioContext = new AudioContext();
  const sampleRate = audioContext.sampleRate;
  const url = buildDeepgramListenUrl(sampleRate);
  const ws = new WebSocket(url, ["token", token]);
  let processor: ScriptProcessorNode | null = null;
  let handshakeOk = false;
  let source: MediaStreamAudioSourceNode | null = null;
  let mute: GainNode | null = null;
  let audioTornDown = false;
  let isMuted = false;

  const cleanupAudio = () => {
    if (audioTornDown) return;
    audioTornDown = true;
    try {
      processor?.disconnect();
      source?.disconnect();
      mute?.disconnect();
    } catch {
      /* ignore */
    }
    processor = null;
    source = null;
    mute = null;
    if (audioContext.state !== "closed") {
      void audioContext.close().catch(() => {});
    }
  };

  const close = () => {
    handlers.onListeningChange?.(false);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    } else {
      cleanupAudio();
    }
  };

  ws.onopen = async () => {
    handshakeOk = true;
    try {
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
    } catch {
      /* mic may stay blocked until user interacts */
    }

    handlers.onOpen?.();
    handlers.onListeningChange?.(true);

    source = audioContext.createMediaStreamSource(mediaStream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    mute = audioContext.createGain();
    mute.gain.value = 0;

    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = isMuted ? 0 : Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
      }
      ws.send(pcm16.buffer);
    };
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data as string) as {
      type?: string;
      is_final?: boolean;
      channel?: { alternatives?: { transcript?: string }[] };
      description?: string;
    };

    if (data.type === "Error" || data.type === "error") {
      handlers.onListeningChange?.(false);
      handlers.onError?.();
      return;
    }

    if (data.type === "Results") {
      const transcript = data.channel?.alternatives?.[0]?.transcript || "";
      if (!transcript) return;
      if (data.is_final) {
        handlers.onInterim?.("");
        handlers.onFinalTranscript(transcript);
      } else {
        handlers.onInterim?.(transcript);
      }
    }

    if (data.type === "UtteranceEnd") {
      handlers.onUtteranceEnd?.();
    }
  };

  ws.onerror = () => {
    handlers.onListeningChange?.(false);
    handlers.onError?.();
  };

  ws.onclose = () => {
    cleanupAudio();
    handlers.onListeningChange?.(false);
    if (!handshakeOk) {
      handlers.onError?.();
    }
  };

  return { close, setMuted: (m: boolean) => { isMuted = m; } };
}
