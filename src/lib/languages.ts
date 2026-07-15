export type LanguageOption = {
  id: string;
  label: string;
  emoji: string;
  starter: string;
};

export const LANGUAGES: LanguageOption[] = [
  { id: "python", label: "Python", emoji: "🐍", starter: 'print("Namaste, Nepal!")' },
  { id: "javascript", label: "JavaScript", emoji: "⚡", starter: 'console.log("Namaste, Nepal!");' },
  { id: "typescript", label: "TypeScript", emoji: "🔷", starter: 'const msg: string = "Namaste";' },
  { id: "c", label: "C", emoji: "🅲", starter: '#include <stdio.h>\nint main(){ printf("Namaste"); }' },
  { id: "cpp", label: "C++", emoji: "➕", starter: '#include <iostream>\nint main(){ std::cout << "Namaste"; }' },
  { id: "csharp", label: "C#", emoji: "🎯", starter: 'Console.WriteLine("Namaste");' },
  { id: "java", label: "Java", emoji: "☕", starter: 'System.out.println("Namaste");' },
  { id: "sql", label: "SQL", emoji: "🗄️", starter: "SELECT 'Namaste' AS greeting;" },
  { id: "go", label: "Go", emoji: "🐹", starter: 'fmt.Println("Namaste")' },
  { id: "rust", label: "Rust", emoji: "🦀", starter: 'println!("Namaste");' },
  { id: "php", label: "PHP", emoji: "🐘", starter: '<?php echo "Namaste"; ?>' },
  { id: "ruby", label: "Ruby", emoji: "💎", starter: 'puts "Namaste"' },
  { id: "kotlin", label: "Kotlin", emoji: "🟪", starter: 'println("Namaste")' },
  { id: "swift", label: "Swift", emoji: "🕊️", starter: 'print("Namaste")' },
  { id: "html", label: "HTML/CSS", emoji: "🎨", starter: "<h1>Namaste</h1>" },
  { id: "bash", label: "Bash", emoji: "💻", starter: 'echo "Namaste"' },
];

export function findLanguage(id: string) {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
}