import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import pool from '@/lib/db';
import {
  claimRecoveryProof,
  consumeRecoveryProof,
  isValidEmail,
  normalizeEmail,
  releaseRecoveryProof,
} from '@/lib/verificationStore';

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
    || !('phone' in body)
    || !('verificationToken' in body)
    || !isValidEmail(body.email)
    || typeof body.phone !== 'string'
    || body.phone.trim().length === 0
  ) {
    return NextResponse.json({ status: '8677' });
  }

  const email = normalizeEmail(body.email);
  const phone = body.phone.trim();
  const proofHash = claimRecoveryProof(email, body.verificationToken);
  if (!proofHash) {
    return NextResponse.json({ status: '8703' });
  }

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT name, email, birth, phone, tier
       FROM T_USER_INFO
       WHERE email = ? AND phone = ?
       LIMIT 1`,
      [email, phone]
    );

    if (rows.length === 0) {
      releaseRecoveryProof(proofHash);
      return NextResponse.json({ status: '8699' });
    }

    const user = rows[0];
    consumeRecoveryProof(proofHash);
    return NextResponse.json({
      status: '8200',
      name: user.name,
      email: user.email,
      birth: user.birth ?? '',
      phone: user.phone,
      tier: Number(user.tier) === 1 ? 'PREMIUM' : 'FREE',
    });
  } catch (error) {
    releaseRecoveryProof(proofHash);
    console.error('계정 복구 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
