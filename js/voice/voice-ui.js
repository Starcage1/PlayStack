import { transcribe, speak } from "./gnani-client.js";
import { recordCommand, stopRecording } from "./recorder.js";
import { inspectPcm16Wav } from "./wav.js";

const POSITION_KEY = "videovault:voice:position";
const DEBUG_FIELDS = ["permission", "audioContext", "recording", "wav", "request", "httpStatus", "rawResponse", "transcript", "intent", "timings", "failure"];

// Add the mic, command help, typed fallback, and optional speech diagnostics.
export function initVoiceUI({
  getKeyterms = () => [],
  commands = [],
  handleTranscript = async (heard) => `Maine suna: ${heard}`,
  getVolume = () => 100,
  setPlaybackVolume = () => {}
} = {}) {
  const dock = document.createElement("section");
  dock.className = "voice-dock";
  const featuredIds = ["play_random", "play_named", "search", "open_commands", "sleep_timer_set", "theater_mode", "fullscreen_mode", "playlist_count", "library_count"];
  const featured = featuredIds.map((id) => commands.find((item) => item.id === id)?.examples?.hi?.[0]?.text).filter(Boolean);
  const verifiedExamples = [...featured, "30 seconds forward", "volume fifty karo", "coding playlist kholo"];
  const helpLines = [...new Set(verifiedExamples)].map((line) => `<li>“${escapeHtml(line)}”</li>`).join("");
  dock.innerHTML = `<p class="voice-status" role="status" aria-live="polite" hidden></p>
    <div class="voice-help" hidden>
      <h2>What can I say?</h2>
      <ul class="voice-help-examples">${helpLines}</ul>
      <a href="#/commands" class="voice-help-all">See all commands</a>
      <form class="voice-text-form"><label for="voiceTextCommand">Type a command</label><div><input id="voiceTextCommand" autocomplete="off" placeholder="e.g. pause karo"><button type="submit">Run</button></div></form>
      <button class="voice-debug-toggle secondary" type="button">Show voice diagnostics</button>
    </div>
    <section class="voice-debug" aria-label="Voice diagnostics" hidden>
      <h2>Voice diagnostics</h2>
      <div class="voice-meter-row"><label for="voiceInputMeter">Input level</label><progress id="voiceInputMeter" max="1" value="0"></progress><span data-debug="level">0.0000</span></div>
      <dl class="voice-debug-grid">${DEBUG_FIELDS.map((field) => `<div><dt>${fieldLabel(field)}</dt><dd data-debug="${field}">—</dd></div>`).join("")}</dl>
      <div class="voice-debug-actions"><button type="button" data-debug-action="play" disabled>Play last recording</button><button type="button" data-debug-action="download" disabled>Download last recording</button></div>
    </section>
    <div class="voice-actions">
      <button class="voice-help-button" type="button" aria-label="Voice command help" title="Voice command help">?</button>
      <button class="voice-mic" type="button" aria-label="Start voice command" title="Start voice command">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8"/></svg>
      </button>
    </div>`;
  document.body.append(dock);

  const button = dock.querySelector(".voice-mic");
  const status = dock.querySelector(".voice-status");
  const help = dock.querySelector(".voice-help");
  const debugPanel = dock.querySelector(".voice-debug");
  const textForm = dock.querySelector(".voice-text-form");
  const textInput = dock.querySelector("#voiceTextCommand");
  const inputMeter = dock.querySelector("#voiceInputMeter");
  const lastRecordingButtons = dock.querySelectorAll("[data-debug-action]");
  let busy = false;
  let recording = false;
  let suppressClick = false;
  let drag = null;
  let statusTimer = 0;
  let lastRecording = null;
  let attemptStarted = 0;
  let stageTimes = {};

  // Restore a previously dragged position when browser storage permits it.
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
    if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) setPosition(saved.left, saved.top);
  } catch (_) { /* Dragging still works until this page closes. */ }
  if (new URLSearchParams(location.search).get("voicedebug") === "1") setDebugVisible(true);

  function logDebug(field, value) {
    const node = dock.querySelector(`[data-debug="${field}"]`);
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (node) node.textContent = text || "—";
    if (!debugPanel.hidden) console.info(`[Video Vault voice] ${field}:`, value);
  }

  function setDebugVisible(visible) {
    debugPanel.hidden = !visible;
    dock.querySelector(".voice-debug-toggle").textContent = visible ? "Hide voice diagnostics" : "Show voice diagnostics";
  }

  function beginAttempt() {
    attemptStarted = performance.now();
    stageTimes = {};
    inputMeter.value = "0";
    dock.querySelector('[data-debug="level"]').textContent = "0.0000";
    for (const field of DEBUG_FIELDS) logDebug(field, "—");
    logDebug("timings", { attemptStarted: new Date().toISOString() });
  }

  function noteRecorderEvent(event) {
    if (event.stage === "permission") {
      if (event.durationMs !== undefined) stageTimes.permissionMs = event.durationMs;
      logDebug("permission", event);
    } else if (event.stage === "audio-context") {
      stageTimes.audioContextMs = event.durationMs;
      logDebug("audioContext", event);
    } else if (event.stage === "recording" && event.state === "started") {
      logDebug("recording", event);
    } else if (event.stage === "recording") {
      stageTimes.recordingMs = event.durationMs;
      logDebug("recording", event);
    } else if (event.stage === "wav") {
      stageTimes = { ...stageTimes, permissionMs: event.permissionMs, audioContextMs: event.audioContextMs, recordingMs: event.durationMs, decodeMs: event.decodeMs, encodeMs: event.encodeMs };
      logDebug("recording", { durationMs: event.durationMs, peakLevel: event.peakLevel, speechDetected: event.speechDetected, stopReason: event.stopReason });
      logDebug("wav", { bytes: event.wavBytes, sampleRate: event.sampleRate, channels: event.channels, bitsPerSample: event.bitsPerSample, headerValid: event.headerValid });
      logDebug("timings", stageTimes);
    } else if (event.stage === "input") {
      logDebug("recording", event);
    } else if (event.error) {
      logDebug("failure", event);
    }
  }

  function setPosition(left, top) {
    const margin = 8;
    let x = Math.max(margin, Math.min(window.innerWidth - button.offsetWidth - margin, left));
    let y = Math.max(margin, Math.min(window.innerHeight - button.offsetHeight - margin, top));
    const miniPlayer = document.querySelector(".player-shell.mini:not(.is-hidden)");
    if (miniPlayer) {
      const player = miniPlayer.getBoundingClientRect();
      const overlaps = (candidateX, candidateY) => candidateX < player.right && candidateX + button.offsetWidth > player.left && candidateY < player.bottom && candidateY + button.offsetHeight > player.top;
      if (overlaps(x, y)) {
        const rightX = player.right + 12;
        if (rightX + button.offsetWidth <= window.innerWidth - margin) x = rightX;
        else y = Math.max(margin, player.top - button.offsetHeight - 12);
      }
    }
    const dockBounds = dock.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    dock.classList.add("is-positioned");
    dock.style.left = `${x - (buttonBounds.left - dockBounds.left)}px`;
    dock.style.top = `${y - (buttonBounds.top - dockBounds.top)}px`;
  }

  function showState(state, message = "") {
    dock.dataset.state = state;
    button.disabled = busy && !recording;
    button.setAttribute("aria-label", recording ? "Stop voice recording" : "Start voice command");
    button.title = recording ? "Stop recording (V)" : "Start voice command (V)";
    clearTimeout(statusTimer);
    status.hidden = !message;
    status.textContent = message;
    status.dataset.state = state;
    if (message && ["idle", "error", "speaking"].includes(state)) statusTimer = window.setTimeout(() => { status.hidden = true; }, 4500);
  }

  function reportIntent(parsed) { logDebug("intent", parsed); }

  function reportFailure(error, stage = "voice") {
    const details = { stage: error.stage || stage, message: error.message || "Voice attempt failed.", ...error.detail };
    if (details.stage === "permission") logDebug("permission", details);
    if (details.stage === "audio-context") logDebug("audioContext", details);
    if (error.httpStatus !== undefined) { details.httpStatus = error.httpStatus; logDebug("httpStatus", error.httpStatus); }
    if (error.requestInfo) logDebug("request", error.requestInfo);
    if (error.rawResponse) logDebug("rawResponse", error.rawResponse);
    logDebug("failure", details);
    if (attemptStarted) logDebug("timings", { ...stageTimes, totalMs: Math.round(performance.now() - attemptStarted) });
  }

  async function runTextCommand(text) {
    const heard = text.trim();
    if (!heard || busy) return;
    busy = true;
    showState("thinking", "Running command…");
    try {
      const reply = await handleTranscript(heard);
      showState("idle", `Command: ${reply}`);
    } catch (error) {
      reportFailure(error, "typed-command");
      showState("error", error.message || "That command could not be completed.");
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  async function start() {
    if (busy) {
      if (recording) stopRecording();
      return;
    }
    busy = true;
    beginAttempt();
    const volumeBefore = Number(getVolume());
    showState("listening", "Listening…");
    setPlaybackVolume(Math.round(volumeBefore * 0.15));
    try {
      const wav = await recordCommand({
        onState: (state) => {
          recording = state === "listening";
          showState(state, state === "thinking" ? "Preparing recording…" : "Listening…");
        },
        onLevel: (level) => {
          inputMeter.value = String(level.meter);
          dock.querySelector('[data-debug="level"]').textContent = `RMS ${level.rms.toFixed(4)} · peak ${level.peak.toFixed(4)} · ${formatMs(level.durationMs)}`;
          dock.querySelector('[data-debug="recording"]').textContent = `${formatMs(level.durationMs)} · RMS ${level.rms.toFixed(4)} · peak ${level.peak.toFixed(4)}`;
        },
        onDebug: noteRecorderEvent
      });
      lastRecording = wav;
      lastRecordingButtons.forEach((item) => { item.disabled = false; });
      const header = inspectPcm16Wav(new Uint8Array(await wav.arrayBuffer()));
      logDebug("wav", { bytes: wav.size, sampleRate: header.sampleRate, channels: header.channels, bitsPerSample: header.bitsPerSample, headerValid: header.valid, reason: header.reason });
      if (wav.voiceDebug.durationMs < 500) throw Object.assign(new Error("That recording was too short to send. Hold the mic for at least half a second."), { stage: "recording", detail: wav.voiceDebug });
      if (!wav.voiceDebug.speechDetected) throw Object.assign(new Error("No clear speech was detected. Check the input meter or selected microphone and try again."), { stage: "recording", detail: wav.voiceDebug });
      if (!header.valid) throw Object.assign(new Error("The WAV recording did not pass its header check, so it was not sent."), { stage: "wav", detail: header });

      showState("thinking", "Transcribing…");
      const sttStarted = performance.now();
      const result = await transcribe(wav, getKeyterms(), { onRequest: (requestInfo) => logDebug("request", requestInfo) });
      stageTimes.sttMs = Math.round(performance.now() - sttStarted);
      logDebug("httpStatus", result.httpStatus);
      logDebug("rawResponse", result.rawResponse);
      logDebug("transcript", { text: result.transcript || "(empty transcript)", detectedLanguageCode: result.detectedLanguageCode });
      if (!result.transcript.trim()) {
        logDebug("failure", "Gnani returned an empty transcript. Check the recording and recognition settings.");
        showState("error", "I didn’t hear any words. Check the input meter and try again.");
        return;
      }
      const heard = result.transcript.trim();
      const reply = await handleTranscript(heard);
      showState("speaking", `Heard: ${heard} → ${reply}`);
      const ttsStarted = performance.now();
      await speak(reply);
      stageTimes.ttsMs = Math.round(performance.now() - ttsStarted);
      stageTimes.totalMs = Math.round(performance.now() - attemptStarted);
      logDebug("timings", stageTimes);
      console.info(`[Video Vault voice] timings:`, stageTimes);
      showState("idle", `Heard: ${heard} → ${reply}`);
    } catch (error) {
      reportFailure(error);
      showState("error", error.message || "Voice control had a problem. Please try again.");
    } finally {
      setPlaybackVolume(Number(getVolume()));
      recording = false;
      busy = false;
      button.disabled = false;
    }
  }

  // Drag with the pointer; a drag should not also start recording.
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || busy) return;
    const bounds = button.getBoundingClientRect();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: bounds.left, top: bounds.top, moved: false };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) setPosition(drag.left + dx, drag.top + dy);
  });
  button.addEventListener("pointerup", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      suppressClick = true;
      const bounds = button.getBoundingClientRect();
      try { localStorage.setItem(POSITION_KEY, JSON.stringify({ left: bounds.left, top: bounds.top })); } catch (_) { /* Keep this position for the current page. */ }
      window.setTimeout(() => { suppressClick = false; }, 0);
    }
    drag = null;
  });
  button.addEventListener("pointercancel", () => { drag = null; });
  button.addEventListener("click", () => { if (!suppressClick) start(); });
  dock.querySelector(".voice-help-button").addEventListener("click", () => {
    help.hidden = !help.hidden;
    if (!help.hidden) textInput.focus();
  });
  dock.querySelector(".voice-debug-toggle").addEventListener("click", () => setDebugVisible(debugPanel.hidden));
  textForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = textInput.value;
    textInput.value = "";
    runTextCommand(command);
  });
  lastRecordingButtons.forEach((item) => item.addEventListener("click", () => {
    if (!lastRecording) return;
    const url = URL.createObjectURL(lastRecording);
    if (item.dataset.debugAction === "download") {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "video-vault-voice-debug.wav";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      const audio = new Audio(url);
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      audio.addEventListener("error", () => { URL.revokeObjectURL(url); logDebug("failure", "Could not play the saved WAV recording."); }, { once: true });
      audio.play().catch((error) => { URL.revokeObjectURL(url); logDebug("failure", error.message); });
    }
  }));
  window.addEventListener("resize", () => {
    if (!dock.classList.contains("is-positioned")) return;
    const bounds = button.getBoundingClientRect();
    setPosition(bounds.left, bounds.top);
  });

  return { element: dock, showState, start, runTextCommand, reportIntent, reportFailure, toggle: start };
}

function formatMs(value) { return `${(value / 1000).toFixed(1)} s`; }
function fieldLabel(field) {
  return ({ audioContext: "AudioContext", httpStatus: "HTTP status", rawResponse: "Raw response" })[field]
    || field.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toLocaleUpperCase());
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
