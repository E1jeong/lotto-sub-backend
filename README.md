# 어부로또 서브 백엔드

어부로또(FisherLotto) Android 앱의 서브 백엔드 서버입니다.
Next.js App Router 기반 API 서버로, 가비아 클라우드에서 PM2로 운영합니다.

## 문서

제품 요구사항·아키텍처·ADR·DB 마이그레이션 절차는 Obsidian의 `Dev/Project/Personal/lotto-sub-backend` 위키에서 관리합니다. 위치는 [AGENTS.md](AGENTS.md)를 따라 확인합니다. 기존 PRD·아키텍처·ADR·마이그레이션 문서는 위키에 통합한 뒤 삭제했으며, ADR 번호는 위키의 결정 기록을 가리킵니다.

## 기술 스택

- **실행 환경**: Node.js + Next.js App Router (API 전용)
- **데이터베이스**: MySQL (mysql2)
- **푸시 알림**: Firebase Cloud Messaging (Firebase Admin SDK)
- **결제 검증**: Google Play Developer API

## 실행

```bash
npm run dev     # 개발 서버 (포트 3000)
npm run build   # 운영용 빌드
npm start       # 운영 서버
npm run lint    # ESLint 코드 검사
```

## 환경변수 (.env.local)

```
# MySQL
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=
MYSQL_CONNECTION_LIMIT=10

# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# FCM
FCM_SEND_API_KEY=

# 결제 및 Pub/Sub
PUBSUB_SECRET_TOKEN=
CRON_SECRET_TOKEN=
GOOGLE_PLAY_PACKAGE_NAME=com.queentech.fisherlotto

# 이메일 인증 (다음 SMTP)
SMTP_HOST=smtp.daum.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=어부로또

# 메인 서버 연동 (선택, 미설정 시 기본값 사용)
# MAIN_SERVER_REGISTER_URL=
# MAIN_SERVER_REISSUE_URL=
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/users/register` | 이메일 인증 후 사용자 등록 |
| POST | `/api/users/recover` | 이메일 인증 기반 계정 복구 |
| POST | `/api/users/login` | 로그인 / 사용자 조회 |
| POST | `/api/users/withdraw` | 회원탈퇴 |
| POST | `/api/email/send-code` | 이메일 인증코드 발송 |
| POST | `/api/email/verify-code` | 이메일 인증코드 검증 |
| GET | `/api/lotto/winning` | 회차별 당첨 번호 조회 |
| GET | `/api/lotto/stats` | 회차별 등수 조합 통계 조회 |
| POST | `/api/lotto/expect` | 예상 번호 조회 |
| POST | `/api/lotto/fetch-winning` | 최신 당첨 정보 수집 (서버 내부용) |
| POST | `/api/fcm/token` | FCM 토큰 등록 |
| DELETE | `/api/fcm/user` | FCM 토큰 삭제 |
| POST | `/api/fcm/send` | 전체 푸시 발송 (관리용) |
| POST | `/api/billing/receipt` | Google Play 영수증 검증 및 저장 |
| POST | `/api/billing/subscription` | 구독 상태 조회 |
| POST | `/api/billing/pubsub` | Google Play RTDN 수신 웹훅 |
| POST | `/api/billing/reconcile` | 만료 프리미엄 등급 정리 (서버 내부용) |

결제 등급은 클라이언트 값을 신뢰하지 않고 Google Play 서버 검증을 거친 경로에서만 갱신합니다.

## 데이터베이스 테이블

- `T_USER_INFO` — 사용자 정보와 구독 등급
- `T_PURCHASES` — Google Play 구독 영수증
- `T_WINNER_NUM` — 회차별 당첨 번호
- `T_EXPECT_PICK` — 예상 번호 발급 내역
- `T_RESULT_COMBI` — 회차별 등수 당첨 조합 통계
