// dsh-qr-scanner: DeepSeek Harness plugin.
// Registers four model-facing tools: qr_scan, qr_scan_screen, qr_scan_camera, qr_make.
import { defineTool } from "@deepseek-ai/dsh-tools";
import { decodeImageBuffer, decodeRgbaFrame } from "./decode.js";
import { captureScreen, parseRegion, screenBounds } from "./capture.js";
import { loadSources } from "./sources.js";
import { generateQrCode } from "./generate.js";
import { findFfmpeg, grabCameraFrame } from "./camera.js";

export const name = "tool-qr-scanner";
export const inject = ["tools", "systemPrompt"];

const DEFAULTS = {
  outputDir: ".dsh-qr",
  maxInputBytes: 20 * 1024 * 1024,
  timeoutMs: 20_000,
};

const resultItemSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", required: true },
    format: { type: "string", required: true },
    kind: { type: "string", required: true },
    contentType: { type: "string" },
    rotation: { type: "number" },
    inverted: { type: "boolean" },
    box: { type: "array", items: { type: "number" } },
    source: { type: "string" },
  },
};

const scanOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", required: true },
    source: { type: "string", required: true },
    results: { type: "array", required: true, items: resultItemSchema },
    saved: { type: "string" },
    error: { type: "string" },
  },
};

const generateOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: { type: "string", required: true },
    bytes: { type: "number", required: true },
    size: { type: "number", required: true },
    text: { type: "string", required: true },
    ecLevel: { type: "string", required: true },
    error: { type: "string" },
  },
};

const asText = (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }];

function sessionCwd(exec) {
  const cwd = exec?.agent?.session?.header?.cwd;
  return typeof cwd === "string" && cwd.trim() ? cwd.trim() : process.cwd();
}

function describeResults(source, codes, extra = {}) {
  const value = { ok: codes.length > 0, source, results: codes };
  for (const [key, item] of Object.entries(extra)) {
    if (item !== undefined) value[key] = item;
  }
  return value;
}

function fail(source, error) {
  return { ok: false, source, results: [], error: error instanceof Error ? error.message : String(error) };
}

