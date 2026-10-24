// dsh-qr-scanner: image decoding core.
// Engine: zxing-cpp compiled to WebAssembly (same C++ core as tools/qr_scan.py),
// so rotated / inverted / multi-symbol / low-quality codes behave identically.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { readBarcodes, prepareZXingModule } from "zxing-wasm/reader";

const require = createRequire(import.meta.url);

let wasmPrepared = false;

/** Locate the zxing-cpp WASM binary shipped by zxing-wasm. */
function wasmBinaryPath() {
  try {
    return require.resolve("zxing-wasm/reader/zxing_reader.wasm");
  } catch {
    // .../zxing-wasm/dist/es/reader/index.js -> .../zxing-wasm/dist/reader/zxing_reader.wasm
    const entry = require.resolve("zxing-wasm/reader");
    return join(dirname(entry), "..", "..", "..", "dist", "reader", "zxing_reader.wasm");
  }
}

/** Prepare the WASM module once, from disk (no network at runtime). */
export function ensureEngine() {
  if (wasmPrepared) return;
  prepareZXingModule({ overrides: { wasmBinary: readFileSync(wasmBinaryPath()) } });
  wasmPrepared = true;
}

const READER_OPTIONS = {
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 8,
};

/** "QRCode" -> "QR Code", "Code128" -> "Code 128". */
export function formatLabel(format) {
  return String(format ?? "Unknown")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

/** Best-effort content classification, mirroring the CLI tool. */
export function classify(text) {
  const t = String(text ?? "").trim();
  const low = t.toLowerCase();
  if (low.startsWith("http://") || low.startsWith("https://")) return "url";
  if (low.startsWith("wifi:")) return "wifi";
  if (low.startsWith("begin:vcard") || low.startsWith("mecard:")) return "contact";
  if (low.startsWith("mailto:")) return "email";
  if (low.startsWith("tel:")) return "phone";
  if (low.startsWith("smsto:") || low.startsWith("sms:")) return "sms";
  if (/^[0-9]{6,8}$/.test(t)) return "numeric";
  return "text";
}

function toCodes(results) {
  return results
    .filter((r) => r && r.isValid !== false && typeof r.text === "string" && r.text.length > 0)
    .map((r) => {
      const p = r.position ?? {};
      const xs = [p.topLeft?.x, p.topRight?.x, p.bottomRight?.x, p.bottomLeft?.x].filter((n) => typeof n === "number");
      const ys = [p.topLeft?.y, p.topRight?.y, p.bottomRight?.y, p.bottomLeft?.y].filter((n) => typeof n === "number");
      return {
        text: r.text,
        format: formatLabel(r.format),
        contentType: r.contentType ?? "Text",
        kind: classify(r.text),
        rotation: r.rotation ?? 0,
        inverted: Boolean(r.isInverted),
        box: xs.length === 4 && ys.length === 4
          ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
          : null,
      };
    });
}

/**
 * Decode every symbol in an encoded image buffer (PNG/JPEG/WebP/GIF/BMP/TIFF).
 * Falls back to upscaling when the image is too small for the detector.
 */
export async function decodeImageBuffer(buf) {
  ensureEngine();
  const bytes = new Uint8Array(buf);
  let found = await readBarcodes(bytes, READER_OPTIONS);
  if (found.length > 0) return toCodes(found);

  // Small screenshots / thumbnails: zxing needs more pixels than are there.
  try {
    const meta = await sharp(buf).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const min = Math.min(w, h);
    if (min > 0 && min < 400) {
      const factor = Math.max(2, Math.min(10, Math.ceil(900 / min)));
      const upscaled = await sharp(buf)
        .resize({ width: w * factor, height: h * factor, kernel: "lanczos3" })
        .png()
        .toBuffer();
      found = await readBarcodes(new Uint8Array(upscaled), READER_OPTIONS);
      if (found.length > 0) return toCodes(found);
    }
  } catch {
    // metadata/resize failures are non-fatal: we already know nothing was found
  }
  return [];
}

/** Decode a raw RGBA frame (screen capture) by encoding it to PNG first. */
export async function decodeRgbaFrame({ data, width, height }) {
  const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return decodeImageBuffer(png);
}

export { sharp };
