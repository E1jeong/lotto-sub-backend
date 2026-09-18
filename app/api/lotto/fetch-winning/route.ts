import { NextRequest, NextResponse } from 'next/server';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import pool from '@/lib/db';
import {
  fetchLatestDhLotteryWinningNumber,
  type WinnerNumberRecord,
} from '@/lib/dhlottery';

const RECORD_COLUMNS: (keyof WinnerNumberRecord)[] = [
  'lottoRound', 'pickDate', 'no1', 'no2', 'no3', 'no4', 'no5', 'no6', 'bonus',
  'firstCount', 'firstMoney', 'secondCount', 'secondMoney', 'thirdCount', 'thirdMoney',
  'fourthCount', 'fourthMoney', 'fifthCount', 'fifthMoney', 'fullText',
];

class WinningNumberConflictError extends Error {}

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET_TOKEN;
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`);
}

function isSaturday(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    && parsed.getUTCDay() === 6;
}

function recordsMatch(left: WinnerNumberRecord, right: WinnerNumberRecord) {
  return RECORD_COLUMNS.every((column) => String(left[column]) === String(right[column]));
}

async function findExistingRecord(connection: PoolConnection, lottoRound: number) {
  const [rows] = await connection.execute<(RowDataPacket & WinnerNumberRecord)[]>(
    `SELECT
       lotto_round AS lottoRound,
       DATE_FORMAT(pick_date, '%Y-%m-%d') AS pickDate,
       no1, no2, no3, no4, no5, no6, bonus,
       \`1_count\` AS firstCount, \`1_money\` AS firstMoney,
       \`2_count\` AS secondCount, \`2_money\` AS secondMoney,
       \`3_count\` AS thirdCount, \`3_money\` AS thirdMoney,
       \`4_count\` AS fourthCount, \`4_money\` AS fourthMoney,
       \`5_count\` AS fifthCount, \`5_money\` AS fifthMoney,
       full_text AS fullText
     FROM T_WINNER_NUM
     WHERE lotto_round = ?
     LIMIT 1`,
    [lottoRound]
  );

  return rows[0] ?? null;
}

async function storeWinningNumber(data: WinnerNumberRecord) {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const [lockRows] = await connection.execute<RowDataPacket[]>(
      'SELECT GET_LOCK(?, 5) AS acquired',
      ['lotto-winning-number-fetch']
    );
    if (Number(lockRows[0]?.acquired) !== 1) {
      throw new Error('당첨번호 저장 잠금을 획득하지 못했습니다.');
    }

    await connection.beginTransaction();
    transactionStarted = true;

    const existing = await findExistingRecord(connection, data.lottoRound);
    if (existing) {
      if (!recordsMatch(existing, data)) {
        throw new WinningNumberConflictError(`기존 ${data.lottoRound}회 데이터와 동행복권 데이터가 다릅니다.`);
      }

      await connection.commit();
      transactionStarted = false;
      return 'already_stored' as const;
    }

    await connection.execute(
      `INSERT INTO T_WINNER_NUM (
         lotto_round, pick_date, no1, no2, no3, no4, no5, no6, bonus,
         \`1_count\`, \`1_money\`, \`2_count\`, \`2_money\`,
         \`3_count\`, \`3_money\`, \`4_count\`, \`4_money\`,
         \`5_count\`, \`5_money\`, full_text
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.lottoRound, data.pickDate,
        data.no1, data.no2, data.no3, data.no4, data.no5, data.no6, data.bonus,
        data.firstCount, data.firstMoney, data.secondCount, data.secondMoney,
        data.thirdCount, data.thirdMoney, data.fourthCount, data.fourthMoney,
        data.fifthCount, data.fifthMoney, data.fullText,
      ]
    );

    const stored = await findExistingRecord(connection, data.lottoRound);
    if (!stored || !recordsMatch(stored, data)) {
      throw new Error('당첨번호 저장 결과 검증에 실패했습니다.');
    }

    await connection.commit();
    transactionStarted = false;
    return 'inserted' as const;
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    throw error;
  } finally {
    try {
      await connection.execute('SELECT RELEASE_LOCK(?)', ['lotto-winning-number-fetch']);
    } finally {
      connection.release();
    }
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { targetDate?: unknown } | null;
  const targetDate = body?.targetDate;
  if (typeof targetDate !== 'string' || !isSaturday(targetDate)) {
    return NextResponse.json({ error: 'A valid Saturday targetDate is required' }, { status: 400 });
  }

  try {
    const data = await fetchLatestDhLotteryWinningNumber();

    if (!data) {
      return NextResponse.json({
        ok: false,
        retryable: true,
        error: '동행복권 최신 회차 집계가 아직 완료되지 않았습니다.',
      }, { status: 503 });
    }

    if (data.pickDate < targetDate) {
      console.log(`[lotto-fetch] pending targetDate=${targetDate} latestRound=${data.lottoRound} latestDate=${data.pickDate}`);
      return NextResponse.json({
        ok: false,
        retryable: true,
        error: '목표 추첨일의 신규 회차가 아직 공개되지 않았습니다.',
      }, { status: 503 });
    }

    if (data.pickDate !== targetDate) {
      console.error(`[lotto-fetch] unexpected-date targetDate=${targetDate} latestRound=${data.lottoRound} latestDate=${data.pickDate}`);
      return NextResponse.json({
        ok: false,
        retryable: true,
        error: '동행복권 최신 회차의 추첨일이 목표 추첨일과 다릅니다.',
      }, { status: 409 });
    }

    const outcome = await storeWinningNumber(data);
    console.log(`[lotto-fetch] ${outcome} round=${data.lottoRound} pickDate=${data.pickDate}`);
    return NextResponse.json({
      ok: true,
      outcome,
      lottoRound: data.lottoRound,
      pickDate: data.pickDate,
    });
  } catch (error) {
    if (error instanceof WinningNumberConflictError) {
      console.error('[lotto-fetch] conflict:', error.message);
      return NextResponse.json({
        ok: false,
        retryable: true,
        error: '기존 회차 데이터와 동행복권 데이터가 다릅니다.',
      }, { status: 409 });
    }

    console.error('[lotto-fetch] failed:', error);
    return NextResponse.json({
      ok: false,
      retryable: true,
      error: '당첨번호 수집에 실패했습니다.',
    }, { status: 500 });
  }
}
