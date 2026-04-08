const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TARGET_DIRS = [
  path.join(ROOT, "src", "extensions", "providers"),
];

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(dir, name));
}

function extractUrls(content) {
  return Array.from(content.matchAll(/https?:\/\/[^\s"'`<>]+/g), (match) => String(match[0] || ""));
}

function toHost(url) {
  if (String(url).includes("${")) return "";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(host)) return "";
    return host;
  } catch {
    return "";
  }
}

function main() {
  const files = TARGET_DIRS.flatMap(listJsFiles);
  const byHost = new Map();

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const urls = extractUrls(content);
    for (const url of urls) {
      const host = toHost(url);
      if (!host) continue;
      if (!byHost.has(host)) {
        byHost.set(host, new Set());
      }
      byHost.get(host).add(path.relative(ROOT, filePath));
    }
  }

  const hosts = Array.from(byHost.keys()).sort((a, b) => a.localeCompare(b));
  const csv = hosts.join(",");

  process.stdout.write("Provider hostnames (literal URLs found in source):\n");
  for (const host of hosts) {
    const refs = Array.from(byHost.get(host) || []).sort((a, b) => a.localeCompare(b));
    process.stdout.write(`- ${host} (${refs.join(", ")})\n`);
  }
  process.stdout.write("\nSuggested MEDIA_PROXY_ALLOWED_HOSTS CSV:\n");
  process.stdout.write(`${csv}\n`);
}

main();