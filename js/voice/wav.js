// Encode and inspect PCM WAV data without browser-only APIs.
export function encodePcm16Wav(samples, sampleRate = 16_000) {
  if (!Number.isInteger(sampleRate) || sampleRate < 1) throw new RangeError("Sample rate must be a positive integer.");
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, Number(samples[index]) || 0));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Uint8Array(bytes);
}

// Validate the standard 44-byte mono PCM header and report its key values.
export function inspectPcm16Wav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  const longEnough = bytes.byteLength >= 44;
  if (!longEnough) return { valid: false, reason: "WAV is shorter than its header.", bytes: bytes.byteLength };
  const sampleRate = view.getUint32(24, true);
  const channels = view.getUint16(22, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);
  const valid = ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE" && ascii(12, 4) === "fmt "
    && ascii(36, 4) === "data" && view.getUint16(20, true) === 1 && channels === 1
    && bitsPerSample === 16 && sampleRate > 0 && dataBytes + 44 === bytes.byteLength;
  return { valid, sampleRate, channels, bitsPerSample, dataBytes, bytes: bytes.byteLength, reason: valid ? "OK" : "WAV header or data length is invalid." };
}

// Decode our PCM format so tests can verify the encoded samples round-trip.
export function decodePcm16Wav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const header = inspectPcm16Wav(bytes);
  if (!header.valid) throw new Error(header.reason);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(header.dataBytes / 2);
  for (let index = 0; index < samples.length; index += 1) {
    const value = view.getInt16(44 + index * 2, true);
    samples[index] = value < 0 ? value / 32768 : value / 32767;
  }
  return { sampleRate: header.sampleRate, channels: header.channels, bitsPerSample: header.bitsPerSample, samples };
}
