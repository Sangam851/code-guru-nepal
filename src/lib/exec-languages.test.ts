import { describe, expect, it } from "vitest";
import {
  buildSqlShim,
  isRunnableLanguage,
  SUPPORTED_RUN_LANGUAGES,
  unsupportedLanguageMessage,
} from "./exec-languages";

const RUNNABLE = [
  "python", "py", "javascript", "js", "typescript", "ts",
  "c", "cpp", "c++", "java", "csharp", "c#", "go", "sql", "sqlite",
];

describe("Run mode language support", () => {
  it.each(RUNNABLE)("supports %s", (lang) => {
    expect(isRunnableLanguage(lang)).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isRunnableLanguage(" Python ")).toBe(true);
    expect(isRunnableLanguage("C++")).toBe(true);
  });

  it.each(["rust", "swift", "kotlin", "php", "ruby", "cobol", ""])(
    "rejects unsupported language %s",
    (lang) => {
      expect(isRunnableLanguage(lang)).toBe(false);
    },
  );

  it("names every supported language in the unsupported error", () => {
    const msg = unsupportedLanguageMessage("rust");
    expect(msg).toContain('"rust"');
    for (const l of SUPPORTED_RUN_LANGUAGES) expect(msg).toContain(l);
  });
});

describe("SQL shim", () => {
  it("embeds the SQL safely and prints result tables", () => {
    const shim = buildSqlShim("SELECT 'it\"s' AS a;");
    expect(shim).toContain("import sqlite3");
    expect(shim).toContain(JSON.stringify("SELECT 'it\"s' AS a;"));
    expect(shim).not.toMatch(/\n\s*SELECT/);
  });
});