/**
 * Live end-to-end check of the code runner for every supported language.
 * Network-dependent, so it is opt-in: RUN_LIVE=1 bunx vitest run src/lib/run-mode.live.test.ts
 */
import { describe, expect, it } from "vitest";
import { buildSqlShim } from "./exec-languages";

const live = process.env.RUN_LIVE === "1";

async function runOnCodex(language: string, code: string) {
  const res = await fetch("https://codex-api.fly.dev/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, language, input: "" }),
  });
  return (await res.json()) as { output?: string; error?: string };
}

const CASES: Array<[string, string, string, string]> = [
  ["Python", "py", 'print("hi")', "hi"],
  ["JavaScript", "js", 'console.log("hi")', "hi"],
  ["C", "c", '#include <stdio.h>\nint main(){printf("hi");}', "hi"],
  ["C++", "cpp", '#include <iostream>\nint main(){std::cout<<"hi";}', "hi"],
  ["Java", "java", 'public class Main{public static void main(String[] a){System.out.println("hi");}}', "hi"],
  ["C#", "cs", 'using System;class P{static void Main(){Console.WriteLine("hi");}}', "hi"],
  ["Go", "go", 'package main\nimport "fmt"\nfunc main(){fmt.Println("hi")}', "hi"],
  ["SQL", "py", buildSqlShim("SELECT 'hi' AS greeting;"), "hi"],
];

describe.runIf(live)("Run mode live execution", () => {
  it.each(CASES)("runs %s", async (_label, lang, code, expected) => {
    const out = await runOnCodex(lang, code);
    expect(`${out.output ?? ""}`).toContain(expected);
    expect(out.error ?? "").toBe("");
  }, 60_000);
});