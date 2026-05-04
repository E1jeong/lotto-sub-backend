import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const round = searchParams.get('round');

    if (!round) {
      return NextResponse.json({ status: '8677' });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM T_WINNER_NUM WHERE lotto_round = ? LIMIT 1',
      [round]
    );

    if (rows.length === 0) {
      return NextResponse.json({ status: '8404' });
    }

    const r = rows[0];
    return NextResponse.json({
      status: '8200',
      lottoRound: r.lotto_round,
      pickDate: r.pick_date,
      no1: r.no1,
      no2: r.no2,
      no3: r.no3,
      no4: r.no4,
      no5: r.no5,
      no6: r.no6,
      bonus: r.bonus,
      firstCount: r['1_count'],
      firstMoney: r['1_money'],
      secondCount: r['2_count'],
      secondMoney: r['2_money'],
      thirdCount: r['3_count'],
      thirdMoney: r['3_money'],
      fourthCount: r['4_count'],
      fourthMoney: r['4_money'],
      fifthCount: r['5_count'],
      fifthMoney: r['5_money'],
      fullText: r.full_text,
    });
  } catch (error) {
    console.error('당첨 번호 조회 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
