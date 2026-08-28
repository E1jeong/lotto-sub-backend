import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSubscriptionDetails, type SubscriptionDetails } from '@/lib/googlePlayApi';
import { requestExpectNumberIssuance } from '@/lib/mainServer';
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
    const { orderId, productId, purchaseToken, email } = body;

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

    // Google Play Developer API를 기준으로 현재 권한을 판정한다.
    let subscriptionDetails: SubscriptionDetails;
    try {
      subscriptionDetails = await getSubscriptionDetails(purchaseToken);
    } catch (e) {
      console.error('Google Play API 검증 실패:', e);
      return NextResponse.json(
        { success: false, message: 'Google Play 영수증 검증에 실패했습니다.' },
        { status: 400 }
      );
    }

    if (
      subscriptionDetails.productId !== productId ||
      !subscriptionDetails.isEntitled ||
      subscriptionDetails.expiryTimeMillis === null
    ) {
      return NextResponse.json(
        {
          success: false,
          message: '현재 Premium 구독으로 확인되지 않았습니다.',
          expiryTimeMillis: subscriptionDetails.expiryTimeMillis,
          isEntitled: false,
          subscriptionState: subscriptionDetails.subscriptionState,
        },
        { status: 400 }
      );
    }

    const providerOrderId = subscriptionDetails.latestOrderId;
    const providerPurchaseTime = subscriptionDetails.purchaseTimeMillis;
    if (!providerOrderId || providerPurchaseTime === null) {
      return NextResponse.json(
        { success: false, message: 'Google Play 주문 정보를 확인할 수 없습니다.' },
        { status: 400 }
      );
    }

    // T_PURCHASES 저장 + T_USER_INFO tier/valid_date 업데이트를 하나의 트랜잭션으로 처리
    const connection = await pool.getConnection();
    let isNewPurchase = false;
    try {
      await connection.beginTransaction();

      const [userRows] = await connection.execute<RowDataPacket[]>(
        'SELECT phone FROM T_USER_INFO WHERE email = ? FOR UPDATE',
        [email]
      );
      if (userRows.length === 0) {
        await connection.rollback();
        return NextResponse.json(
          { success: false, message: '사용자 정보를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      const [existingTokenRows] = await connection.execute<RowDataPacket[]>(
        `SELECT order_id, email FROM T_PURCHASES
         WHERE purchase_token_sha256 = UNHEX(SHA2(?, 256))
         FOR UPDATE`,
        [purchaseToken]
      );

      if (existingTokenRows.length > 0 && existingTokenRows[0].email !== email) {
        await connection.rollback();
        return NextResponse.json(
          { success: false, message: '다른 계정에 연결된 구독입니다.' },
          { status: 409 }
        );
      }

      const [existingOrderRows] = await connection.execute<RowDataPacket[]>(
        'SELECT purchase_token FROM T_PURCHASES WHERE order_id = ? FOR UPDATE',
        [providerOrderId]
      );
      if (
        existingOrderRows.length > 0 &&
        existingOrderRows[0].purchase_token !== purchaseToken
      ) {
        await connection.rollback();
        return NextResponse.json(
          { success: false, message: '이미 다른 결제에 사용된 주문 정보입니다.' },
          { status: 409 }
        );
      }

      if (existingTokenRows.length === 0) {
        await connection.execute(
          `INSERT INTO T_PURCHASES
           (order_id, product_id, purchase_token, purchase_time, auto_renewing, email)
         VALUES (?, ?, ?, ?, ?, ?)`,
          [
            providerOrderId,
            subscriptionDetails.productId,
            purchaseToken,
            providerPurchaseTime,
            subscriptionDetails.autoRenewing ? 1 : 0,
            email,
          ]
        );
        isNewPurchase = true;
      }

      await connection.execute(
        `UPDATE T_USER_INFO
         SET tier = 1, valid_date = DATE(FROM_UNIXTIME(? / 1000))
         WHERE email = ?`,
        [subscriptionDetails.expiryTimeMillis, email]
      );

      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }

    // Premium tier 커밋 직후에만 main-server에 이번 주차 유료 예상번호 20개 추가 발급을 요청한다.
    // tier 갱신은 이미 커밋되어 성공이 확정된 상태이므로, 이 블록의 어떤 오류도
    // 바깥 catch로 전파되어 이미 성공한 결제를 실패 응답으로 덮어써서는 안 된다.
    if (isNewPurchase) {
      try {
        const [userRows] = await pool.execute<RowDataPacket[]>(
          'SELECT phone FROM T_USER_INFO WHERE email = ? LIMIT 1',
          [email]
        );
        const phone = userRows[0]?.phone as string | undefined;
        if (phone) {
          await requestExpectNumberIssuance(email, phone);
        }
      } catch (e) {
        console.error('main-server 예상번호 발급 동기화 오류 (tier 갱신에는 영향 없음):', e);
      }
    }

    return NextResponse.json({
      success: true,
      message: isNewPurchase ? '영수증이 저장되었습니다.' : '이미 처리된 영수증 상태를 확인했습니다.',
      expiryTimeMillis: subscriptionDetails.expiryTimeMillis,
      isEntitled: true,
      subscriptionState: subscriptionDetails.subscriptionState,
    });
  } catch (error) {
    console.error('영수증 저장 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
