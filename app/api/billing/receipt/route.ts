import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
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

    const receiptData = {
      orderId,
      productId,
      purchaseToken,
      purchaseTime,
      autoRenewing,
      email: email || null,
      createdAt: new Date().toISOString(),
    };

    // Firestore purchases 컬렉션에 orderId를 문서 ID로 저장
    await db.collection('purchases').doc(orderId).set(receiptData);

    // Google Play Developer API로 정확한 구독 만료일 조회
    let expiryTimeMillis: number | null = null;
    try {
      const subscriptionDetails = await getSubscriptionDetails(purchaseToken);
      expiryTimeMillis = subscriptionDetails.expiryTimeMillis;
    } catch (e) {
      console.error('Google Play API 조회 실패 (영수증 저장은 정상 완료):', e);
    }

    // 사용자 이메일이 있으면 해당 유저 문서에도 구독 상태 업데이트
    if (email) {
      await db.collection('users').doc(email).set(
        {
          subscription: {
            productId,
            orderId,
            autoRenewing,
            purchaseTime,
            expiryTimeMillis,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      );
    }

    return NextResponse.json({ success: true, message: '영수증이 저장되었습니다.', expiryTimeMillis });
  } catch (error) {
    console.error('영수증 저장 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
