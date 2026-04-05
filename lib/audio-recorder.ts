type RecordAudioOptions = {
  signal?: AbortSignal;
  silenceThreshold?: number;
  silenceDurationMs?: number;
  maxDurationMs?: number;
};

function getAudioContextConstructor() {
  return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

export async function recordAudioUntilSilence(options: RecordAudioOptions = {}) {
  if (typeof window === "undefined") {
    throw new Error("Audio recording is only available in the browser.");
  }

  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Audio recording is not supported in this browser.");
  }

  const silenceThreshold = options.silenceThreshold ?? 0.012;
  const silenceDurationMs = options.silenceDurationMs ?? 1200;
  const maxDurationMs = options.maxDurationMs ?? 12000;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContextConstructor();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;

  const chunks: Float32Array[] = [];
  let totalSamples = 0;
  let lastVoiceTime = performance.now();
  let finished = false;

  const cleanup = () => {
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
    }

    if (source) {
      source.disconnect();
    }

    if (silentGain) {
      silentGain.disconnect();
    }

    stream.getTracks().forEach((track) => track.stop());

    if (audioContext.state !== "closed") {
      void audioContext.close();
    }
  };

  const finish = () => {
    if (finished) return null;
    finished = true;
    cleanup();

    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    return encodeWav(merged, audioContext.sampleRate);
  };

  return await new Promise<Blob>((resolve, reject) => {
    const abort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        abort();
        return;
      }
      options.signal.addEventListener("abort", abort, { once: true });
    }

    const stop = () => {
      if (finished) return;
      const blob = finish();
      if (!blob) return;
      if (options.signal) {
        options.signal.removeEventListener("abort", abort);
      }
      resolve(blob);
    };

    processor.onaudioprocess = (event) => {
      if (finished) return;

      const input = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      chunks.push(copy);
      totalSamples += copy.length;

      let sumSquares = 0;
      for (let i = 0; i < input.length; i += 1) {
        sumSquares += input[i] * input[i];
      }

      const rms = Math.sqrt(sumSquares / input.length);
      const now = performance.now();

      if (rms > silenceThreshold) {
        lastVoiceTime = now;
      }

      if (now - lastVoiceTime >= silenceDurationMs || now >= maxDurationMs) {
        stop();
      }
    };

    source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);

    void audioContext.resume().catch(() => {
      stop();
    });
  });
}
