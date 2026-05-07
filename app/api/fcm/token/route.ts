import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ResultSetHeader } from 'mysql2';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, fcmToken } = body;

    if (!email || !fcmToken) {
      return NextResponse.json({ error: 'email와 fcmToken이 필요합니다.' }, { status: 400 });
    }

    // 동일 토큰을 가진 다른 유저 NULL 처리 (기기 재사용 대응)
    await pool.execute(
      'UPDATE T_USER_INFO SET fcm_token = NULL WHERE fcm_token = ? AND email != ?',
      [fcmToken, email]
    );

    // 해당 유저의 토큰 저장
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE T_USER_INFO SET fcm_token = ? WHERE email = ?',
      [fcmToken, email]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: '해당 이메일의 유저를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ message: '토큰이 성공적으로 저장되었습니다.' }, { status: 200 });
  } catch (error) {
    console.error('토큰 저장 에러:', error);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}
