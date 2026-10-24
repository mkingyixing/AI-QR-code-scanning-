// dsh-qr-scanner: in-process Windows screen capture through GDI32 (koffi FFI).
// No helper process, no PowerShell, no native build step.
import koffi from "koffi";

let api = null;

function load() {
  if (api) return api;
  const user32 = koffi.load("user32.dll");
  const gdi32 = koffi.load("gdi32.dll");
  api = {
    GetDC: user32.func("void *GetDC(void *hWnd)"),
    ReleaseDC: user32.func("int ReleaseDC(void *hWnd, void *hDC)"),
    GetSystemMetrics: user32.func("int GetSystemMetrics(int nIndex)"),
    CreateCompatibleDC: gdi32.func("void *CreateCompatibleDC(void *hdc)"),
    CreateCompatibleBitmap: gdi32.func("void *CreateCompatibleBitmap(void *hdc, int w, int h)"),
    SelectObject: gdi32.func("void *SelectObject(void *hdc, void *h)"),
    BitBlt: gdi32.func("int BitBlt(void *hdcDest, int x, int y, int w, int h, void *hdcSrc, int sx, int sy, uint32 rop)"),
    GetDIBits: gdi32.func("int GetDIBits(void *hdc, void *hbm, uint32 start, uint32 lines, void *bits, void *bmi, uint32 usage)"),
    DeleteObject: gdi32.func("int DeleteObject(void *ho)"),
    DeleteDC: gdi32.func("int DeleteDC(void *hdc)"),
  };
  return api;
}

const SRCCOPY = 0x00cc0020;
const DIB_RGB_COLORS = 0;

/** SM_XVIRTUALSCREEN..SM_CYVIRTUALSCREEN */
const SM_XVIRTUALSCREEN = 76;
const SM_YVIRTUALSCREEN = 77;
const SM_CXVIRTUALSCREEN = 78;
const SM_CYVIRTUALSCREEN = 79;
const SM_CXSCREEN = 0;
const SM_CYSCREEN = 1;

/** Describe the virtual desktop in physical pixels, as seen by this process. */
export function screenBounds() {
  const a = load();
  const x = a.GetSystemMetrics(SM_XVIRTUALSCREEN);
  const y = a.GetSystemMetrics(SM_YVIRTUALSCREEN);
  const w = a.GetSystemMetrics(SM_CXVIRTUALSCREEN) || a.GetSystemMetrics(SM_CXSCREEN);
  const h = a.GetSystemMetrics(SM_CYVIRTUALSCREEN) || a.GetSystemMetrics(SM_CYSCREEN);
  return { x, y, width: w, height: h };
}

/** Parse "x,y,w,h" into a region object. */
export function parseRegion(region) {
  if (!region) return null;
  const parts = String(region).split(",").map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`region 需要 "x,y,w,h" 四个数字，收到: ${region}`);
  }
  const [x, y, w, h] = parts;
  if (w <= 0 || h <= 0) throw new Error(`region 宽高必须为正数，收到: ${region}`);
  return { x, y, w, h };
}

/**
 * Capture the screen (or a region) into an RGBA buffer.
 * @param {{x:number,y:number,w:number,h:number}|null} region
 */
export function captureScreen(region = null) {
  const a = load();
  const bounds = screenBounds();
  const x = region ? region.x : bounds.x;
  const y = region ? region.y : bounds.y;
  const w = region ? region.w : bounds.width;
  const h = region ? region.h : bounds.height;
  if (w <= 0 || h <= 0) throw new Error(`无效的捕获区域: ${w}x${h}`);

  const hdcScreen = a.GetDC(null);
  if (!hdcScreen) throw new Error("GetDC 失败，无法访问屏幕");
  const hdcMem = a.CreateCompatibleDC(hdcScreen);
  const hbmp = a.CreateCompatibleBitmap(hdcScreen, w, h);
  const previous = a.SelectObject(hdcMem, hbmp);
  let ok = 0;
  try {
    ok = a.BitBlt(hdcMem, 0, 0, w, h, hdcScreen, x, y, SRCCOPY);
    if (!ok) throw new Error("BitBlt 失败，无法复制屏幕像素");

    const bmi = Buffer.alloc(40);
    bmi.writeUInt32LE(40, 0);
    bmi.writeInt32LE(w, 4);
    bmi.writeInt32LE(-h, 8);
    bmi.writeUInt16LE(1, 12);
    bmi.writeUInt16LE(32, 14);
    bmi.writeUInt32LE(0, 16);

    const data = Buffer.alloc(w * h * 4);
    const lines = a.GetDIBits(hdcMem, hbmp, 0, h, data, bmi, DIB_RGB_COLORS);
    if (lines !== h) throw new Error(`GetDIBits 只返回 ${lines}/${h} 行`);

    // BGRA -> RGBA
    for (let i = 0; i < data.length; i += 4) {
      const b = data[i];
      data[i] = data[i + 2];
      data[i + 2] = b;
      data[i + 3] = 255;
    }
    return { width: w, height: h, data, origin: { x, y } };
  } finally {
    if (previous) a.SelectObject(hdcMem, previous);
    if (hbmp) a.DeleteObject(hbmp);
    if (hdcMem) a.DeleteDC(hdcMem);
    a.ReleaseDC(null, hdcScreen);
  }
}
