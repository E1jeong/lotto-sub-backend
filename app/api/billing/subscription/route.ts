import { NextRequest, NextResponse } from 'next/server';
import { getSubscriptionDetails } from '@/lib/googlePlayApi';

interface SubscriptionQueryRequest {
  purchaseToken: string;
  productId: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: SubscriptionQueryRequest = await req.json();

    const { purchaseToken } = body;

    if (!purchaseToken) {
      return NextResponse.json(
        { success: false, message: 'purchaseToken은 필수입니다.' },
        { status: 400 }
      );
    }

    const details = await getSubscriptionDetails(purchaseToken);

    return NextResponse.json({
      success: true,
      expiryTimeMillis: details.expiryTimeMillis,
      autoRenewing: details.autoRenewing,
    });
  } catch (error) {
    console.error('구독 상태 조회 오류:', error);
    return NextResponse.json(
      { success: false, message: '구독 상태를 조회할 수 없습니다.' },
      { status: 500 }
    );
  }
}
