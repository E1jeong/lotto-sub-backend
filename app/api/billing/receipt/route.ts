import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSubscriptionDetails } from '@/lib/googlePlayApi';

interface ReceiptRequest {
  orderId: string;
  productId: string;
  purchaseToken: string;
  purchaseTime: number;
  autoRenewing: boolean;
  email: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body: ReceiptRequest = await req.json();
    const { orderId, productId, purchaseToken, purchaseTime, autoRenewing, email } = body;

    if (!orderId || !productId || !purchaseToken) {
      return NextResponse.json(
        { success: false, message: 'orderId, productId, purchaseToken은 필수입니다.' },
        { status: 400 }
      );
    }

    // T_PURCHASES 저장 (INSERT IGNORE: 중복 orderId는 무시)
    await pool.execute(
      `INSERT IGNORE INTO T_PURCHASES
         (order_id, product_id, purchase_token, purchase_time, auto_renewing, email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderId, productId, purchaseToken, purchaseTime, autoRenewing ? 1 : 0, email ?? null]
    );

    // Google Play Developer API로 정확한 구독 만료일 조회
    let expiryTimeMillis: number | null = null;
    try {
      const subscriptionDetails = await getSubscriptionDetails(purchaseToken);
      expiryTimeMillis = subscriptionDetails.expiryTimeMillis;
    } catch (e) {
      console.error('Google Play API 조회 실패 (영수증 저장은 정상 완료):', e);
    }

    // T_USER_INFO tier/valid_date 업데이트
    if (email && expiryTimeMillis) {
      await pool.execute(
        `UPDATE T_USER_INFO
         SET tier = 1, valid_date = DATE(FROM_UNIXTIME(? / 1000))
         WHERE email = ?`,
        [expiryTimeMillis, email]
      );
    }

    return NextResponse.json({ success: true, message: '영수증이 저장되었습니다.', expiryTimeMillis });
  } catch (error) {
    console.error('영수증 저장 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
