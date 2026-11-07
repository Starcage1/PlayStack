// Browser requests go to our local server; the API key never reaches this file.
export async function transcribe(blob, keyterms = [], { onRequest = () => {} } = {}) {
  const form = new FormData();
  form.append("audio_file", blob, "voice-command.wav");
  form.append("keyterms", JSON.stringify(keyterms.slice(0, 200)));
  const requestInfo = {
    method: "POST", url: "/api/stt", fieldName: "audio_file", filename: "voice-command.wav",
    contentType: blob.type || "audio/wav", bytes: blob.size, keytermsCount: Math.min(200, keyterms.length),
    keyterms: keyterms.slice(0, 200),
    serverProfile: "prisma-v3.0 / indic-auto / transliterate"
  };
  onRequest(requestInfo);
  let response;
  try { response = await fetch("/api/stt", { method: "POST", body: form }); }
  catch (_) {
    const error = new Error("Voice service is offline. Start the local app server and check your connection.");
    error.requestInfo = requestInfo;
    throw error;
  }
  const rawResponse = await response.text();
  let result = {};
  try { result = JSON.parse(rawResponse); } catch (_) { /* Preserve the raw server response for diagnostics. */ }
  if (!response.ok) {
    const error = new Error(result.error || `Speech recognition failed (HTTP ${response.status}).`);
    error.httpStatus = response.status;
    error.rawResponse = rawResponse;
    error.requestInfo = requestInfo;
    throw error;
  }
  return {
    transcript: typeof result.transcript === "string" ? result.transcript : "",
    detectedLanguageCode: result.detected_language_code || "",
    httpStatus: response.status,
    rawResponse,
    requestInfo
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
