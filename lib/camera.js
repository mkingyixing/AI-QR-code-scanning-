// dsh-qr-scanner: optional webcam frame grab through ffmpeg (DirectShow on Windows).
// Kept out of the critical path: if ffmpeg or a camera is missing, the tool reports
// a clear error instead of failing the plugin.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { promises as fs, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);

function candidatePaths() {
  const list = [];
  if (process.env.DSH_FFMPEG) list.push(process.env.DSH_FFMPEG);
  for (const dir of String(process.env.PATH ?? "").split(";")) {
    if (!dir) continue;
    list.push(join(dir, "ffmpeg.exe"));
    list.push(join(dir, "ffmpeg"));
  }
  list.push("D:\\ffmpeg\\bin\\ffmpeg.exe", "C:\\ffmpeg\\bin\\ffmpeg.exe", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg");
  return list;
}

/** Absolute path to ffmpeg, or null when it is not installed. */
export function findFfmpeg() {
  for (const candidate of candidatePaths()) {
    try {
      if (require("node:fs").statSync(candidate).isFile()) return candidate;
    } catch {
      // keep looking
    }
  }
  // fall back to PATH resolution done by the OS
  const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 5000 });
  return probe.status === 0 ? "ffmpeg" : null;
}

/** List DirectShow video devices (best effort). */
export function listCameras(ffmpeg) {
  const logFile = join(tmpdir(), `dsh-qr-cam-${process.pid}.log`);
  const fd = require("node:fs").openSync(logFile, "w");
  try {
    spawnSync(ffmpeg, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], {
      stdio: ["ignore", "ignore", fd],
      timeout: 15000,
      windowsHide: true,
    });
  } finally {
    require("node:fs").closeSync(fd);
  }
  let raw = "";
  try {
    raw = readFileSync(logFile, "utf8");
  } catch {
    raw = "";
  }
  void fs.unlink(logFile).catch(() => {});
  const names = [...raw.matchAll(/"([^"]+)"\s*\((?:video|none)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  return [...new Set(names)];
}

/** Grab one non-blank frame from a camera. */
export async function grabCameraFrame(ffmpeg, { device, warmupMs = 600 } = {}) {
  const dir = await fs.mkdtemp(join(tmpdir(), "dsh-qr-cam-"));
  try {
    const devices = device ? [device] : listCameras(ffmpeg);
    if (devices.length === 0) throw new Error("没有检测到摄像头");

    const blank = [];
    for (const name of devices.slice(0, 3)) {
      if (warmupMs) await new Promise((r) => setTimeout(r, warmupMs));
      const pattern = join(dir, "frame-%02d.png");
      spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "dshow", "-rtbufsize", "64M",
        "-i", `video=${name}`, "-frames:v", "4", "-y", pattern], {
        stdio: "ignore",
        timeout: 30000,
        windowsHide: true,
      });
      const files = (await fs.readdir(dir)).filter((f) => f.startsWith("frame-")).sort();
      for (const file of files) {
        const buf = await fs.readFile(join(dir, file));
        const stats = await sharp(buf).greyscale().stats();
        if (stats.channels[0]?.stdev > 3) {
          return { device: name, bytes: buf };
        }
      }
      if (files.length > 0) blank.push(name);
      for (const file of files) await fs.unlink(join(dir, file)).catch(() => {});
    }
    if (blank.length > 0) {
      throw new Error(`摄像头能打开但画面全黑（${[...new Set(blank)].join("、")}）。通常是隐私保护软件遮挡或设备被占用。`);
    }
    throw new Error(`摄像头抓帧失败: ${devices.slice(0, 3).join("、")}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
