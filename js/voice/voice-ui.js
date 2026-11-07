import { transcribe, speak } from "./gnani-client.js";
import { recordCommand } from "./recorder.js";

const POSITION_KEY = "videovault:voice:position";

// Add the movable mic, examples, and a typed command fallback.
export function initVoiceUI({
  getKeyterms = () => [],
  handleTranscript = async (heard) => `Maine suna: ${heard}`,
  getVolume = () => 100,
  setPlaybackVolume = () => {}
} = {}) {
  const dock = document.createElement("section");
  dock.className = "voice-dock";
  dock.innerHTML = `<p class="voice-status" role="status" aria-live="polite" hidden></p>
    <div class="voice-help" hidden>
      <h2>Voice commands</h2>
      <p>Try: “agla video chalao”, “awaaz 40 karo”, “is video ko Music mein daalo”, or “playlist kholo Music”.</p>
      <form class="voice-text-form"><label for="voiceTextCommand">Type a command</label><div><input id="voiceTextCommand" autocomplete="off" placeholder="e.g. pause karo"><button type="submit">Run</button></div></form>
    </div>
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
  const textForm = dock.querySelector(".voice-text-form");
  const textInput = dock.querySelector("#voiceTextCommand");
  let busy = false;
  let suppressClick = false;
  let drag = null;

  // Restore a previously dragged position when browser storage permits it.
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
    if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) setPosition(saved.left, saved.top);
  } catch (_) { /* Dragging still works until this page closes. */ }

  function setPosition(left, top) {
    const margin = 8;
    const x = Math.max(margin, Math.min(window.innerWidth - button.offsetWidth - margin, left));
    const y = Math.max(margin, Math.min(window.innerHeight - button.offsetHeight - margin, top));
    const dockBounds = dock.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    dock.classList.add("is-positioned");
    dock.style.left = `${x - (buttonBounds.left - dockBounds.left)}px`;
    dock.style.top = `${y - (buttonBounds.top - dockBounds.top)}px`;
  }

  function showState(state, message = "") {
    dock.dataset.state = state;
    button.disabled = busy;
    button.setAttribute("aria-label", state === "listening" ? "Listening for a voice command" : "Start voice command");
    button.title = state === "listening" ? "Listening… (V also starts voice control)" : "Start voice command (V)";
    status.hidden = !message;
    status.textContent = message;
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
      showState("error", error.message || "That command could not be completed.");
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  async function start() {
    if (busy) return;
    busy = true;
    const volumeBefore = Number(getVolume());
    const started = performance.now();
    showState("listening", "Listening…");
    setPlaybackVolume(Math.round(volumeBefore * 0.15));
    try {
      const wav = await recordCommand({ onState: (state) => showState(state, state === "thinking" ? "Preparing recording…" : "Listening…") });
      showState("thinking", "Transcribing…");
      const sttStarted = performance.now();
      const result = await transcribe(wav, getKeyterms());
      const sttMs = Math.round(performance.now() - sttStarted);
      if (!result.transcript.trim()) {
        showState("error", "I didn’t hear any words. Try again.");
        return;
      }
      const heard = result.transcript.trim();
      const reply = await handleTranscript(heard);
      showState("speaking", `Heard: ${heard} → ${reply}`);
      const ttsStarted = performance.now();
      await speak(reply);
      const ttsMs = Math.round(performance.now() - ttsStarted);
      const elapsed = Math.round(performance.now() - started);
      console.info(`[Video Vault voice] STT ${sttMs} ms · TTS ${ttsMs} ms · total ${elapsed} ms`);
      showState("idle", `Heard: ${heard} → ${reply}`);
    } catch (error) {
      const message = error.name === "NotAllowedError" || error.name === "PermissionDeniedError"
        ? "Microphone access is blocked. Allow it in browser settings and try again."
        : error.message || "Voice control had a problem. Please try again.";
      showState("error", message);
    } finally {
      setPlaybackVolume(Number(getVolume()));
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
  textForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = textInput.value;
    textInput.value = "";
    runTextCommand(command);
  });
  window.addEventListener("resize", () => {
    if (!dock.classList.contains("is-positioned")) return;
    const bounds = button.getBoundingClientRect();
    setPosition(bounds.left, bounds.top);
  });

  return { element: dock, showState, start, runTextCommand };
}