export function apply(ctx, config = {}) {
  const settings = { ...DEFAULTS, ...(config ?? {}) };

  ctx.systemPrompt.section({
    name: "tool:qr-scanner",
    order: 106,
    text: [
      "二维码/条码扫描可用以下工具：",
      "qr_scan 解码图片中的二维码/条码（本地路径、通配符或 http(s) URL，支持多码，返回文本、码制与坐标）；",
      "qr_scan_screen 先抓取当前屏幕（可限定 region: \"x,y,w,h\"）再解码，适合“扫我屏幕上的码”；",
      "qr_scan_camera 抓取摄像头一帧再解码；qr_make 把文本生成二维码 PNG（写入会话工作区 .dsh-qr/）。",
      "用户给出二维码截图或说“扫一下/扫我屏幕”时直接调用，不要先让用户手工描述内容。",
    ].join(" "),
  });

  ctx.tools.register(defineTool({
    name: "qr_scan",
    description: "解码图片中的二维码/条形码。source 支持本地路径、通配符（如 shots/*.png）或 http(s) URL；一张图里有多个码会全部返回，附带文本、码制、内容类型与该码在图中的坐标。",
    parameters: {
      source: {
        type: "string",
        required: true,
        description: "图片路径（绝对或相对会话工作区）、通配符，或 http(s) URL。",
      },
    },
    timeoutMs: settings.timeoutMs,
    output: { schema: scanOutputSchema, render: asText },
    execute: async (args, exec) => {
      try {
        if (exec?.signal?.aborted) throw new Error("qr_scan 在开始前被中止");
        const cwd = sessionCwd(exec);
        const inputs = await loadSources(args.source, { cwd, signal: exec?.signal, maxBytes: settings.maxInputBytes });
        const codes = [];
        for (const input of inputs) {
          if (exec?.signal?.aborted) throw new Error("qr_scan 已取消");
          const found = await decodeImageBuffer(input.bytes);
          for (const code of found) codes.push({ ...code, source: input.label });
        }
        return describeResults(String(args.source), codes, { error: codes.length ? undefined : "未识别到二维码或条形码" });
      } catch (error) {
        return fail(String(args.source ?? ""), error);
      }
    },
    presentCall: () => ({ card: "generic", title: "QR scan", kind: "read" }),
  }));

  ctx.tools.register(defineTool({
    name: "qr_scan_screen",
    description: "抓取当前屏幕（可用 region 限定 \"x,y,w,h\" 区域）并解码其中的二维码/条形码。不落盘，除非 save 为 true 时把截图存到会话工作区 .dsh-qr/。",
    parameters: {
      region: { type: "string", description: "可选，屏幕区域 \"x,y,w,h\"（物理像素）。省略则整屏。" },
      save: { type: "boolean", description: "是否把截图保存到 .dsh-qr/ 下，默认 false。" },
    },
    timeoutMs: settings.timeoutMs,
    output: { schema: scanOutputSchema, render: asText },
    execute: async (args, exec) => {
      try {
        if (exec?.signal?.aborted) throw new Error("qr_scan_screen 在开始前被中止");
        const region = parseRegion(args.region);
        const frame = captureScreen(region);
        const codes = await decodeRgbaFrame(frame);
        let saved;
        if (args.save) {
          const cwd = sessionCwd(exec);
          const path = await savePng(frame, cwd, settings.outputDir);
          saved = path;
        }
        return describeResults(region ? `screen:${args.region}` : "screen", codes, {
          ...(saved ? { saved } : {}),
          ...(codes.length ? {} : { error: "屏幕上没有识别到二维码或条形码" }),
        });
      } catch (error) {
        return fail("screen", error);
      }
    },
    presentCall: () => ({ card: "generic", title: "QR scan screen", kind: "read" }),
  }));

  ctx.tools.register(defineTool({
    name: "qr_scan_camera",
    description: "抓取摄像头一帧并解码其中的二维码/条形码（依赖 ffmpeg 与可用摄像头）。",
    parameters: {
      device: { type: "string", description: "可选，摄像头名称；省略则自动挑选并跳过全黑设备。" },
      warmupMs: { type: "number", description: "抓帧前预热毫秒数，默认 600。" },
    },
    timeoutMs: settings.timeoutMs,
    output: { schema: scanOutputSchema, render: asText },
    execute: async (args, exec) => {
      try {
        if (exec?.signal?.aborted) throw new Error("qr_scan_camera 在开始前被中止");
        const ffmpeg = findFfmpeg();
        if (!ffmpeg) throw new Error("找不到 ffmpeg，无法抓取摄像头");
        const frame = await grabCameraFrame(ffmpeg, { device: args.device, warmupMs: args.warmupMs });
        const codes = await decodeImageBuffer(frame.bytes);
        return describeResults(`camera:${frame.device}`, codes, {
          ...(codes.length ? {} : { error: "摄像头画面中没有识别到二维码" }),
        });
      } catch (error) {
        return fail("camera", error);
      }
    },
    presentCall: () => ({ card: "generic", title: "QR scan camera", kind: "read" }),
  }));

  ctx.tools.register(defineTool({
    name: "qr_make",
    description: "把文本或链接生成二维码 PNG，保存到会话工作区的 .dsh-qr/ 目录并返回文件路径。",
    parameters: {
      text: { type: "string", required: true, description: "要编码的文本或 URL。" },
      size: { type: "number", description: "边长像素，默认 512（128-2048）。" },
      fileName: { type: "string", description: "文件名（可省略 .png），默认按时间生成。" },
      ecLevel: { type: "string", description: "容错级别 L/M/Q/H，默认 M。" },
    },
    timeoutMs: settings.timeoutMs,
    output: { schema: generateOutputSchema, render: asText },
    execute: async (args, exec) => {
      try {
        const cwd = sessionCwd(exec);
        return await generateQrCode(args.text, {
          cwd,
          outputDir: settings.outputDir,
          size: args.size,
          fileName: args.fileName,
          ecLevel: args.ecLevel,
        });
      } catch (error) {
        return { path: "", bytes: 0, size: 0, text: String(args.text ?? ""), ecLevel: "", error: error instanceof Error ? error.message : String(error) };
      }
    },
    presentCall: (args) => ({ card: "generic", title: "QR generate", kind: "write", rawInput: String(args?.text ?? "").slice(0, 80) }),
  }));
}

async function savePng(frame, cwd, outputDir) {
  const { promises: fsp } = await import("node:fs");
  const { join, resolve } = await import("node:path");
  const sharpModule = (await import("sharp")).default;
  const dir = resolve(cwd, outputDir);
  await fsp.mkdir(dir, { recursive: true });
  const path = join(dir, `screen-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}.png`);
  const png = await sharpModule(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } }).png().toBuffer();
  await fsp.writeFile(path, png);
  return path;
}

export { screenBounds };

export default { name, inject, apply };
