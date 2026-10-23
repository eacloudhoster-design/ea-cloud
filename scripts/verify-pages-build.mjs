import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Both supported Pages build commands must publish these independent bundles.
// Reject a partial deployment before Cloudflare can publish a successful build.
export function verifyPagesBuild(output) {
  const applications = {};
  for (const [name, entry, title, prefix] of [
    ["website", "/index.html", "EA Cloud", "/assets/"],
    ["tradingApp", "/ea-app/index.html", "EA Cloud App", "/ea-app/assets/"],
  ]) {
    const htmlPath = join(output, entry);
    if (!existsSync(htmlPath)) throw new Error(`Incomplete Pages build: missing ${entry}`);
    const html = readFileSync(htmlPath, "utf8");
    if (!html.includes(`<title>${title}</title>`)) {
      throw new Error(`Incorrect application entry at ${entry}`);
    }
    if (name === "tradingApp") {
      const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => match[0]);
      const content = name => {
        const tag = metas.find(tag => new RegExp(`\\bname\\s*=\\s*(["'])${name}\\1`, "i").test(tag));
        return tag?.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2] || "";
      };
      for (const [setting, valid] of [
        ["viewport-fit=cover", /\bviewport-fit\s*=\s*cover\b/i.test(content("viewport"))],
        ["apple-mobile-web-app-capable=yes", content("apple-mobile-web-app-capable").toLowerCase() === "yes"],
        ["apple-mobile-web-app-status-bar-style=black-translucent", content("apple-mobile-web-app-status-bar-style").toLowerCase() === "black-translucent"],
      ]) {
        if (!valid) throw new Error(`Missing iOS edge-to-edge configuration in ${entry}: ${setting}`);
      }
    }
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
    const styles = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"/g)].map((match) => match[1]);
    if (!scripts.length || !styles.length) throw new Error(`Missing production JS/CSS in ${entry}`);
    for (const asset of [...scripts, ...styles]) {
      if (!asset.startsWith(prefix) || !existsSync(join(output, asset))) {
        throw new Error(`Missing or incorrectly based production asset in ${entry}: ${asset}`);
      }
    }
    applications[name] = {
      entry,
      scripts,
      styles,
      htmlSha256: createHash("sha256").update(html).digest("hex"),
    };
  }
  return applications;
}
