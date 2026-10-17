const vault = "second-brain";

export function wroteJournal(when: string, date: string): string {
  return `Записал в журнал ${when}\n${obsidianFile(`Periodic/Daily/${date}`)}`;
}

export function savedClipping(noteName: string, problem?: string): string {
  const lines = [`Сохранил: ${noteName}`, obsidianFile(noteName)];
  if (problem) lines.push(problem);
  return lines.join("\n");
}

export function alreadySaved(noteName: string): string {
  return `Уже было: ${noteName}\n${obsidianFile(noteName)}`;
}

export function summary(...blocks: string[]): string {
  return blocks.join("\n\n");
}

function obsidianFile(file: string): string {
  return `obsidian://open?vault=${vault}&file=${encodeURIComponent(file)}`;
}
