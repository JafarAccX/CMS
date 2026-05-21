import {
  TransactionalEmailsApi,
  TransactionalEmailsApiApiKeys,
  SendSmtpEmail,
  SendSmtpEmailSender,
  SendSmtpEmailToInner,
} from "@getbrevo/brevo";

class EmailService {
  private api: TransactionalEmailsApi;
  private defaultSenderEmail: string;
  private defaultSenderName: string;

  constructor() {
    this.api = new TransactionalEmailsApi();
    const apiKey = process.env.BREVO_API_KEY;
    if (apiKey) {
      this.api.setApiKey(TransactionalEmailsApiApiKeys.apiKey, apiKey);
    }
    this.defaultSenderEmail = process.env.EMAIL_SENDER ?? "info@acceleratorx.org";
    this.defaultSenderName = process.env.EMAIL_SENDER_NAME ?? "AcceleratorX";
  }

  async sendEmail(opts: {
    to: string;
    toName?: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
  }): Promise<void> {
    if (!process.env.BREVO_API_KEY) {
      console.warn(`[EMAIL] BREVO_API_KEY not set — skipping send to ${opts.to}`);
      return;
    }

    const sendSmtpEmail = new SendSmtpEmail();
    const sender: SendSmtpEmailSender = {
      email: this.defaultSenderEmail,
      name: this.defaultSenderName,
    };
    sendSmtpEmail.sender = sender;
    const tos: SendSmtpEmailToInner[] = [{ email: opts.to, name: opts.toName }];
    sendSmtpEmail.to = tos;
    sendSmtpEmail.subject = opts.subject;
    sendSmtpEmail.htmlContent = opts.htmlContent;
    if (opts.textContent) sendSmtpEmail.textContent = opts.textContent;

    await this.api.sendTransacEmail(sendSmtpEmail);
  }
}

export const emailService = new EmailService();

export async function sendOtpEmail(toEmail: string, otp: string): Promise<void> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0d1017; color: #e2e8f0; border-radius: 12px;">
      <div style="margin-bottom: 24px;">
        <span style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">AcceleratorX</span>
      </div>
      <h1 style="font-size: 22px; font-weight: 600; color: #ffffff; margin: 0 0 8px;">Your login OTP</h1>
      <p style="color: #94a3b8; font-size: 14px; margin: 0 0 28px; line-height: 1.6;">
        Use the code below to sign in to your AcceleratorX learning account. It expires in 5 minutes.
      </p>
      <div style="background: #1a2234; border: 1px solid #2d3748; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 28px;">
        <span style="font-family: 'SF Mono', 'Fira Code', monospace; font-size: 36px; font-weight: 700; letter-spacing: 0.4em; color: #6b8fff;">${otp}</span>
      </div>
      <p style="color: #64748b; font-size: 12px; margin: 0; line-height: 1.6;">
        If you didn't request this, you can safely ignore this email.<br>
        Do not share this code with anyone.
      </p>
    </div>
  `;

  await emailService.sendEmail({
    to: toEmail,
    subject: "Your AcceleratorX login code",
    htmlContent: html,
    textContent: `Your AcceleratorX login OTP is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
  });
}
