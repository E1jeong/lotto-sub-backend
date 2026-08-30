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
import { requestInitialExpectNumberIssuance } from '@/lib/mainServer';

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
    } catch (error) {
      releaseRegistrationProof(proofHash);
      throw error;
    }

    // 회원가입 성공 직후 무료 사용자에 대한 초기 예상번호(10개) 발급을 위해 main-server 1022를 호출한다.
    // 메인 서버는 DB에 값을 쓰지 않고 무료 번호만 발급하며, 호출 실패가 가입 성공 응답을 실패로 덮어써서는 안 된다.
    try {
      await requestInitialExpectNumberIssuance({ name, email, phone, birth });
    } catch (e) {
      console.error('main-server 회원가입 초기 예상번호 발급 오류 (회원가입에는 영향 없음):', e);
    }

    return NextResponse.json({ status: '8200' });
  } catch (error) {
    console.error('유저 등록 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
