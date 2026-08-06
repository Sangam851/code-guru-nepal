// Shared (client + server safe) knowledge about which languages Run mode
// supports and how each one is dispatched. Kept pure so it can be unit tested.

export type PistonConfig = { language: string; version: string; filename: string };

export const PISTON_LANG: Record<string, PistonConfig> = {
  python: { language: "python", version: "3.10.0", filename: "main.py" },
  py: { language: "python", version: "3.10.0", filename: "main.py" },
  javascript: { language: "javascript", version: "18.15.0", filename: "main.js" },
  js: { language: "javascript", version: "18.15.0", filename: "main.js" },
  typescript: { language: "typescript", version: "5.0.3", filename: "main.ts" },
  ts: { language: "typescript", version: "5.0.3", filename: "main.ts" },
  java: { language: "java", version: "15.0.2", filename: "Main.java" },
  c: { language: "c", version: "10.2.0", filename: "main.c" },
  cpp: { language: "c++", version: "10.2.0", filename: "main.cpp" },
  "c++": { language: "c++", version: "10.2.0", filename: "main.cpp" },
  csharp: { language: "csharp.net", version: "5.0.201", filename: "main.cs" },
  "c#": { language: "csharp.net", version: "5.0.201", filename: "main.cs" },
  go: { language: "go", version: "1.16.2", filename: "main.go" },
  rust: { language: "rust", version: "1.68.2", filename: "main.rs" },
  ruby: { language: "ruby", version: "3.0.1", filename: "main.rb" },
  php: { language: "php", version: "8.2.3", filename: "main.php" },
  swift: { language: "swift", version: "5.3.3", filename: "main.swift" },
  kotlin: { language: "kotlin", version: "1.8.20", filename: "main.kt" },
  bash: { language: "bash", version: "5.2.0", filename: "main.sh" },
  sh: { language: "bash", version: "5.2.0", filename: "main.sh" },
  sql: { language: "sqlite3", version: "3.36.0", filename: "main.sql" },
};

/** Languages the primary runner (CodeX) executes natively. */
export const CODEX_LANG: Record<string, string> = {
  python: "py", py: "py",
  javascript: "js", js: "js",
  typescript: "js", ts: "js",
  java: "java",
  c: "c",
  cpp: "cpp", "c++": "cpp",
  csharp: "cs", "c#": "cs",
  go: "go",
};

/** SQL runs through an SQLite shim executed on the Python runner. */
export const SQL_ALIASES = new Set(["sql", "sqlite", "sqlite3"]);

export const SUPPORTED_RUN_LANGUAGES = [
  "Python",
  "JavaScript",
  "TypeScript",
  "C",
  "C++",
  "Java",
  "C#",
  "Go",
  "SQL",
] as const;

export function normalizeLang(language: string): string {
  return language.trim().toLowerCase();
}

/** True when Run mode can actually execute this language server-side. */
export function isRunnableLanguage(language: string): boolean {
  const lang = normalizeLang(language);
  return SQL_ALIASES.has(lang) || Boolean(CODEX_LANG[lang]);
}

export function unsupportedLanguageMessage(language: string): string {
  return `Language "${language}" can't be executed here. Supported: ${SUPPORTED_RUN_LANGUAGES.join(", ")}.`;
}

export function runnerUnavailableMessage(): string {
  return "Code execution service is unavailable right now. Please try again shortly.";
}

/**
 * Wrap raw SQL in a self-contained Python/SQLite program so it can run on the
 * Python runner and print a readable result table.
 */
export function buildSqlShim(sql: string): string {
  return [
    `SQL_TEXT = ${JSON.stringify(sql)}`,
    "import sqlite3",
    'con = sqlite3.connect(":memory:")',
    "cur = con.cursor()",
    'for stmt in [s.strip() for s in SQL_TEXT.split(";") if s.strip()]:',
    "    cur.execute(stmt)",
    "    if cur.description:",
    "        cols = [d[0] for d in cur.description]",
    "        rows = cur.fetchall()",
    '        print(" | ".join(cols))',
    '        print("-" * 40)',
    "        for r in rows:",
    '            print(" | ".join("NULL" if v is None else str(v) for v in r))',
    '        print("(%d row(s))" % len(rows))',
    "    else:",
    '        print("OK: %d row(s) affected" % cur.rowcount)',
    "con.commit()",
  ].join("\n");
}