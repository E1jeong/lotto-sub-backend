import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { syncUserEntitlementByToken } from '@/lib/googlePlayApi';
import { admin } from '@/lib/firebaseAdmin';
import type { RowDataPacket } from 'mysql2';

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
  ON_HOLD: 5,
  IN_GRACE_PERIOD: 6,
  RESTARTED: 7,
  PAUSED: 10,
  REVOKED: 12,
  EXPIRED: 13,
} as const;

const FCM_DEBOUNCE_MS = 2_000;
const pendingFcmByEmail = new Map<string, {
  notificationType: number;
  isEntitled: boolean;
  timeout: ReturnType<typeof setTimeout>;
}>();

async function sendFcmToUser(email: string, title: string, body: string) {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT fcm_token FROM T_USER_INFO WHERE email = ?',
      [email]
    );
    const token = rows[0]?.fcm_token;
    if (!token) return;

    await admin.messaging().send({
      token,
      notification: { title, body },
      data: { type: 'SUBSCRIPTION_UPDATE' },
    });
    console.log('[pubsub] FCM 발송 성공');
  } catch (error) {
    console.error('[pubsub] FCM 발송 실패:', error);
  }
}

function getSubscriptionMessage(notificationType: number, isEntitled: boolean) {
  switch (notificationType) {
    case NOTIFICATION_TYPE.CANCELED:
      return '구독 해지 안내: 만료일까지 프리미엄 혜택이 유지됩니다.';
    case NOTIFICATION_TYPE.EXPIRED:
      return '구독 만료 안내: 기본 혜택(Free)으로 전환되었습니다.';
    default:
      return isEntitled
        ? '구독 상태가 정상적으로 유지됩니다.'
        : '구독 상태가 변경되어 기본 혜택으로 전환되었습니다.';
  }
}

function scheduleSubscriptionFcm(email: string, notificationType: number, isEntitled: boolean) {
  const previous = pendingFcmByEmail.get(email);
  if (previous) {
    clearTimeout(previous.timeout);
  }

  const pending = {
    notificationType,
    isEntitled,
    timeout: setTimeout(() => {
      if (pendingFcmByEmail.get(email) !== pending) return;

      pendingFcmByEmail.delete(email);
      void sendFcmToUser(
        email,
        '구독 상태 안내',
        getSubscriptionMessage(pending.notificationType, pending.isEntitled),
      );
    }, FCM_DEBOUNCE_MS),
  };

  pendingFcmByEmail.set(email, pending);
}

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
  console.log(`[pubsub] notificationType=${notificationType}`);

  try {
    switch (notificationType) {
      case NOTIFICATION_TYPE.RECOVERED:
      case NOTIFICATION_TYPE.RENEWED:
      case NOTIFICATION_TYPE.CANCELED:
      case NOTIFICATION_TYPE.ON_HOLD:
      case NOTIFICATION_TYPE.IN_GRACE_PERIOD:
      case NOTIFICATION_TYPE.RESTARTED:
      case NOTIFICATION_TYPE.PAUSED:
      case NOTIFICATION_TYPE.REVOKED:
      case NOTIFICATION_TYPE.EXPIRED: {
        const result = await syncUserEntitlementByToken(purchaseToken, pool);
        console.log(`[pubsub] entitlement 동기화 완료 (type=${notificationType}, state=${result.subscriptionState})`);
        if (result.email) {
          scheduleSubscriptionFcm(result.email, notificationType, result.isEntitled);
        }
        break;
      }

      default:
        console.log(`[pubsub] 처리하지 않는 notificationType=${notificationType}`);
    }
  } catch (error) {
    console.error('[pubsub] entitlement synchronization failed:', error);
    return NextResponse.json({ error: 'Entitlement synchronization failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
