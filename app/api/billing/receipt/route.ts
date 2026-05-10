import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSubscriptionDetails } from '@/lib/googlePlayApi';
import type { RowDataPacket } from 'mysql2';

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
    let body: ReceiptRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, message: '잘못된 요청 형식입니다.' },
        { status: 400 }
      );
    }
    const { orderId, productId, purchaseToken, purchaseTime, autoRenewing, email } = body;

    if (!orderId || !productId || !purchaseToken) {
      return NextResponse.json(
        { success: false, message: 'orderId, productId, purchaseToken은 필수입니다.' },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { success: false, message: '이메일 정보가 필요합니다.' },
        { status: 400 }
      );
    }

    // orderId 기준 중복 여부 확인
    const [existingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT purchase_token FROM T_PURCHASES WHERE order_id = ? LIMIT 1',
      [orderId]
    );

    if (existingRows.length > 0) {
      return NextResponse.json({ success: true, message: '이미 처리된 영수증입니다.' });
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
      console.error('Google Play API 검증 실패:', e);
      return NextResponse.json(
        { success: false, message: 'Google Play 영수증 검증에 실패했습니다.' },
        { status: 400 }
      );
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
