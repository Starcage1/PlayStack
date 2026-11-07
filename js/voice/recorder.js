// Capture speech and convert it to a validated mono 16 kHz PCM WAV.
import { encodePcm16Wav, inspectPcm16Wav } from "./wav.js";

let activeRecorder = null;

export async function recordCommand({ onState = () => {}, onLevel = () => {}, onDebug = () => {} } = {}) {
  const startedAt = performance.now();
  const secure = window.isSecureContext || ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  if (!secure) throw voiceError("Microphone access requires localhost or an HTTPS page. Open the local server address.", "permission");
  if (!navigator.mediaDevices?.getUserMedia) {
    throw voiceError("This browser does not provide microphone access. Use a current browser on localhost or HTTPS.", "permission");
  }
  if (!window.MediaRecorder) throw voiceError("This browser cannot record microphone audio. Try a current browser.", "recorder");
  if (activeRecorder) throw voiceError("A recording is already in progress.", "recorder");

  let permissionState = "unknown";
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw voiceError("This browser cannot process microphone audio.", "audio-context");
  }

  // Call resume and getUserMedia synchronously from the mic click before any await.
  const contextStarted = performance.now();
  const permissionStarted = performance.now();
  let context;
  let resumePromise;
  let resumeError = null;
  let contextReadyMs = 0;
  let streamPromise;
  try {
    context = new AudioContextClass();
    resumePromise = (context.state === "suspended" ? context.resume() : Promise.resolve())
      .then(() => { contextReadyMs = performance.now() - contextStarted; })
      .catch((error) => { resumeError = error; contextReadyMs = performance.now() - contextStarted; });
    streamPromise = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (error) {
    await context?.close().catch(() => {});
    throw voiceError("The browser could not start the microphone and audio system.", "audio-context", { errorName: error.name });
  }
  permissionState = "requesting";
  onDebug({ stage: "permission", permissionState });

  let stream;
  try { stream = await streamPromise; }
  catch (error) {
    await context.close().catch(() => {});
    try { permissionState = (await navigator.permissions?.query({ name: "microphone" }))?.state || "unknown"; }
    catch (_) { permissionState = "not available"; }
    onDebug({ stage: "permission", permissionState, errorName: error.name });
    throw voiceError(microphoneMessage(error), "permission", { permissionState, errorName: error.name });
  }
  const permissionMs = Math.round(performance.now() - permissionStarted);
  onDebug({ stage: "permission", permissionState: "granted", durationMs: permissionMs });
  try {
    await resumePromise;
    if (resumeError) throw resumeError;
    if (context.state !== "running") throw new Error(`AudioContext stayed ${context.state}.`);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await context?.close().catch(() => {});
    throw voiceError("The browser audio system did not start. Click the mic again or check browser audio settings.", "audio-context", { state: context?.state || "failed", errorName: error.name });
  }
  const contextMs = Math.round(contextReadyMs);
  onDebug({ stage: "audio-context", state: context.state, durationMs: contextMs });

  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  context.createMediaStreamSource(stream).connect(analyser);

  const mimeTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"];
  const mimeType = typeof MediaRecorder.isTypeSupported === "function"
    ? mimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || ""
    : "";
  let recorder;
  try { recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); }
  catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => {});
    throw voiceError("The browser could not start its microphone recorder.", "recorder", { errorName: error.name, mimeType: mimeType || "browser default" });
  }

  const chunks = [];
  const samples = new Float32Array(analyser.fftSize);
  const ambientLevels = [];
  let recordingStartedAt = 0;
  let lastSpeechAt = 0;
  let speechDetected = false;
  let noiseFloor = 0;
  let noiseMeasured = false;
  let threshold = 0.012;
  let peakLevel = 0;
  let animationFrame = 0;
  let finished = false;
  let stopReason = "manual";
  let lastMeterAt = 0;
  const capture = { recorder, stop: () => { if (recorder.state === "recording") recorder.stop(); } };
  activeRecorder = capture;

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

    recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
    recorder.addEventListener("error", (event) => finish(voiceError("The microphone recorder stopped unexpectedly.", "recorder", { errorName: event.error?.name || "MediaRecorderError" })), { once: true });

    // The stop event fires after the final dataavailable event, so all chunks are present here.
    recorder.addEventListener("stop", async () => {
      const recordingMs = Math.round(performance.now() - recordingStartedAt);
      onState("thinking");
      onDebug({ stage: "recording", durationMs: recordingMs, peakLevel: Number(peakLevel.toFixed(4)), noiseFloor: Number(noiseFloor.toFixed(4)), speechDetected, stopReason, mimeType: recorder.mimeType || "browser default" });
      try {
        if (!chunks.length) throw voiceError("No audio data arrived from the microphone. Check the selected input device.", "recording", { durationMs: recordingMs });
        const decodeStarted = performance.now();
        const recordedBlob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        const decoded = await context.decodeAudioData(await recordedBlob.arrayBuffer());
        const decodeMs = Math.round(performance.now() - decodeStarted);
        const rate = 16_000;
        const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OfflineContext) throw voiceError("This browser cannot convert microphone audio to WAV.", "wav");
        const encodeStarted = performance.now();
        const offline = new OfflineContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
        const source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start();
        const resampled = await offline.startRendering();
        const wavBytes = encodePcm16Wav(resampled.getChannelData(0), rate);
        const wav = new Blob([wavBytes], { type: "audio/wav" });
        const header = inspectPcm16Wav(wavBytes);
        const encodeMs = Math.round(performance.now() - encodeStarted);
        const stats = {
          durationMs: recordingMs, peakLevel: Number(peakLevel.toFixed(4)), noiseFloor: Number(noiseFloor.toFixed(4)),
          speechDetected, stopReason, recordedMimeType: recorder.mimeType || mimeType || "audio/webm",
          permissionMs, audioContextMs: contextMs, decodeMs, encodeMs, totalMs: Math.round(performance.now() - startedAt),
          wavBytes: wav.size, sampleRate: rate, channels: header.channels, bitsPerSample: header.bitsPerSample, headerValid: header.valid
        };
        onDebug({ stage: "wav", ...stats });
        Object.defineProperty(wav, "voiceDebug", { value: stats });
        finish(null, wav);
      } catch (error) {
        onDebug({ stage: error.stage || "wav", error: error.message || "WAV conversion failed." });
        finish(error instanceof Error ? error : voiceError("Could not convert the recording to WAV.", "wav"));
      }
    }, { once: true });

    function monitor() {
      if (recorder.state !== "recording") return;
      analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      let framePeak = 0;
      for (const sample of samples) { energy += sample * sample; framePeak = Math.max(framePeak, Math.abs(sample)); }
      const rms = Math.sqrt(energy / samples.length);
      const now = performance.now();
      const elapsed = now - recordingStartedAt;
      peakLevel = Math.max(peakLevel, framePeak);
      if (elapsed < 300) ambientLevels.push(rms);
      if (elapsed >= 300 && !noiseMeasured && ambientLevels.length) {
        noiseMeasured = true;
        ambientLevels.sort((left, right) => left - right);
        noiseFloor = ambientLevels[Math.floor((ambientLevels.length - 1) * 0.25)];
        threshold = Math.max(0.01, noiseFloor * 2.8);
        onDebug({ stage: "input", noiseFloor: Number(noiseFloor.toFixed(4)), speechThreshold: Number(threshold.toFixed(4)) });
      }
      if (elapsed >= 300 && rms >= threshold) { speechDetected = true; lastSpeechAt = now; }
      if (now - lastMeterAt >= 100) {
        onLevel({ rms, peak: peakLevel, meter: Math.min(1, rms * 5), durationMs: Math.round(elapsed) });
        lastMeterAt = now;
      }
      if (!speechDetected && elapsed >= 6000) { stopReason = "no-speech-timeout"; capture.stop(); return; }
      if (speechDetected && elapsed >= 800 && now - lastSpeechAt >= 1200) { stopReason = "silence"; capture.stop(); return; }
      if (elapsed >= 10_000) { stopReason = "maximum-duration"; capture.stop(); return; }
      animationFrame = requestAnimationFrame(monitor);
    }

    try {
      recorder.start();
      recordingStartedAt = performance.now();
      onState("listening");
      onDebug({ stage: "recording", state: "started", mimeType: recorder.mimeType || mimeType || "audio/webm" });
      animationFrame = requestAnimationFrame(monitor);
    } catch (error) {
      finish(voiceError("Could not start recording. Try the mic again.", "recorder", { errorName: error.name }));
    }
  });
}

export function stopRecording() { activeRecorder?.stop(); }

function voiceError(message, stage, detail = {}) {
  const error = new Error(message);
  error.stage = stage;
  error.detail = detail;
  return error;
}

function microphoneMessage(error) {
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError" || error.name === "SecurityError") return "Microphone access was blocked. Allow it for this site in browser settings, then try again.";
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") return "No microphone was found. Connect a microphone or choose another input device.";
  if (error.name === "NotReadableError" || error.name === "TrackStartError") return "The microphone could not be opened. Close other apps using it, then retry.";
  if (error.name === "OverconstrainedError") return "The selected microphone does not support the requested audio settings.";
  return `Microphone setup failed (${error.name || "unknown error"}). Check the input device and try again.`;
}
