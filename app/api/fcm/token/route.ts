// app/api/fcm/token/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
  try {
    // 1. 앱에서 보낸 데이터(유저ID와 FCM 토큰)를 꺼냅니다.
    const body = await request.json();
    const { email, fcmToken } = body;

    if (!email || !fcmToken) {
      return NextResponse.json({ error: 'email와 fcmToken이 필요합니다.' }, { status: 400 });
    }

    // 2. 같은 fcmToken을 가진 다른 유저 문서가 있으면 삭제합니다.
    // (같은 기기에서 새 계정으로 가입한 경우, 이전 계정의 토큰을 정리)
    const existingDocs = await db.collection('users')
      .where('fcmToken', '==', fcmToken)
      .get();

    const batch = db.batch();
    existingDocs.forEach((doc) => {
      if (doc.id !== email) {
        batch.delete(doc.ref);
      }
    });
    await batch.commit();

    // 3. Firestore 데이터베이스의 'users' 컬렉션에 토큰을 저장합니다.
    await db.collection('users').doc(email).set(
      {
        fcmToken: fcmToken,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );

    // 3. 성공 응답 보내기
    return NextResponse.json({ message: '토큰이 성공적으로 저장되었습니다.' }, { status: 200 });

  } catch (error) {
    console.error('토큰 저장 에러:', error);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}