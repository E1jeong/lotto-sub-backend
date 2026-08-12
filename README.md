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
| POST | `/api/users/withdraw` | 회원탈퇴 | `{ email, phone }` — hard delete |

> tier 변경 전용 엔드포인트는 없다. `T_USER_INFO.tier`/`valid_date`는 Google Play 검증을 거친 `/api/billing/receipt`와 `/api/billing/pubsub`에서만 갱신한다 (ADR-009).

### 로또

| Method | Path | 설명 | 비고 |
|--------|------|------|------|
| GET | `/api/lotto/winning` | 당첨 번호 조회 | `?round=1100` |
| POST | `/api/lotto/expect` | 예상 번호 조회 | `{ email, phone }` → 무료 발급행 10개, 유료 발급행 30개 |
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
| POST | `/api/billing/receipt` | Google Play 영수증 저장 | `{ orderId, productId, purchaseToken, purchaseTime, autoRenewing, email }` → 응답에 `reissued: boolean` 포함 |
| POST | `/api/billing/subscription` | 구독 상태 조회 | `{ purchaseToken, productId }` |
| POST | `/api/billing/pubsub` | RTDN Pub/Sub 수신 웹훅 | `?token=PUBSUB_SECRET_TOKEN` |

`/api/lotto/expect`는 `T_EXPECT_PICK.pick_expect`의 기본 10개를 항상 반환한다. 무료 발급행의 `pay_expect` 값은 `$$`이며, 유료 JSON이 저장된 경우에만 추가 20개를 뒤에 합쳐 기존 `{ status, count, lotto }` 형식으로 30개를 반환한다. 발급 후 주중에 구독이 취소되거나 만료되어도 저장된 유료 JSON은 그대로 제공하며, 다음 주차 발급 때 main-server가 최신 tier를 다시 적용한다.

`/api/billing/receipt`는 Premium tier 갱신을 커밋한 직후, 같은 Gabia VM 내부의 legacy main-server(`http://127.0.0.1:10907/lotto/1077`, `MAIN_SERVER_REISSUE_URL`로 override 가능)를 호출해 이번 주차의 유료 20개(`pay_expect`) 추가 발급을 요청한다. `reissued: true`일 때만 앱이 로컬 캐시를 비우고 재발급을 안내해야 한다. main-server 호출 실패는 이미 커밋된 tier 갱신에 영향을 주지 않고 `reissued: false`로 응답한다.

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
- `T_EXPECT_PICK` — 예상번호 발급행 (`pick_expect`: 공통 10개 JSON, `pay_expect`: 무료는 `$$`, 유료 발급 시 추가 20개 JSON; 기존 `pick_count` 삭제)
- `T_RESULT_COMBI` — 로또 회차별 등수(1~5등) 당첨 조합 개수 및 전체 조합 개수(`combi_count`)

자세한 마이그레이션 내용은 [docs/MIGRATION.md](docs/MIGRATION.md) 참고.
