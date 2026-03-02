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

    // 2. Firestore 데이터베이스의 'users' 컬렉션에 토큰을 저장합니다.
    // users -> [email] 문서 안에 fcmToken을 업데이트(또는 생성)합니다.
    await db.collection('users').doc(email).set(
      { 
        fcmToken: fcmToken,
        updatedAt: new Date().toISOString() 
      },
      { merge: true } // 기존 유저 데이터가 있다면 덮어쓰지 않고 합칩니다(유지합니다).
    );

    // 3. 성공 응답 보내기
    return NextResponse.json({ message: '토큰이 성공적으로 저장되었습니다.' }, { status: 200 });

  } catch (error) {
    console.error('토큰 저장 에러:', error);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}