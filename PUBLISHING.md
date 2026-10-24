# 发布清单（Publishing）

目标：让插件被 DSH 市场收录、别人能一条命令装上。

---

## 0. 发布前自检（每次发版都跑）

```powershell
cd plugins\dsh-qr-scanner
npm install --ignore-scripts     # 依赖已随仓库安装时跳过
node test\run.mjs                # 14 项必须全绿
npm pack --dry-run               # 确认打进去的文件没有多余内容
```

检查清单：

- [ ] `package.json` 的 `version` 已递增，并与 `CHANGELOG.md` 对应
- [ ] `node test/run.mjs` 14/14
- [ ] `README.md` / `README.zh-CN.md` 的安装命令是正确仓库地址
- [ ] `package.json` 的 `repository` / `homepage` / `bugs` 指向正确仓库
- [ ] `keywords` 里保留 `dsh-plugin`
- [ ] `LICENSE` 存在且与 `license` 字段一致
- [ ] 没有把 `node_modules`、`test/fixtures`、`.dsh-qr` 提交进仓库

---

## 1. 建 GitHub 仓库（必做，市场靠它收录）

1. 在 GitHub 新建空仓库，名字建议 `dsh-qr-scanner`（公开）。

   **仓库描述（About 一栏，350 字符以内）** —— 选一条粘贴：

   ```text
   QR/barcode scanner for DeepSeek Harness: decode images, the live screen or a webcam with zxing-cpp (WASM), and generate QR codes. 4 model tools, ~14 ms per decode.
   ```

   ```text
   DeepSeek Harness 的二维码/条码扫描插件：从图片、屏幕或摄像头读码，zxing-cpp（WASM）驱动，单次解码约 14 ms；也能生成二维码。
   ```

   **Topics**（至少第一个，市场靠它收录）：

   ```text
   dsh-plugin  deepseek-harness  dsh  qrcode  barcode-scanner  zxing  wasm  screenshot  ai-agent  windows
   ```

2. **给仓库加 topic：`dsh-plugin`** —— 市场 CI 每 2 小时扫描一次该 topic，最迟 2 小时自动收录，无需申请。
3. 把本地占位符换成你的仓库地址：

   ```powershell
   powershell -File .\scripts\set-repo.ps1 -Owner <你的GitHub用户名>
   ```

4. 推送：

   ```bash
   git remote add origin https://github.com/<owner>/dsh-qr-scanner.git
   git push -u origin main --tags
   ```

5. 收录后，别人可以这样安装：

   ```bash
   dsh plugin add github:<owner>/dsh-qr-scanner
   ```

> 市场收录只索引仓库元数据；安装是直连 github.com 克隆，所以仓库必须公开可访问。

---

## 2. 发 npm（可选，但推荐）

有了 npm 包，安装命令可以简写成 `dsh plugin --profile web add dsh-qr-scanner`。

```bash
npm login
npm publish --access public
```

注意：

- 名字 `dsh-qr-scanner` 目前未被占用（2026-10-24 查证）。
- 包里有 `sharp` / `koffi` 这类带原生二进制的依赖，npm 安装时由各自的 optionalDependencies 处理平台差异，不需要额外配置。
- 首次发布前确认 `files` 字段只包含 `lib/ scripts/ cordis.patch.yml README* LICENSE`。

发版流程：

```bash
npm version patch   # 或 minor / major，会自动打 tag
git push --follow-tags
npm publish --access public
```

---

## 3. 验证安装

在目标机器上：

```powershell
dsh plugin --profile web add dsh-qr-scanner
# 或从源码：
dsh plugin --profile web add github:<owner>/dsh-qr-scanner
```

重启 DSH 后，对模型说「扫一下这张图」，应看到工具 `qr_scan` 被调用。
也可以直接检查模型工具列表里是否出现：

- `qr_scan`
- `qr_scan_screen`
- `qr_scan_camera`
- `qr_make`

桌面端（Electron）安装方式见 README 的“从本地目录安装”。

---

## 4. 回滚 / 撤回

```bash
npm unpublish dsh-qr-scanner@<version> --force   # npm 撤回（72 小时内可无痕）
git tag -d v<version> && git push origin :refs/tags/v<version>
```

已安装用户需要重新装旧版本，或在 profile 里 `-Uninstall`。

---

## 5. 版本规划建议

| 版本 | 内容 |
| --- | --- |
| 0.1.x | 修 bug、兼容新的 DSH peer 版本 |
| 0.2.0 | 剪贴板输入、Linux/macOS 截屏（xdotool / screencapture 后端） |
| 0.3.0 | 多显示器区域选择、批量目录扫描的并发优化 |
