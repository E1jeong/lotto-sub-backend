import { NextRequest, NextResponse } from 'next/server';
import { fetchDhLotteryWinningNumber } from '@/lib/dhlottery';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roundStr = searchParams.get('round');

    if (!roundStr) {
      return NextResponse.json({ status: '8677' });
    }

    const round = Number(roundStr);
    if (isNaN(round) || round < 0) {
      return NextResponse.json({ status: '8677' });
    }

    const data = await fetchDhLotteryWinningNumber(round);

    if (!data) {
      return NextResponse.json({
        status: '8404',
        message: '해당 회차 데이터가 없거나 동행복권 집계가 아직 완료되지 않았습니다.',
      });
    }

    // 기존 /api/lotto/winning 응답 규격 및 Android 앱 GetLottoNumberResponse와 100% 동일하게 평탄화하여 반환
    return NextResponse.json({
      status: '8200',
      ...data,
    });
  } catch (error) {
    console.error('동행복권 당첨번호 수집 에러:', error);
    return NextResponse.json({ status: '8655' });
  }
}
