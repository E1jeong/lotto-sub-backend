import { NextResponse } from 'next/server';
import pool from '@/lib/db';

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
    await pool.execute(
      'UPDATE T_USER_INFO SET fcm_token = ? WHERE email = ?',
      [fcmToken, email]
    );

    return NextResponse.json({ message: '토큰이 성공적으로 저장되었습니다.' }, { status: 200 });
  } catch (error) {
    console.error('토큰 저장 에러:', error);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}
