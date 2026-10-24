# dsh-qr-scanner

QR / barcode scanning for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): give the model eyes for codes — from image files, the live screen, or a webcam — plus QR generation.

Decoding is powered by **zxing-cpp compiled to WebAssembly** (`zxing-wasm`), the same C++ core behind most desktop scanners, so rotated, inverted, tiny, perspective-skewed and multi-symbol images all work.

## Tools

| Tool | What it does | Input |
| --- | --- | --- |
| `qr_scan` | Decode every code in an image, with positions | path, glob, http(s) URL |
| `qr_scan_screen` | Capture the screen (optionally a region) and decode | `region: "x,y,w,h"` |
| `qr_scan_camera` | Grab one webcam frame and decode | optional device name |
| `qr_make` | Render text/URL as a QR PNG | writes to `.dsh-qr/` in the workspace |

```json
{
  "ok": true,
  "source": "C:\\shots\\poster.png",
  "results": [
    { "text": "http://cloud.example.com/embed/76e3ca", "format": "QR Code", "kind": "url", "box": [215, 403, 300, 489] }
  ]
}
```

`kind` classifies the payload as `url` / `wifi` / `contact` / `email` / `phone` / `sms` / `numeric` / `text`.

## Install

From GitHub (recommended; add the `dsh-plugin` topic and the marketplace picks it up automatically):

```bash
dsh plugin --profile web add github:mkingyixing/AI-QR-code-scanning-
```

From npm (after publishing):

```bash
dsh plugin --profile web add dsh-qr-scanner
```

Local install (desktop profile, no network):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Restart DeepSeek Harness afterwards. Uninstall with `-Uninstall`.

## Why a plugin instead of a script

On the shared 10-image corpus (rotation, inversion, 78px thumbnail, blurry JPEG, perspective, two codes in one frame) zxing-cpp scores 10/10 — see `tools/_bench/results.md`. Running it in-process removes the interpreter startup:

| Metric | Python script | This plugin |
| --- | --- | --- |
| One decode (cold) | ~750 ms | 92 ms (WASM load) |
| One decode (warm) | ~750 ms | **13.6 ms** |
| Full-screen capture + decode | ~1 500 ms | **227 ms** |

## Config

```yaml
- insert:
    - id: tool-qr-scanner
      name: dsh-qr-scanner
      config:
        outputDir: .dsh-qr
        maxInputBytes: 20971520
        timeoutMs: 20000
```

## Privacy

Everything runs locally: WASM decoding, GDI screen capture, ffmpeg frame grabs. No network calls unless you pass an explicit http(s) URL to `qr_scan`. Screenshots stay in memory unless `save: true`.

## Limitations

- Screen capture uses Win32 GDI via `koffi`, so it is **Windows-only**; `qr_scan` and `qr_make` still work elsewhere.
- Webcam capture needs `ffmpeg` on `PATH` (or `DSH_FFMPEG`).
- Image formats: PNG/JPEG/WebP/GIF/BMP/TIFF/AVIF (decoded by sharp).

## License

MIT
