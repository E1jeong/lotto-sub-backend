import { NextRequest, NextResponse } from 'next/server';
import { admin, db } from '@/lib/firebaseAdmin';

const BATCH_SIZE = 500; // FCM multicast 최대 허용 토큰 수

export async function POST(request: NextRequest) {
  // API 키로 인증 (Vercel 환경변수: FCM_SEND_API_KEY)
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.FCM_SEND_API_KEY) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { title, body } = await request.json();

    if (!title || !body) {
      return NextResponse.json(
        { error: 'title과 body가 필요합니다.' },
        { status: 400 }
      );
    }

    // Firestore에서 모든 유저 문서를 가져와 FCM 토큰만 수집
    const usersSnapshot = await db.collection('users').get();
    const tokens: string[] = [];

    usersSnapshot.forEach(doc => {
      const { fcmToken } = doc.data();
      if (fcmToken && typeof fcmToken === 'string') {
        tokens.push(fcmToken);
      }
    });

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

    // FCM 한 번에 500개까지만 전송 가능하므로 배치 처리
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const tokenBatch = tokens.slice(i, i + BATCH_SIZE);

      const message: admin.messaging.MulticastMessage = {
        tokens: tokenBatch,
        // notification 페이로드: 앱이 백그라운드일 때 시스템이 직접 알림 표시
        notification: { title, body },
        // data 페이로드: FisherLottoMessagingService.onMessageReceived()에서 처리
        data: { title, body },
        android: {
          priority: 'high',
        },
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
