// dsh-qr-scanner: turn a tool argument into image bytes (path, glob, URL).
import { promises as fs } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif)$/i;

/** Convert a simple glob (`*`, `?`, `**`) to a RegExp. */
function globToRegExp(pattern) {
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/\\\\]*";
      }
    } else if (ch === "?") {
      out += "[^/\\\\]";
    } else if ("\\^$.|+()[]{}".includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return new RegExp(out + "$", "i");
}

/** Expand one glob pattern against the filesystem (non-recursive `*`, recursive `**`). */
async function expandGlob(pattern, cwd) {
  const absolute = isAbsolute(pattern) ? pattern : resolve(cwd, pattern);
  const normalized = absolute.replace(/\\/g, "/");
  const wildcardIndex = normalized.search(/[*?]/);
  const baseDir = normalized.slice(0, normalized.lastIndexOf("/", wildcardIndex) + 1) || "/";
  const rest = normalized.slice(baseDir.length);
  const recursive = rest.includes("**");

  const matcher = globToRegExp(rest);
  const hits = [];
  const walk = async (dir, prefix) => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (recursive) await walk(join(dir, entry.name), rel);
      } else if (matcher.test(rel)) {
        hits.push(join(dir, entry.name));
      }
    }
  };
  await walk(baseDir, "");
  return hits.sort();
}

async function fetchUrl(url, { signal, maxBytes }) {
  const res = await fetch(url, { signal, redirect: "follow" });
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status} ${res.statusText}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`图片过大: ${declared} bytes > ${maxBytes}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`图片过大: ${buf.length} bytes > ${maxBytes}`);
  return buf;
}

/**
 * Resolve a tool `source` argument into a list of { label, bytes }.
 * Supports: local file, glob pattern, http(s) URL.
 */
export async function loadSources(source, { cwd, signal, maxBytes }) {
  const raw = String(source ?? "").trim();
  if (!raw) throw new Error("source 不能为空");

  if (/^https?:\/\//i.test(raw)) {
    return [{ label: raw, bytes: await fetchUrl(raw, { signal, maxBytes }) }];
  }

  if (/[*?]/.test(raw)) {
    const files = (await expandGlob(raw, cwd)).filter((f) => IMAGE_EXT.test(f));
    if (files.length === 0) throw new Error(`通配符没有匹配到图片: ${raw}`);
    if (files.length > 20) throw new Error(`一次最多扫描 20 张图，匹配到 ${files.length} 张`);
    const out = [];
    for (const file of files) {
      out.push({ label: file, bytes: await readLocal(file, maxBytes) });
    }
    return out;
  }

  const absolute = isAbsolute(raw) ? raw : resolve(cwd, raw);
  return [{ label: absolute, bytes: await readLocal(absolute, maxBytes) }];
}

async function readLocal(path, maxBytes) {
  let stat;
  try {
    stat = await fs.stat(path);
  } catch {
    throw new Error(`文件不存在: ${path}`);
  }
  if (!stat.isFile()) throw new Error(`不是文件: ${path}`);
  if (stat.size > maxBytes) throw new Error(`图片过大: ${stat.size} bytes > ${maxBytes}`);
  return fs.readFile(path);
}

export { dirname };
