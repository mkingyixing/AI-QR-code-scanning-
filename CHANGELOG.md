# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-10-24

First release.

### Added

- `qr_scan` tool — decodes QR codes and barcodes from a local path, a glob
  (`shots/*.png`, max 20 files) or an `http(s)` URL. Returns every symbol found,
  with format, content type, rotation/inversion flags and pixel bounding box.
- `qr_scan_screen` tool — captures the Windows desktop in-process (GDI32 via
  `koffi`, no helper process) and decodes it; optional `region: "x,y,w,h"` and
  optional `save: true` to keep the screenshot in `.dsh-qr/`.
- `qr_scan_camera` tool — grabs one DirectShow frame through `ffmpeg`, skipping
  blank/virtual devices and reporting blocked cameras explicitly.
- `qr_make` tool — renders text or a URL as a PNG QR code inside the session
  workspace, with configurable size and EC level.
- Decoding engine: `zxing-wasm` (zxing-cpp 3.1.6 compiled to WebAssembly),
  loaded from disk so the plugin never touches the network.
- Automatic upscale retry for small images (thumbnails down to 78 px decode).
- System-prompt section so the model knows when to reach for these tools.
- Offline regression suite (`node test/run.mjs`): 14 checks over a vendored
  10-image corpus, including rotation, inversion, blur, perspective,
  multi-symbol, glob input, error paths and a generate→decode round trip.
- `scripts/install.ps1` / `-Uninstall` for profile-level installation on the
  desktop app (copies dependencies, patches `cordis.patch.yml` idempotently,
  backs up the patch file).

### Performance

Measured on Windows 11, 2560×1600 display, warm process:

| Operation | Time |
| --- | --- |
| Decode one clean 392 px image | 13.6 ms |
| First decode after load (WASM init) | 92 ms |
| Full-screen capture + decode | 227 ms |

### Known limitations

- Screen capture is Windows-only (GDI32); `qr_scan` and `qr_make` are portable.
- Webcam capture requires `ffmpeg` on `PATH` or `DSH_FFMPEG`.
- Clipboard image input is not implemented yet (the `tools/qr_scan.py`
  fallback still covers it).

[0.1.0]: https://github.com/mkingyixing/AI-QR-code-scanning-/releases/tag/v0.1.0
