import { transcribe, speak } from "./gnani-client.js";
import { recordCommand } from "./recorder.js";

// Add a small microphone and status pill without changing the routed pages.
export function initVoiceUI({ getKeyterms = () => [] } = {}) {
  const dock = document.createElement("section");
  dock.className = "voice-dock";
  dock.innerHTML = `<p class="voice-status" role="status" aria-live="polite" hidden></p>
    <button class="voice-mic" type="button" aria-label="Start voice command" title="Start voice command">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8"/></svg>
    </button>`;
  document.body.append(dock);

  const button = dock.querySelector(".voice-mic");
  const status = dock.querySelector(".voice-status");
  let busy = false;

  function showState(state, message = "") {
    dock.dataset.state = state;
    button.disabled = busy;
    button.setAttribute("aria-label", state === "listening" ? "Listening for a voice command" : "Start voice command");
    button.title = state === "listening" ? "Listening…" : "Start voice command";
    status.hidden = !message;
    status.textContent = message;
  }

  async function start() {
    if (busy) return;
    busy = true;
    showState("listening", "Listening…");
    const started = performance.now();
    try {
      const wav = await recordCommand({ onState: (state) => showState(state, state === "thinking" ? "Preparing recording…" : "Listening…") });
      showState("thinking", "Transcribing…");
      const result = await transcribe(wav, getKeyterms());
      if (!result.transcript.trim()) {
        showState("error", "I didn’t hear any words. Try again.");
        return;
      }
      const heard = result.transcript.trim();
      const reply = `Maine suna: ${heard}`;
      showState("speaking", `Heard: ${heard}`);
      await speak(reply);
      const elapsed = Math.round(performance.now() - started);
      console.info(`[Video Vault voice] Speech-to-reply: ${elapsed} ms`);
      showState("idle", `Heard: ${heard}`);
    } catch (error) {
      const message = error.name === "NotAllowedError" || error.name === "PermissionDeniedError"
        ? "Microphone access is blocked. Allow it in browser settings and try again."
        : error.message || "Voice control had a problem. Please try again.";
      showState("error", message);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  button.addEventListener("click", start);
  return { element: dock, showState };
}
