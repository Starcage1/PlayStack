// Record a short command, stop after 1.2 seconds of silence, and return 16 kHz WAV.
let activeRecorder = null;

export async function recordCommand({ onState = () => {} } = {}) {
  if (activeRecorder) throw new Error("A recording is already in progress.");
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    throw new Error("This browser cannot record audio. Try a browser with microphone support.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("This browser cannot process microphone audio.");
  }

  let context;
  try {
    context = new AudioContextClass();
    await context.resume().catch(() => {});
  } catch (_) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("This browser could not start microphone audio.");
  }
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  context.createMediaStreamSource(stream).connect(analyser);

  const canUseMime = typeof MediaRecorder.isTypeSupported === "function";
  const mimeType = canUseMime
    ? ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type))
    : "";
  let recorder;
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (_) {
    stream.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => {});
    throw new Error("This browser could not start an audio recording.");
  }
  const chunks = [];
  const samples = new Float32Array(analyser.fftSize);
  let startedAt = performance.now();
  let lastSpeechAt = 0;
  let animationFrame = 0;
  let finished = false;

  const capture = { recorder, stop: () => { if (recorder.state === "recording") recorder.stop(); } };
  activeRecorder = capture;
  onState("listening");

  return new Promise((resolve, reject) => {
    const finish = async (error, blob) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(animationFrame);
      stream.getTracks().forEach((track) => track.stop());
      if (context.state !== "closed") await context.close().catch(() => {});
      activeRecorder = null;
      error ? reject(error) : resolve(blob);
    };

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("error", () => finish(new Error("The microphone recording failed.")), { once: true });
    recorder.addEventListener("stop", async () => {
      try {
        if (!chunks.length) throw new Error("No audio was recorded. Try speaking closer to the microphone.");
        onState("thinking");
        const recording = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const decoded = await context.decodeAudioData(await recording.arrayBuffer());
        const rate = 16_000;
        const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OfflineContext) throw new Error("Offline WAV conversion is unavailable.");
        const offline = new OfflineContext(1, Math.ceil(decoded.duration * rate), rate);
        const source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start();
        const resampled = await offline.startRendering();
        resolveAfterWav(resampled.getChannelData(0), rate, finish);
      } catch (error) {
        finish(new Error("Could not convert the recording to WAV. Try a different browser."));
      }
    }, { once: true });

    function monitor() {
      if (recorder.state !== "recording") return;
      analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const rms = Math.sqrt(energy / samples.length);
      const now = performance.now();
      if (rms > 0.018) lastSpeechAt = now;
      if (lastSpeechAt && now - lastSpeechAt >= 1200) {
        capture.stop();
        return;
      }
      if (now - startedAt >= 8000) {
        capture.stop();
        return;
      }
      animationFrame = requestAnimationFrame(monitor);
    }

    try {
      recorder.start();
      startedAt = performance.now();
      animationFrame = requestAnimationFrame(monitor);
    } catch (_) {
      finish(new Error("Could not start recording. Try again."));
    }
  });
}

export function stopRecording() {
  activeRecorder?.stop();
}

function resolveAfterWav(samples, sampleRate, finish) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const writeText = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 32768 : clamped * 32767, true);
  }
  finish(null, new Blob([bytes], { type: "audio/wav" }));
}
