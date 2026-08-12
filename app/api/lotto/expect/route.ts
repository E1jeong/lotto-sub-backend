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
      'SELECT pick_expect, pay_expect FROM T_EXPECT_PICK WHERE email = ? AND phone = ? ORDER BY lotto_round DESC LIMIT 1',
      [email, phone]
    );

    if (rows.length === 0) {
      return NextResponse.json({ status: '8404' });
    }

    const r = rows[0];
    const pickExpect = JSON.parse(r.pick_expect);
    const payExpect = r.pay_expect === '$$' || r.pay_expect === null
      ? null
      : JSON.parse(r.pay_expect);
    const lotto = [
      ...pickExpect.lotto,
      ...(payExpect?.lotto ?? []),
    ];

    return NextResponse.json({
      status: '8200',
      count: lotto.length,
      lotto,
    });
  } catch (error) {
    console.error('예상번호 조회 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
