import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { contentIssues, sensitivePath } from "../scripts/check-secrets";

describe("portfolio secret checks", () => {
  it("blocks environment files and credential/private paths but permits the template", () => {
    for (const path of [
      ".env.local",
      "nested/.env.production",
      "private/contract.pdf",
      "credentials.json",
      "cert.pem",
      "debug.har",
      ".aws/config",
      "evaluation-results/run.json",
    ])
      expect(sensitivePath(path)).toBe(true);
    for (const path of [
      ".env.example",
      "docs/start-preview.png",
      "public/examples/Fjordlogistikk_Kundeavtale.txt",
    ])
      expect(sensitivePath(path)).toBe(false);
  });
  it("detects a local secret even in binary content without returning its value", () => {
    const secret = ["synthetic", "secret", "fixture"].join("-");
    const result = contentIssues(
      Buffer.concat([Buffer.from([0]), Buffer.from(secret)]),
      [secret],
    );
    expect(result).toEqual(["local environment secret"]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
  it("detects Google and GitHub token shapes without real credentials", () => {
    expect(contentIssues(Buffer.from("AIza" + "a".repeat(35)))).toContain(
      "Google API key",
    );
    expect(contentIssues(Buffer.from("ghp_" + "a".repeat(36)))).toContain(
      "GitHub token",
    );
    expect(
      contentIssues(
        Buffer.from("GEMINI_API_KEY=\nGEMINI_MODEL=gemini-3.8-flash"),
      ),
    ).toEqual([]);
  });
  it("detects private keys and credential JSON", () => {
    expect(
      contentIssues(Buffer.from(["-----BEGIN", "PRIVATE KEY-----"].join(" "))),
    ).toContain("private key");
    expect(
      contentIssues(
        Buffer.from(JSON.stringify({ refresh_token: "synthetic".repeat(4) })),
      ),
    ).toContain("credential JSON");
  });

  it("fails on a staged secret and on an unreachable historical blob without exposing the value", () => {
    const directory = mkdtempSync(join(tmpdir(), "handover-secret-check-"));
    const script = resolve("scripts/check-secrets.ts");
    const loader = createRequire(import.meta.url).resolve("tsx");
    const secret = "AIza" + "z".repeat(35);
    const scan = () =>
      spawnSync(process.execPath, ["--import", loader, script], {
        cwd: directory,
        encoding: "utf8",
      });
    try {
      execFileSync("git", ["init", "-q"], { cwd: directory });
      writeFileSync(join(directory, "candidate.txt"), secret);
      execFileSync("git", ["add", "candidate.txt"], { cwd: directory });
      writeFileSync(
        join(directory, "candidate.txt"),
        "Safe synthetic example.",
      );
      const staged = scan();
      expect(staged.status).toBe(1);
      expect(staged.stderr).toContain("Google API key");
      expect(staged.stderr + staged.stdout).not.toContain(secret);
      execFileSync("git", ["add", "candidate.txt"], { cwd: directory });
      const unreachable = scan();
      expect(unreachable.status).toBe(1);
      expect(unreachable.stderr).toContain("Git object");
      expect(unreachable.stderr + unreachable.stdout).not.toContain(secret);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
