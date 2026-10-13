import nodemailer, { type Transporter } from "nodemailer";

export const emailEnabled = Boolean(process.env.SMTP_URL && process.env.EMAIL_FROM);

let transport: Transporter | null = null;

export async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!emailEnabled) throw new Error("Email is not configured (SMTP_URL, EMAIL_FROM)");
  transport ??= nodemailer.createTransport(process.env.SMTP_URL);
  await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject, html, text });
}
