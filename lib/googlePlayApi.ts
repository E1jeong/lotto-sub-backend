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
  autoRenewing: boolean;
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

  return {
    expiryTimeMillis: expiryTime ? new Date(expiryTime).getTime() : null,
    autoRenewing: subscription.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE'
      && (lineItem?.autoRenewingPlan !== undefined),
  };
}

export async function updateUserTierByToken(
  purchaseToken: string,
  pool: Pool,
  tier: 0 | 1,
): Promise<void> {
  const [rows] = await pool.execute<import('mysql2').RowDataPacket[]>(
    'SELECT email FROM T_PURCHASES WHERE purchase_token = ? LIMIT 1',
    [purchaseToken],
  );

  const email = rows[0]?.email as string | undefined;
  if (!email) return;

  if (tier === 1) {
    const { expiryTimeMillis } = await getSubscriptionDetails(purchaseToken);
    if (!expiryTimeMillis) return;
    await pool.execute(
      'UPDATE T_USER_INFO SET tier = 1, valid_date = DATE(FROM_UNIXTIME(? / 1000)) WHERE email = ?',
      [expiryTimeMillis, email],
    );
  } else {
    await pool.execute(
      'UPDATE T_USER_INFO SET tier = 0, valid_date = CURDATE() WHERE email = ?',
      [email],
    );
  }
}
