import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { ResultSetHeader } from 'mysql2';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, phone } = body;

    if (!email || !phone) {
      return NextResponse.json({ status: '8677' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM T_USER_INFO WHERE email = ? AND phone = ?',
      [email, phone]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ status: '8699' });
    }

    return NextResponse.json({ status: '8200' });
  } catch (error) {
    console.error('회원탈퇴 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
