export const skillNotice = /^(?:skill (?:acquired|level(?:ed)? up|learned)|(?:you have )?(?:acquired|learned) (?:a |the |a new )?skill)\b[^\n]{0,160}$/i;
const skillField = /^(?:skill(?: name| level| type)?|passive skills?|active skills?|cooldowns?|mana costs?)\s*:\s*\S.{0,180}$/i;
export function detectSkill(lines: string[]): boolean {
  return lines.length > 0 && lines.every(line => skillNotice.test(line) || skillField.test(line));
}
