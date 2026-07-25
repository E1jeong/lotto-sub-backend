import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSubscriptionDetails } from '@/lib/googlePlayApi';
import { requestExpectNumberReissue } from '@/lib/mainServer';
import type { RowDataPacket } from 'mysql2';

const ALLOWED_PRODUCT_IDS = ['fisherlotto_monthly'];

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

    if (!ALLOWED_PRODUCT_IDS.includes(productId)) {
      return NextResponse.json(
        { success: false, message: `허용되지 않은 productId입니다: ${productId}` },
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

    // T_PURCHASES 저장 + T_USER_INFO tier/valid_date 업데이트를 하나의 트랜잭션으로 처리
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // T_PURCHASES 저장 (INSERT IGNORE: 중복 orderId는 무시)
      await connection.execute(
        `INSERT IGNORE INTO T_PURCHASES
           (order_id, product_id, purchase_token, purchase_time, auto_renewing, email)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, productId, purchaseToken, purchaseTime, autoRenewing ? 1 : 0, email ?? null]
      );

      if (expiryTimeMillis) {
        await connection.execute(
          `UPDATE T_USER_INFO
           SET tier = 1, valid_date = DATE(FROM_UNIXTIME(? / 1000))
           WHERE email = ?`,
          [expiryTimeMillis, email]
        );
      }

      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }

    // Premium tier 커밋 직후에만 main-server에 이번 주차 예상번호 재발급(10 -> 30)을 요청한다.
    // tier 갱신은 이미 커밋되어 성공이 확정된 상태이므로, 이 블록의 어떤 오류도
    // 바깥 catch로 전파되어 이미 성공한 결제를 실패 응답으로 덮어써서는 안 된다.
    let reissued = false;
    if (expiryTimeMillis) {
      try {
        const [userRows] = await pool.execute<RowDataPacket[]>(
          'SELECT phone FROM T_USER_INFO WHERE email = ? LIMIT 1',
          [email]
        );
        const phone = userRows[0]?.phone as string | undefined;
        if (phone) {
          const result = await requestExpectNumberReissue(email, phone);
          reissued = result.reissued;
        }
      } catch (e) {
        console.error('main-server 재발급 연동 오류 (tier 갱신에는 영향 없음):', e);
      }
    }

    return NextResponse.json({ success: true, message: '영수증이 저장되었습니다.', expiryTimeMillis, reissued });
  } catch (error) {
    console.error('영수증 저장 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
