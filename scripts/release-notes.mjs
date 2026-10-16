import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function normalizeVersion(value) {
  const version = String(value).replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)) {
    throw new Error(`Invalid release version: ${value}`);
  }
  return version;
}

export function localizedNotes(source, language) {
  const heading = language === "en" ? "English" : "简体中文";
  const section = source.match(
    new RegExp(`^## ${heading}\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m"),
  );
  if (!section?.[1].trim()) {
    throw new Error(`Missing ${heading} release notes`);
  }
  return section[1].trim();
}

export function syncSection(readme, language, version, notes) {
  const start = `<!-- release:${language}:start -->`,
    end = `<!-- release:${language}:end -->`;
  if (readme.split(start).length !== 2 || readme.split(end).length !== 2) {
    throw new Error(
      `README must contain exactly one ${language} release block`,
    );
  }
  const from = readme.indexOf(start),
    to = readme.indexOf(end);
  if (to < from) {
    throw new Error("Release markers are reversed");
  }
  const title =
    language === "en" ? `## What's new in v${version}` : `## v${version} 更新`;
  return (
    readme.slice(0, from) +
    `${start}\n${title}\n\n${notes}\n${end}` +
    readme.slice(to + end.length)
  );
}

export function releaseFiles(root, requested) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const version = normalizeVersion(requested ?? pkg.version);
  if (version !== pkg.version) {
    throw new Error(
      `Release ${version} does not match package.json ${pkg.version}`,
    );
  }
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
  );
  if (lock.version !== version || lock.packages?.[""]?.version !== version) {
    throw new Error(
      "package-lock.json root versions do not match package.json",
    );
  }
  const notes = fs.readFileSync(
    path.join(root, "doc/releases", `${version}.md`),
    "utf8",
  );
  if (!notes.startsWith(`# EAR Audio Preview v${version}\n`)) {
    throw new Error("Release note title/version mismatch");
  }
  return {
    version,
    notes,
    en: localizedNotes(notes, "en"),
    zh: localizedNotes(notes, "zh"),
  };
}

function main() {
  const args = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const data = releaseFiles(root, process.env.RELEASE_VERSION || undefined);
  for (const [language, filename] of [
    ["en", "README.md"],
    ["zh", "README.zh-CN.md"],
  ]) {
    const original = fs.readFileSync(path.join(root, filename), "utf8");
    const updated = syncSection(
      original,
      language,
      data.version,
      data[language],
    );
    if (args.includes("--write")) {
      fs.writeFileSync(path.join(root, filename), updated);
    } else if (original !== updated) {
      throw new Error(
        `${filename} release block is stale; run npm run docs:sync`,
      );
    }
  }
  const output = args.indexOf("--output");
  if (output >= 0) {
    if (!args[output + 1]) {
      throw new Error("Missing output path");
    }
    const target = path.resolve(root, args[output + 1]);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data.notes);
  }
  console.log(`Release notes and bilingual READMEs match v${data.version}`);
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
