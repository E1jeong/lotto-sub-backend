import { NextRequest, NextResponse } from 'next/server';
import {
  isValidEmail,
  normalizeEmail,
  verifyCode,
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
    || !('code' in body)
    || !isValidEmail(body.email)
    || typeof body.code !== 'string'
    || !/^\d{6}$/.test(body.code)
  ) {
    return NextResponse.json({ status: '8677' });
  }

  try {
    const result = verifyCode(normalizeEmail(body.email), body.code);
    if (result.status === 'attempts_exceeded') {
      return NextResponse.json({ status: '8702' });
    }
    if (result.status === 'invalid') {
      return NextResponse.json({ status: '8701' });
    }

    return NextResponse.json({
      status: '8200',
      verificationToken: result.verificationToken,
    });
  } catch {
    console.error('이메일 인증코드 검증 실패');
    return NextResponse.json({ status: '8655' });
  }
}
