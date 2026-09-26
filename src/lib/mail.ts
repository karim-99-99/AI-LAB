import nodemailer from "nodemailer";

export type SendMailInput = {
  to: string;
  subject: string;
  body: string;
};

export function isGmailConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim()
  );
}

/**
 * Send via Gmail SMTP using an App Password
 * (Google Account → Security → 2-Step Verification → App passwords).
 */
export async function sendGmail(input: SendMailInput): Promise<{
  messageId: string;
  from: string;
}> {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim().replace(/\s+/g, "");

  if (!user || !pass) {
    throw new Error(
      "Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local"
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from: user,
    to: input.to,
    subject: input.subject || "(no subject)",
    text: input.body,
  });

  return { messageId: String(info.messageId ?? ""), from: user };
}
