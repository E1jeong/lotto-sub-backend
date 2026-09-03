import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader } from 'mysql2';
import pool from '@/lib/db';

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET_TOKEN;
  const authorization = req.headers.get('authorization');

  return Boolean(secret && authorization === `Bearer ${secret}`);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE T_USER_INFO
       SET tier = 0
       WHERE tier = 1
         AND valid_date < CURDATE()`
    );

    console.log(`[billing-reconcile] demoted=${result.affectedRows}`);
    return NextResponse.json({ ok: true, demoted: result.affectedRows });
  } catch (error) {
    console.error('[billing-reconcile] failed:', error);
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 });
  }
}
