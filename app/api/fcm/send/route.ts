import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebaseAdmin';
import pool from '@/lib/db';
import { RowDataPacket } from 'mysql2';

const BATCH_SIZE = 500;

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.FCM_SEND_API_KEY) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { title, body } = await request.json();

    if (!title || !body) {
      return NextResponse.json({ error: 'title과 body가 필요합니다.' }, { status: 400 });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT fcm_token FROM T_USER_INFO WHERE fcm_token IS NOT NULL'
    );
    const tokens: string[] = rows.map(row => row.fcm_token);

    if (tokens.length === 0) {
      return NextResponse.json({
        message: '등록된 FCM 토큰이 없습니다.',
        totalTokens: 0,
        sent: 0,
        failed: 0,
      });
    }

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const tokenBatch = tokens.slice(i, i + BATCH_SIZE);

      const message: admin.messaging.MulticastMessage = {
        tokens: tokenBatch,
        notification: { title, body },
        data: { title, body },
        android: { priority: 'high' },
      };

      const result = await admin.messaging().sendEachForMulticast(message);
      successCount += result.successCount;
      failureCount += result.failureCount;
    }

    return NextResponse.json({
      message: '푸시 알림 전송 완료',
      totalTokens: tokens.length,
      sent: successCount,
      failed: failureCount,
    });
  } catch (error) {
    console.error('FCM 전송 에러:', error);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}
