import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, phone } = body;

    if (!email || !phone) {
      return NextResponse.json({ status: '8677' });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM T_USER_INFO WHERE email = ? AND phone = ? LIMIT 1',
      [email, phone]
    );

    if (rows.length === 0) {
      return NextResponse.json({ status: '8699' });
    }

    const u = rows[0];
    return NextResponse.json({
      status: '8200',
      userIndex: u.user_index,
      email: u.email,
      name: u.name,
      birth: u.birth,
      phone: u.phone,
      tier: u.tier === 1,
      validDate: u.valid_date,
    });
  } catch (error) {
    console.error('로그인 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
