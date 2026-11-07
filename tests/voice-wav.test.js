import test from "node:test";
import assert from "node:assert/strict";
import { decodePcm16Wav, encodePcm16Wav, inspectPcm16Wav } from "../js/voice/wav.js";

test("encoded microphone WAV has a valid mono 16 kHz PCM header and decodes back", () => {
  const source = new Float32Array([-1, -0.5, 0, 0.5, 1, 2, -2]);
  const wav = encodePcm16Wav(source, 16_000);
  const header = inspectPcm16Wav(wav);
  assert.deepEqual(header, {
    valid: true, sampleRate: 16_000, channels: 1, bitsPerSample: 16,
    dataBytes: source.length * 2, bytes: 44 + source.length * 2, reason: "OK"
  });
  const decoded = decodePcm16Wav(wav);
  assert.equal(decoded.sampleRate, 16_000);
  const expected = [-1, -0.5, 0, 0.5, 1, 1, -1];
  decoded.samples.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= 1 / 32768));
});

test("WAV inspection rejects truncated or corrupted recordings", () => {
  assert.equal(inspectPcm16Wav(new Uint8Array(20)).valid, false);
  const wav = encodePcm16Wav(new Float32Array([0.25]));
  wav[0] = 0;
  assert.equal(inspectPcm16Wav(wav).valid, false);
  assert.throws(() => decodePcm16Wav(wav), /invalid/);
});
