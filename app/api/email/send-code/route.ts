import { NextRequest, NextResponse } from 'next/server';
import { sendVerificationEmail } from '@/lib/email';
import {
  finishSend,
  generateVerificationCode,
  isValidEmail,
  isVerificationPurpose,
  normalizeEmail,
  reserveSend,
  storeVerificationCode,
} from '@/lib/verificationStore';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: '8677' });
  }

  if (
    !body
    || typeof body !== 'object'
    || !('email' in body)
    || !('purpose' in body)
    || !isValidEmail(body.email)
    || !isVerificationPurpose(body.purpose)
  ) {
    return NextResponse.json({ status: '8677' });
  }

  const email = normalizeEmail(body.email);
  if (!reserveSend(email)) {
    return NextResponse.json({ status: '8700' });
  }

  try {
    const code = generateVerificationCode();
    await sendVerificationEmail(email, code);
    storeVerificationCode(email, code, body.purpose);
    return NextResponse.json({ status: '8200' });
  } catch {
    console.error('이메일 인증 메일 발송 실패');
    return NextResponse.json({ status: '8655' });
  } finally {
    finishSend(email);
  }
}
