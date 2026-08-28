// lib/googlePlayApi.ts
import { google } from 'googleapis';
import type { Pool } from 'mysql2/promise';

// Firebase Admin과 동일한 서비스 계정 재사용
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    // Vercel 환경변수에서 줄바꿈(\n) 오류를 방지하기 위한 필수 처리 (firebaseAdmin.ts와 동일)
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

const androidPublisher = google.androidpublisher({ version: 'v3', auth });

const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.queentech.fisherlotto';

export interface SubscriptionDetails {
  expiryTimeMillis: number | null;
  productId: string | null;
  subscriptionState: string | null;
  latestOrderId: string | null;
  purchaseTimeMillis: number | null;
  isEntitled: boolean;
  autoRenewing: boolean;
  cancelAtPeriodEnd: boolean;
  isOnHold: boolean;
}

export async function getSubscriptionDetails(
  purchaseToken: string,
): Promise<SubscriptionDetails> {
  const response = await androidPublisher.purchases.subscriptionsv2.get({
    packageName,
    token: purchaseToken,
  });

  const subscription = response.data;
  const lineItem = subscription.lineItems?.[0];
  const expiryTime = lineItem?.expiryTime;
  const expiryTimeMillis = expiryTime ? new Date(expiryTime).getTime() : null;
  const subscriptionState = subscription.subscriptionState ?? null;
  const isEntitledState = [
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_CANCELED',
  ].includes(subscriptionState ?? '');

  return {
    expiryTimeMillis,
    productId: lineItem?.productId ?? null,
    subscriptionState,
    latestOrderId: subscription.latestOrderId ?? null,
    purchaseTimeMillis: subscription.startTime ? new Date(subscription.startTime).getTime() : null,
    isEntitled: isEntitledState && expiryTimeMillis !== null && expiryTimeMillis > Date.now(),
    autoRenewing: subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE'
      && (lineItem?.autoRenewingPlan !== undefined),
    cancelAtPeriodEnd: subscriptionState === 'SUBSCRIPTION_STATE_CANCELED',
    isOnHold: subscriptionState === 'SUBSCRIPTION_STATE_ON_HOLD',
  };
}

export interface EntitlementSyncResult {
  email: string | null;
  isEntitled: boolean;
  subscriptionState: string | null;
}

export async function syncUserEntitlementByToken(
  purchaseToken: string,
  pool: Pool,
): Promise<EntitlementSyncResult> {
  const [rows] = await pool.execute<import('mysql2').RowDataPacket[]>(
    `SELECT email FROM T_PURCHASES
     WHERE purchase_token_sha256 = UNHEX(SHA2(?, 256))
     LIMIT 1`,
    [purchaseToken],
  );

  const email = rows[0]?.email as string | undefined;
  if (!email) {
    return { email: null, isEntitled: false, subscriptionState: null };
  }

  const details = await getSubscriptionDetails(purchaseToken);
  if (details.isEntitled && details.productId === 'fisherlotto_monthly') {
    await pool.execute(
      'UPDATE T_USER_INFO SET tier = 1, valid_date = DATE(FROM_UNIXTIME(? / 1000)) WHERE email = ?',
      [details.expiryTimeMillis, email],
    );
  } else {
    // 이 email의 가장 최근 구매 건이 아니라면(이미 새 토큰으로 재구독한 경우)
    // 옛 토큰의 REVOKED/EXPIRED 알림으로 최신 구독을 강등시키지 않는다.
    const [latestRows] = await pool.execute<import('mysql2').RowDataPacket[]>(
      `SELECT purchase_token FROM T_PURCHASES
       WHERE email = ?
       ORDER BY purchase_time DESC
       LIMIT 1`,
      [email],
    );
    const latestToken = latestRows[0]?.purchase_token as string | undefined;
    if (latestToken && latestToken !== purchaseToken) {
      return { email, isEntitled: false, subscriptionState: details.subscriptionState };
    }

    await pool.execute(
      'UPDATE T_USER_INFO SET tier = 0, valid_date = CURDATE() WHERE email = ?',
      [email],
    );
  }

  return {
    email,
    isEntitled: details.isEntitled && details.productId === 'fisherlotto_monthly',
    subscriptionState: details.subscriptionState,
  };
}
