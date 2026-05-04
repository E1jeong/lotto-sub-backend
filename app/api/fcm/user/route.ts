import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ResultSetHeader } from 'mysql2';

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'email이 필요합니다.' }, { status: 400 });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE T_USER_INFO SET fcm_token = NULL WHERE email = ?',
      [email]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: '해당 유저를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ message: 'FCM 토큰이 삭제되었습니다.' }, { status: 200 });
  } catch (error) {
    console.error('FCM 토큰 삭제 에러:', error);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}
