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
