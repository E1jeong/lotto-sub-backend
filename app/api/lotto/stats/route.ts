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

    const query = Number(round) === 0
      ? 'SELECT * FROM T_RESULT_COMBI ORDER BY lotto_round DESC LIMIT 1'
      : 'SELECT * FROM T_RESULT_COMBI WHERE lotto_round = ? LIMIT 1';
    const params = Number(round) === 0 ? [] : [round];

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);

    if (rows.length === 0) {
      return NextResponse.json({ status: '8404' });
    }

    const r = rows[0];
    return NextResponse.json({
      status: '8200',
      lottoRound: r.lotto_round,
      pickDate: r.pick_date,
      grade1: r.grade1,
      grade2: r.grade2,
      grade3: r.grade3,
      grade4: r.grade4,
      grade5: r.grade5,
      combiCount: r.combi_count,
    });
  } catch (error) {
    console.error('통계 조회 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
