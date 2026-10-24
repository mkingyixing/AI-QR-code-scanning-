// AI-QR-code-scanning-: QR generation into the session workspace.
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import QRCode from "qrcode";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Strip path separators and characters Windows rejects in file names. */
function safeFileName(name) {
  return String(name ?? "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
}

/**
 * Render `text` as a PNG QR code inside the session workspace.
 * @returns {{path:string, bytes:number, size:number, text:string, ecLevel:string}}
 */
export async function generateQrCode(text, { cwd, outputDir = ".dsh-qr", size = 512, fileName, ecLevel = "M" } = {}) {
  const content = String(text ?? "");
  if (!content) throw new Error("text 不能为空");

  const dir = resolve(cwd, outputDir);
  await fs.mkdir(dir, { recursive: true });

  const base = safeFileName(fileName) || `qr-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const path = join(dir, base.toLowerCase().endsWith(".png") ? base : `${base}.png`);

  const width = clamp(Number(size) || 512, 128, 2048);
  const level = ["L", "M", "Q", "H"].includes(String(ecLevel).toUpperCase())
    ? String(ecLevel).toUpperCase()
    : "M";

  const buf = await QRCode.toBuffer(content, {
    type: "png",
    width,
    margin: 2,
    errorCorrectionLevel: level,
  });
  await fs.writeFile(path, buf);

  return { path, bytes: buf.length, size: width, text: content, ecLevel: level };
}
