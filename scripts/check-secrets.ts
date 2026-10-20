import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Conservative checks, not a proof that arbitrary content is non-confidential.
export function sensitivePath(path: string) {
  const name = path.split("/").at(-1) ?? path;
  return (
    (name.startsWith(".env") && name !== ".env.example") ||
    /\.(pem|key|p12|pfx|jks|har|log)$/i.test(name) ||
    /^(credentials|service-account).*\.json$/i.test(name) ||
    /(^|\/)(private|confidential|uploads|local-data|evaluation-results|\.aws|\.ssh|\.codex|\.agents)(\/|$)/.test(
      path,
    ) ||
    [".npmrc", ".netrc"].includes(name)
  );
}

export function contentIssues(data: Buffer, localSecrets: string[] = []) {
  const issues = new Set<string>();
  if (localSecrets.some((secret) => data.includes(Buffer.from(secret))))
    issues.add("local environment secret");
  // Detect known token formats without ever printing matched values.
  const text = data.toString("utf8");
  if (/AIza[0-9A-Za-z_-]{35}/.test(text)) issues.add("Google API key");
  if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/.test(text))
    issues.add("GitHub token");
  if (/AKIA[0-9A-Z]{16}/.test(text)) issues.add("AWS access key");
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(
      text,
    )
  )
    issues.add("private key");
  if (
    /["'](?:private_key|client_secret|refresh_token)["']\s*:\s*["'][^"']{16,}["']/.test(
      text,
    )
  )
    issues.add("credential JSON");
  return [...issues];
}

function git(args: string[]) {
  return execFileSync("git", args, { maxBuffer: 128 * 1024 * 1024 });
}
function localEnvironmentSecrets() {
  const values = new Set<string>();
  for (const name of readdirSync(".")) {
    if (!name.startsWith(".env") || name === ".env.example") continue;
    const contents = readFileSync(name, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(
        /^\s*(?:export\s+)?([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*=\s*(.*?)\s*$/i,
      );
      const value = match?.[2]?.replace(/^(['"])(.*)\1$/, "$2");
      if (value && value.length >= 12) values.add(value);
    }
  }
  return [...values];
}

export function main() {
  git(["rev-parse", "--show-toplevel"]);
  const secrets = localEnvironmentSecrets();
  const issues: string[] = [];
  const files = [
    ...new Set(
      git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
        .toString("utf8")
        .split("\0")
        .filter(Boolean),
    ),
  ];
  for (const path of files) {
    if (sensitivePath(path))
      issues.push(`working tree: ${path}: sensitive path`);
    for (const issue of contentIssues(readFileSync(path), secrets))
      issues.push(`working tree: ${path}: ${issue}`);
  }
  // Inspect the entire local object database, including index blobs and unreachable
  // objects left by amended/deleted commits. Commit messages and tags are scanned too.
  const history = git(["rev-list", "--objects", "--all", "--reflog"])
    .toString("utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const line of history) {
    const space = line.indexOf(" ");
    if (space >= 0 && sensitivePath(line.slice(space + 1)))
      issues.push(
        `history ${line.slice(0, 12)}: ${line.slice(space + 1)}: sensitive path`,
      );
  }
  const objects = git([
    "cat-file",
    "--batch-all-objects",
    "--batch-check=%(objectname) %(objecttype)",
  ])
    .toString("utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
  let commits = 0;
  let scannedObjects = 0;
  for (const line of objects) {
    const [oid, type] = line.split(" ");
    if (type === "commit") commits++;
    if (!["blob", "commit", "tag"].includes(type)) continue;
    scannedObjects++;
    for (const issue of contentIssues(git(["cat-file", type, oid]), secrets))
      issues.push(`Git object ${oid.slice(0, 12)} (${type}): ${issue}`);
  }
  console.log(
    `Checked ${files.length} publishable files, ${commits} commits and ${scannedObjects} Git content objects (including staged and unreachable content).`,
  );
  if (issues.length) {
    console.error("Secret check failed. Values are deliberately redacted:");
    issues.forEach((issue) => console.error(issue));
    process.exitCode = 1;
  } else
    console.log(
      "No supported secret patterns, local environment secrets or sensitive paths detected. Manual confidentiality review is still required.",
    );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main();
  } catch {
    console.error(
      "Secret check could not complete. Check that Git is initialized and candidate files are readable. No secret values were printed.",
    );
    process.exitCode = 1;
  }
}
