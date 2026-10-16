const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const dir = process.argv[2];
if (!dir) throw new Error("Supply an external fixture directory");
fs.mkdirSync(dir, { recursive: true });
const specs = [
  { name: "mono-3s-48k.wav", seconds: 3, channels: 1, seed: 19 },
  { name: "stereo-5s-48k.wav", seconds: 5, channels: 2, seed: 15 },
  { name: "stereo-60s-48k.wav", seconds: 60, channels: 2, seed: 21 },
];
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
for (const s of specs) {
  const n = s.seconds * 48000,
    b = Buffer.alloc(44 + n * s.channels * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(s.channels, 22);
  b.writeUInt32LE(48000, 24);
  b.writeUInt32LE(48000 * s.channels * 2, 28);
  b.writeUInt16LE(s.channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(b.length - 44, 40);
  const generators = Array.from({ length: s.channels }, (_, ch) =>
    rng(s.seed + ch),
  );
  for (let i = 0; i < n; i++)
    for (let ch = 0; ch < s.channels; ch++)
      b.writeInt16LE(
        Math.round((generators[ch]() * 2 - 1) * 0.8 * 32767),
        44 + (i * s.channels + ch) * 2,
      );
  fs.writeFileSync(path.join(dir, s.name), b);
  s.bytes = b.length;
  s.sha256 = crypto.createHash("sha256").update(b).digest("hex");
}
fs.writeFileSync(
  path.join(dir, "manifest.json"),
  JSON.stringify(
    {
      source:
        "Same mulberry32 generator/seed/scale and durations as bench/benchmark.ts for 3s mono and 5s stereo; PCM16 quantization for real files. 60s is an added scaling workload.",
      sampleRate: 48000,
      encoding: "PCM16 WAV",
      specs,
    },
    null,
    2,
  ),
);
