# lotto-sub-backend

fisherlotto Android 앱의 서브 백엔드 서버.
Next.js App Router 기반 API 서버로, Gabia 클라우드에서 PM2로 운영된다.

## 기술 스택

- **Runtime**: Node.js + Next.js App Router (API only)
- **DB**: MySQL (mysql2)
- **Push**: Firebase Cloud Messaging (Firebase Admin SDK)
- **결제 검증**: Google Play Developer API

## 실행

```bash
npm run dev     # 개발 서버 (port 3000)
npm run build   # 프로덕션 빌드
npm start       # 프로덕션 서버
npm run lint    # ESLint
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

# 결제 & Pub/Sub
PUBSUB_SECRET_TOKEN=
GOOGLE_PLAY_PACKAGE_NAME=com.queentech.fisherlotto
```

## API 엔드포인트

### 유저

| Method | Path | 설명 | 비고 |
|--------|------|------|------|
| POST | `/api/users/register` | 유저 등록 | `{ name, email, phone, birth }` |
| POST | `/api/users/login` | 로그인 / 유저 조회 | `{ email, phone }` |
| GET | `/api/users` | 유저 조회 (내부용) | `?email=xxx` |
| POST | `/api/users/tier` | tier 변경 | `{ email, phone, isPremium: boolean }` |
| POST | `/api/users/withdraw` | 회원탈퇴 | `{ email, phone }` — hard delete |

### 로또

| Method | Path | 설명 | 비고 |
|--------|------|------|------|
| GET | `/api/lotto/winning` | 당첨 번호 조회 | `?round=1100` |
| POST | `/api/lotto/expect` | 예상 번호 조회 | `{ email, phone }` |
| GET | `/api/lotto/stats` | 회차별 등수 조합 통계 조회 | `?round=1100` (0=최신) |

### FCM

| Method | Path | 설명 | 비고 |
|--------|------|------|------|
| POST | `/api/fcm/token` | FCM 토큰 등록 | `{ email, fcmToken }` |
| DELETE | `/api/fcm/user` | FCM 토큰 삭제 | `{ email }` |
| POST | `/api/fcm/send` | 전체 푸시 발송 | `{ title, body }` + `x-api-key` 헤더 필요 |

### 결제

| Method | Path | 설명 | 비고 |
|--------|------|------|------|
| POST | `/api/billing/receipt` | Google Play 영수증 저장 | `{ orderId, productId, purchaseToken, purchaseTime, autoRenewing, email }` |
| POST | `/api/billing/subscription` | 구독 상태 조회 | `{ purchaseToken, productId }` |
| POST | `/api/billing/pubsub` | RTDN Pub/Sub 수신 웹훅 | `?token=PUBSUB_SECRET_TOKEN` |

## 응답 코드

| 코드 | 설명 |
|------|------|
| 8200 | 성공 |
| 8404 | 데이터 없음 |
| 8611 | 이메일 중복 |
| 8633 | 전화번호 중복 |
| 8655 | 서버/DB 오류 |
| 8677 | 요청 필드 오류 |
| 8699 | 유저 정보 없음 |

## DB 테이블

- `T_USER_INFO` — 유저 정보 (`tier`: 0=FREE, 1=PREMIUM)
- `T_PURCHASES` — Google Play 구독 영수증
- `T_WINNER_NUM` — 로또 회차별 당첨 번호
- `T_RESULT_COMBI` — 로또 회차별 등수(1~5등) 당첨 조합 개수 및 전체 조합 개수(`combi_count`)

자세한 마이그레이션 내용은 [docs/MIGRATION.md](docs/MIGRATION.md) 참고.
