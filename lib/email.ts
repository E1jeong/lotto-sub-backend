import nodemailer from 'nodemailer';

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const secure = process.env.SMTP_SECURE;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromName = process.env.SMTP_FROM_NAME;

  if (
    !host
    || !Number.isInteger(port)
    || port < 1
    || port > 65535
    || (secure !== 'true' && secure !== 'false')
    || !user
    || !pass
    || !fromName
  ) {
    throw new Error('SMTP configuration is incomplete');
  }

  return {
    host,
    port,
    secure: secure === 'true',
    auth: { user, pass },
    from: `"${fromName}" <${user}>`,
  };
}

export async function sendVerificationEmail(email: string, code: string) {
  const config = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  await transporter.sendMail({
    from: config.from,
    to: email,
    subject: '[어부로또] 이메일 인증코드',
    text: `어부로또 이메일 인증코드는 ${code}입니다. 인증코드는 5분 동안 유효합니다.`,
    html: `<p>어부로또 이메일 인증코드는 <strong>${code}</strong>입니다.</p><p>인증코드는 5분 동안 유효합니다.</p>`,
  });
}
