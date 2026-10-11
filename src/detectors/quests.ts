export const questNotice = /^(?:quest (?:started|accepted|completed|failed|updated)|(?:you have )?(?:completed|accepted|failed) (?:the |a )?quest)\b[^\n]{0,160}$/i;
export const questField = /^(?:quest(?: name| difficulty)?|rewards?|penalt(?:y|ies)|objectives?)\s*:\s*\S.{0,180}$/i;
export function detectQuest(lines: string[]): boolean {
  return lines.length > 0 && lines.every(line => questNotice.test(line) || questField.test(line));
}
