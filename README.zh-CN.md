# AI-QR-code-scanning-

二维码 / 条码扫描工具，给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的模型加上"眼睛"：读图片、读屏幕、读摄像头，也能生成二维码。

解码核心是 **zxing-cpp 编译成的 WebAssembly**（`zxing-wasm`），与桌面端常用的 C++ 扫码库同源，因此旋转、反色、小图、透视、一张图多个码都能处理。

## 提供什么

| 工具 | 作用 | 输入 |
| --- | --- | --- |
| `qr_scan` | 解码图片里的二维码/条码，多码全部返回（带坐标） | 本地路径、通配符、http(s) URL |
| `qr_scan_screen` | 抓当前屏幕后解码，可限定区域 | `region: "x,y,w,h"` |
| `qr_scan_camera` | 抓摄像头一帧后解码 | 可选设备名 |
| `qr_make` | 文本/链接生成二维码 PNG | 写入会话工作区 `.dsh-qr/` |

返回示例：

```json
{
  "ok": true,
  "source": "C:\\shots\\poster.png",
  "results": [
    { "text": "http://cloud.example.com/embed/76e3ca", "format": "QR Code", "kind": "url", "box": [215, 403, 300, 489] }
  ]
}
```

`kind` 会识别 `url` / `wifi` / `contact` / `email` / `phone` / `sms` / `numeric`，便于模型直接判断下一步。

## 安装

**从 GitHub 源码（推荐；仓库打了 `dsh-plugin` topic 后市场会自动收录，也能在插件面板里点安装）：**

```bash
dsh plugin --profile web add github:mkingyixing/AI-QR-code-scanning-
```

**从 npm：** 暂未发布。npm 不接受含大写的包名，若要发包需改用全小写名（例如 `ai-qr-code-scanning`），详见 [PUBLISHING.md](PUBLISHING.md)。

**从本地目录安装（桌面端，无需网络）：**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

安装后**重启 DeepSeek Harness**（桌面端热重载通常立即生效，不重启也能用）。卸载：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Uninstall
```

## 模型侧用法

模型会自己调用，不需要你记命令。你可以直接说：

- "扫一下这张图" + 拖入二维码截图
- "扫我屏幕上的二维码"（可加"只看右下角" → 模型会用 `region`）
- "把这段链接做成二维码"

## 为什么不是"调个 Python 脚本"

同一批 10 张测试图上（旋转/反色/78px 小图/模糊 JPEG/透视/双码），
`tools/_bench/results.md` 有完整数据：zxing-cpp 10/10，jsQR 8/10，zxing-js 7/10。

插件形态相对脚本的收益（本机实测）：

| 指标 | Python 脚本 | 本插件 |
| --- | --- | --- |
| 单次解码（含启动） | ~750 ms | **13.6 ms** 暖态 / 92 ms 首次（含 WASM 加载） |
| 整屏抓取+解码 | ~1 500 ms | **227 ms** |
| 跨会话可用 | 否 | 是（注册为模型工具） |

## 配置

在 `cordis.patch.yml` 的插件条目里可覆盖：

```yaml
- insert:
    - id: tool-qr-scanner
      name: AI-QR-code-scanning-
      config:
        outputDir: .dsh-qr        # 生成/截图输出目录（相对会话工作区）
        maxInputBytes: 20971520   # 单张图片上限
        timeoutMs: 20000          # 声明式超时
```

## 隐私与安全

- 全部本地：WASM 解码、GDI 截屏、ffmpeg 抓帧，**不联网**（除非你显式给 `qr_scan` 传 http(s) URL）。
- 截屏只在内存里解码；只有 `save: true` 时才落盘到工作区。
- 摄像头依赖系统 ffmpeg 与设备权限；被隐私软件遮挡时会返回明确错误，不会静默失败。

## 已知限制

- 截屏用 Windows GDI（`koffi` FFI），目前**仅 Windows**；其他平台 `qr_scan` / `qr_make` 仍可用。
- 摄像头需要 PATH 里有 `ffmpeg`（或设置 `DSH_FFMPEG`）。
- 只读图片输入：PNG/JPEG/WebP/GIF/BMP/TIFF/AVIF（由 sharp 解码）。

## 开发

```bash
npm install --ignore-scripts   # sharp/koffi 的安装脚本在受限环境里会失败，二进制已随包提供
node test/run.mjs              # 14 项离线回归（含语料 10/10）
```

发布流程（建仓库、打 topic、发 npm）见 [PUBLISHING.md](PUBLISHING.md)。

## License

MIT
