import { GmailService } from "../service/gmail";

const OWNER_EMAIL = "guilherme.benevides@econverse.com.br";
const SENDER = "tech@econverse.com.br";

/**
 * Moves access-code emails from tech@econverse.com.br to trash.
 * Runs every hour — only processes emails received in the last hour.
 */
export async function cleanAccessCodeEmails(): Promise<void> {
  const afterTs = Math.floor(Date.now() / 1000) - 3600;
  const query = `from:${SENDER} AND (subject:"Seu código de acesso é" OR subject:"Your access code is") AND after:${afterTs}`;

  const emails = await GmailService.search(OWNER_EMAIL, query);
  if (emails.length === 0) return;

  await Promise.all(
    emails.map((email) => GmailService.trash(OWNER_EMAIL, email.id)),
  );
}