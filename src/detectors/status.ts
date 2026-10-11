export const statusLine = /^(?:strength|agility|intelligence|dexterity|stamina|hp|mp|level|experience|attack|defense)\s*:\s*[+\-]?\d[\d, ./%+\-]*(?:\s*\([^\n]{1,50}\))?\s*$/i;
export function detectStatus(lines: string[]): boolean {
  return lines.length > 0 && lines.every(line => statusLine.test(line));
}
