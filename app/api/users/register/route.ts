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

    // T_USER_INFO는 이미 이 라우트가 저장했으며, 1022의 남은 역할은 초기 무료 번호 할당이다.
    // 소유자 확인 계약상 메인 서버가 공유 T_EXPECT_PICK에 저장하지만 소스/런타임은 미검증이다.
    // 이 라우트는 번호를 저장하지 않으며 호출 실패를 가입 성공과 격리한다.
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
