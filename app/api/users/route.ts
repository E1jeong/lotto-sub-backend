import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'email이 필요합니다.' }, { status: 400 });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM T_USER_INFO WHERE email = ? LIMIT 1',
      [email]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 });
    }

    const u = rows[0];
    return NextResponse.json({
      userIndex: u.user_index,
      email: u.email,
      name: u.name,
      birth: u.birth,
      phone: u.phone,
      tier: u.tier === 1,
      validDate: u.valid_date,
      validCount: u.valid_count,
      address: u.address,
      fcmToken: u.fcm_token,
      createdAt: u.created_at,
    });
  } catch (error) {
    console.error('유저 조회 에러:', error);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}
