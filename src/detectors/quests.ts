/**
 * Quest notifications.
 *
 * Examples:
 * Quest Started!
 * You have completed the quest.
 */
export const questNotice =
  /^(?:quest (?:started|accepted|completed|failed|updated)|(?:you have )?(?:completed|accepted|failed) (?:the |a )?quest)\b[^\n]{0,160}$/i;

/**
 * Structured quest fields.
 *
 * Examples:
 * Difficulty: Repeated quest
 * Quest Clear Conditions: Help 5,000 people
 * Quest Clear Rewards: Political Power
 * Quest Reward: Item
 */
export const questField =
  /^(?:quest(?: name| difficulty| clear conditions?| clear rewards?| rewards?| objectives?| conditions?)?|difficulty|rewards?|penalt(?:y|ies)|objectives?)\s*:\s*\S.{0,300}$/i;

/**
 * Returns true for an explicit quest field.
 */
export function isQuestField(text: string): boolean {
  return questField.test(text.trim());
}

/**
 * Recognizes quest-specific fields that strongly indicate
 * a structured quest block.
 */
export function isQuestAnchor(text: string): boolean {
  return /^(?:difficulty|quest (?:clear conditions?|clear rewards?|rewards?|objectives?|conditions?))\s*:\s*\S/i.test(
    text.trim(),
  );
}

/**
 * Checks whether a paragraph can be part of a quest
 * description after a quest has been identified.
 */
export function isQuestDescription(text: string): boolean {
  const raw = text.trim();

  if (!raw || raw.length > 600) {
    return false;
  }

  // Never absorb SYSTEM notifications.
  if (raw.startsWith('[') || raw.endsWith(']')) {
    return false;
  }

  // Dialogue and thoughts terminate the quest block.
  if (/^["'“‘]/.test(raw)) {
    return false;
  }

  // Scene separators terminate the quest block.
  if (/^(?:\*{3,}|-{3,})$/.test(raw)) {
    return false;
  }

  // Structured fields are processed separately.
  if (/^[\w\s-]{2,40}\s*:/.test(raw)) {
    return false;
  }

  return true;
}

/**
 * Optional quest notes.
 *
 * Example:
 * * It counts if other members of the royal family help.
 */
export function isQuestNote(text: string): boolean {
  return /^\*\s+\S.{0,400}$/.test(text.trim());
}

/**
 * Independent quest classification.
 *
 * Contextual grouping is handled separately by dom.ts.
 */
export function detectQuest(lines: string[]): boolean {
  return (
    lines.length > 0 &&
    lines.every((line) => questNotice.test(line) || questField.test(line))
  );
}
