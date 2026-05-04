import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, phone, isPremium } = body;

    if (!email || !phone || isPremium === undefined) {
      return NextResponse.json({ status: '8677' });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT user_index FROM T_USER_INFO WHERE email = ? AND phone = ? LIMIT 1',
      [email, phone]
    );

    if (rows.length === 0) {
      return NextResponse.json({ status: '8699' });
    }

    await pool.execute(
      'UPDATE T_USER_INFO SET tier = ? WHERE email = ?',
      [isPremium ? 1 : 0, email]
    );

    return NextResponse.json({ status: '8200' });
  } catch (error) {
    console.error('tier 업데이트 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
