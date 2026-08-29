import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';
import {
  claimRegistrationProof,
  consumeRegistrationProof,
  isValidEmail,
  normalizeEmail,
  releaseRegistrationProof,
} from '@/lib/verificationStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email: rawEmail, birth, phone, verificationToken } = body;

    if (!name || !phone || !isValidEmail(rawEmail)) {
      return NextResponse.json({ status: '8677' });
    }

    const email = normalizeEmail(rawEmail);
    const proofHash = claimRegistrationProof(email, verificationToken);
    if (!proofHash) {
      return NextResponse.json({ status: '8703' });
    }

    try {
      const [byEmail] = await pool.execute<RowDataPacket[]>(
        'SELECT user_index FROM T_USER_INFO WHERE email = ? LIMIT 1',
        [email]
      );
      if (byEmail.length > 0) {
        releaseRegistrationProof(proofHash);
        return NextResponse.json({ status: '8611' });
      }

      const [byPhone] = await pool.execute<RowDataPacket[]>(
        'SELECT user_index FROM T_USER_INFO WHERE phone = ? LIMIT 1',
        [phone]
      );
      if (byPhone.length > 0) {
        releaseRegistrationProof(proofHash);
        return NextResponse.json({ status: '8633' });
      }

      await pool.execute(
        'INSERT INTO T_USER_INFO (email, name, phone, birth) VALUES (?, ?, ?, ?)',
        [email, name, phone, birth ?? null]
      );

      consumeRegistrationProof(proofHash);
      return NextResponse.json({ status: '8200' });
    } catch (error) {
      releaseRegistrationProof(proofHash);
      throw error;
    }
  } catch (error) {
    console.error('유저 등록 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
