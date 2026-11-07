// Browser requests go to our local server; the API key never reaches this file.
export async function transcribe(blob, keyterms = []) {
  const form = new FormData();
  form.append("audio_file", blob, "voice-command.wav");
  form.append("keyterms", JSON.stringify(keyterms.slice(0, 200)));
  let response;
  try { response = await fetch("/api/stt", { method: "POST", body: form }); }
  catch (_) { throw new Error("Voice service is offline. Start the local app server and check your connection."); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Speech recognition failed. Try again.");
  return {
    transcript: typeof result.transcript === "string" ? result.transcript : "",
    detectedLanguageCode: result.detected_language_code || ""
  };
}

export async function speak(text) {
  let response;
  try {
    response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
  } catch (_) { throw new Error("Voice reply service is offline. Start the local app server and check your connection."); }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Could not speak the reply.");
  }

  const audioUrl = URL.createObjectURL(await response.blob());
  try {
    const audio = new Audio(audioUrl);
    await new Promise((resolve, reject) => {
      audio.addEventListener("ended", resolve, { once: true });
      audio.addEventListener("error", () => reject(new Error("Could not play the spoken reply.")), { once: true });
      audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(audioUrl);
  }
}
