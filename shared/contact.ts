/**
 * The contact form (/contact, POST /api/contact): what a message may hold,
 * checked by Nuxt and again by the hook that keeps it
 * (pb_hooks/contact.pb.js, as lib/gen/contact.js). Messages go to whoever
 * runs Cheddar: kept in `contact_messages` (read in PocketBase's admin UI,
 * deleted after KEEP_DAYS) and emailed to CONTACT_TO when that's set.
 */

export const TOPICS = [
  { id: "question", label: "A question" },
  { id: "privacy", label: "Privacy or my data" },
  { id: "security", label: "A security problem" },
  { id: "other", label: "Something else" },
] as const;

export type Topic = (typeof TOPICS)[number]["id"];

export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const MESSAGE_MAX = 5000;
/** How long a message is kept. The Privacy Notice says so. */
export const KEEP_DAYS = 365;

export interface ContactMessage {
  name: string;
  email: string;
  topic: Topic;
  message: string;
}

export function isTopic(value: unknown): value is Topic {
  return TOPICS.some((t) => t.id === value);
}

export function topicLabel(topic: string): string {
  return TOPICS.find((t) => t.id === topic)?.label ?? topic;
}

// Enough to catch a typo; the address is only ever replied to by a person.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The message, trimmed, or the first problem as something to show. */
export function checkContact(input: Record<string, unknown>): { ok: ContactMessage } | { problem: string } {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = text(input.name);
  const email = text(input.email);
  const message = text(input.message);
  if (name.length > NAME_MAX) return { problem: `Your name can be at most ${NAME_MAX} characters.` };
  if (!email || email.length > EMAIL_MAX || !EMAIL.test(email)) return { problem: "Enter the email address to reply to." };
  if (!isTopic(input.topic)) return { problem: "Choose what it's about." };
  if (!message) return { problem: "Write your message." };
  if (message.length > MESSAGE_MAX) return { problem: `A message can be at most ${MESSAGE_MAX} characters.` };
  return { ok: { name, email, topic: input.topic, message } };
}
