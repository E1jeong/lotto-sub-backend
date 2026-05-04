import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, birth, phone } = body;

    if (!name || !email || !phone) {
      return NextResponse.json({ status: '8677' });
    }

    const [byEmail] = await pool.execute<RowDataPacket[]>(
      'SELECT user_index FROM T_USER_INFO WHERE email = ? LIMIT 1',
      [email]
    );
    if (byEmail.length > 0) {
      return NextResponse.json({ status: '8611' });
    }

    const [byPhone] = await pool.execute<RowDataPacket[]>(
      'SELECT user_index FROM T_USER_INFO WHERE phone = ? LIMIT 1',
      [phone]
    );
    if (byPhone.length > 0) {
      return NextResponse.json({ status: '8633' });
    }

    await pool.execute(
      'INSERT INTO T_USER_INFO (email, name, phone, birth) VALUES (?, ?, ?, ?)',
      [email, name, phone, birth ?? null]
    );

    return NextResponse.json({ status: '8200' });
  } catch (error) {
    console.error('유저 등록 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
