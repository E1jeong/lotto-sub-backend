import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { updateUserTierByToken } from '@/lib/googlePlayApi';

interface SubscriptionNotification {
  version: string;
  notificationType: number;
  purchaseToken: string;
  subscriptionId: string;
}

interface DeveloperNotification {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: SubscriptionNotification;
}

interface PubSubMessage {
  data: string;
  messageId: string;
  publishTime: string;
}

interface PubSubBody {
  message: PubSubMessage;
  subscription: string;
}

// notificationType 상수
const NOTIFICATION_TYPE = {
  RECOVERED: 1,
  RENEWED: 2,
  CANCELED: 3,
  IN_GRACE_PERIOD: 6,
  REVOKED: 12,
  EXPIRED: 13,
} as const;

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token || token !== process.env.PUBSUB_SECRET_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: PubSubBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawData = body?.message?.data;
  if (!rawData) {
    return NextResponse.json({ error: 'Missing message.data' }, { status: 400 });
  }

  let notification: DeveloperNotification;
  try {
    const decoded = Buffer.from(rawData, 'base64').toString('utf-8');
    notification = JSON.parse(decoded);
  } catch {
    return NextResponse.json({ error: 'Failed to decode message' }, { status: 400 });
  }

  const sub = notification.subscriptionNotification;
  if (!sub) {
    // oneTimeProductNotification 등 구독 외 이벤트는 무시
    return NextResponse.json({ ok: true });
  }

  const { notificationType, purchaseToken } = sub;
  console.log(`[pubsub] notificationType=${notificationType} token=${purchaseToken.slice(0, 20)}...`);

  try {
    switch (notificationType) {
      case NOTIFICATION_TYPE.RECOVERED:
      case NOTIFICATION_TYPE.RENEWED:
      case NOTIFICATION_TYPE.IN_GRACE_PERIOD:
        await updateUserTierByToken(purchaseToken, pool, 1);
        console.log(`[pubsub] tier=1 업데이트 완료 (type=${notificationType})`);
        break;

      case NOTIFICATION_TYPE.REVOKED:
      case NOTIFICATION_TYPE.EXPIRED:
        await updateUserTierByToken(purchaseToken, pool, 0);
        console.log(`[pubsub] tier=0 업데이트 완료 (type=${notificationType})`);
        break;

      case NOTIFICATION_TYPE.CANCELED:
        // 취소는 만료일까지 유효 — 별도 처리 없음
        console.log(`[pubsub] CANCELED 수신 (만료일까지 유효, 처리 없음)`);
        break;

      default:
        console.log(`[pubsub] 처리하지 않는 notificationType=${notificationType}`);
    }
  } catch (e) {
    console.error('[pubsub] DB 업데이트 오류:', e);
    // Pub/Sub은 200 외 응답 시 재시도하므로 500 반환
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
