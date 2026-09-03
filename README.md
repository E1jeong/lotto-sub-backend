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
CRON_SECRET_TOKEN=
GOOGLE_PLAY_PACKAGE_NAME=com.queentech.fisherlotto

# 이메일 인증 (Daum SMTP)
SMTP_HOST=smtp.daum.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=어부로또
```

## API 엔드포인트

### 유저

| Method | Path | 설명 | 비고 |
|--------|------|------|------|
| POST | `/api/users/register` | 이메일 인증 후 유저 등록 | `{ name, email, phone, birth, verificationToken }` |
| POST | `/api/users/recover` | 이메일 인증 기반 계정 복구 | `{ email, phone, verificationToken }` → 최소 프로필 및 `tier: "FREE" | "PREMIUM"` |
| POST | `/api/users/login` | 로그인 / 유저 조회 | `{ email, phone }` |
| GET | `/api/users` | 유저 조회 (내부용) | `?email=xxx` |
| POST | `/api/users/withdraw` | 회원탈퇴 | `{ email, phone }` — hard delete |

### 이메일 인증

| Method | Path | 설명 | 비고 |
|--------|------|------|------|
| POST | `/api/email/send-code` | 6자리 인증코드 발송 | `{ email, purpose }`, `purpose`는 `registration` 또는 `recovery`, 코드 유효기간 5분 |
| POST | `/api/email/verify-code` | 인증코드 검증 | `{ email, code, purpose }` → `{ status, verificationToken }` |

`purpose`는 모든 이메일 인증 요청에서 필수다. 가입 화면은 `registration`, 계정 복구 화면은 `recovery`를 명시해야 한다. `verificationToken`은 발급 목적과 동일한 `register` 또는 `recover` 요청에 한 번만 사용할 수 있다. 서버는 원문 대신 SHA-256 해시를 단일 PM2 프로세스 메모리에 최대 30분 보관하고, 성공 시 즉시 폐기한다. 앱은 이 값을 화면 상태에만 보관하며 로그인 토큰으로 사용하지 않는다.

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
| POST | `/api/billing/receipt` | Google Play 영수증 저장 | `{ orderId, productId, purchaseToken, purchaseTime, autoRenewing, email }` |
| POST | `/api/billing/subscription` | 구독 상태 조회 | `{ purchaseToken, productId }` |
| POST | `/api/billing/pubsub` | RTDN Pub/Sub 수신 웹훅 | `?token=PUBSUB_SECRET_TOKEN` |
| POST | `/api/billing/reconcile` | KST 기준 만료 Premium tier 정리 | `Authorization: Bearer CRON_SECRET_TOKEN` |

`/api/lotto/expect`는 `T_EXPECT_PICK.pick_expect`의 기본 10개를 항상 반환한다. 무료 발급행의 `pay_expect` 값은 `$$`이며, 유료 JSON이 저장된 경우에만 추가 20개를 뒤에 합쳐 기존 `{ status, count, lotto }` 형식으로 30개를 반환한다. 발급 후 주중에 구독이 취소되거나 만료되어도 저장된 유료 JSON은 그대로 제공하며, 다음 주차 발급 때 main-server가 최신 tier를 다시 적용한다.

`/api/users/register`는 유저 등록(`T_USER_INFO`) 및 인증 증명 소비가 성공한 직후, legacy main-server(`http://127.0.0.1:10907/lotto/1022`, 환경변수 `MAIN_SERVER_REGISTER_URL`로 override 가능)를 호출해 신규 가입 사용자의 초기 무료 예상번호 10개(`pick_expect`) 발급을 요청한다. main-server는 DB 저장은 건너뛰고 번호 발급만 수행하며, main-server 호출 실패는 회원가입 성공 응답에 영향을 주지 않는다.

`/api/billing/receipt`는 Premium tier 갱신을 커밋한 직후, 같은 Gabia VM 내부의 legacy main-server(`http://127.0.0.1:10907/lotto/1077`, 환경변수 `MAIN_SERVER_REISSUE_URL`로 override 가능)를 호출해 이번 주차의 유료 20개(`pay_expect`) 추가 발급을 요청한다. main-server 호출 실패는 이미 커밋된 tier 갱신이나 영수증 응답에 영향을 주지 않는다.

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
| 8700 | 이메일 인증코드 발송 제한 초과 |
| 8701 | 인증코드 불일치 또는 만료 |
| 8702 | 인증코드 검증 횟수 초과 |
| 8703 | 이메일 인증 증명 없음/만료/불일치·재사용·목적 불일치 |

## DB 테이블

- `T_USER_INFO` — 유저 정보 (`tier`: 0=FREE, 1=PREMIUM)
- `T_PURCHASES` — Google Play 구독 영수증
- `T_WINNER_NUM` — 로또 회차별 당첨 번호
- `T_EXPECT_PICK` — 예상번호 발급행 (`pick_expect`: 공통 10개 JSON, `pay_expect`: 무료는 `$$`, 유료 발급 시 추가 20개 JSON; 기존 `pick_count` 삭제)
- `T_RESULT_COMBI` — 로또 회차별 등수(1~5등) 당첨 조합 개수 및 전체 조합 개수(`combi_count`)

자세한 마이그레이션 내용은 [docs/MIGRATION.md](docs/MIGRATION.md) 참고.
