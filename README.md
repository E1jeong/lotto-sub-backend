# 어부로또 서브 백엔드

어부로또(FisherLotto) Android 앱의 서브 백엔드 서버입니다.
Next.js App Router 기반 API 서버로, 가비아 클라우드에서 PM2로 운영합니다.

## 문서

제품 요구사항·아키텍처·ADR은 Obsidian의 `Dev/Project/Personal/lotto-sub-backend` 위키에서 관리합니다. 위치는 [AGENTS.md](AGENTS.md)를 따라 확인합니다. [DB 마이그레이션 문서](docs/MIGRATION.md)는 코드 버전에 대응하는 DDL과 적용 전후 검증 절차를 유지합니다. 기존 PRD·아키텍처·ADR 문서는 위키에 통합한 뒤 삭제했으며, ADR 번호는 위키의 결정 기록을 가리킵니다.

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

# 메인 서버 루프백 연동 (기본값: Gabia VM 내부 포트 10907)
# MAIN_SERVER_REGISTER_URL=http://127.0.0.1:10907/lotto/1022
# MAIN_SERVER_REISSUE_URL=http://127.0.0.1:10907/lotto/1077
```

## API 엔드포인트

### 사용자

| 메서드 | 경로 | 설명 | 비고 |
|--------|------|------|------|
| POST | `/api/users/register` | 이메일 인증 후 사용자 등록 | `{ name, email, phone, birth, verificationToken }` |
| POST | `/api/users/recover` | 이메일 인증 기반 계정 복구 | `{ email, phone, verificationToken }` → 최소 프로필 및 `tier: "FREE" \| "PREMIUM"` |
| POST | `/api/users/login` | 로그인 / 사용자 조회 | `{ email, phone }` |
| POST | `/api/users/withdraw` | 회원탈퇴 | `{ email, phone }` — `T_USER_INFO` 행 삭제 |

### 이메일 인증

| 메서드 | 경로 | 설명 | 비고 |
|--------|------|------|------|
| POST | `/api/email/send-code` | 6자리 인증코드 발송 | `{ email, purpose }`, `purpose`는 `registration` 또는 `recovery`, 코드 유효기간 5분 |
| POST | `/api/email/verify-code` | 인증코드 검증 | `{ email, code, purpose }` → `{ status, verificationToken }` |

`purpose`는 모든 이메일 인증 요청에서 필수입니다. 가입 화면은 `registration`, 계정 복구 화면은 `recovery`를 명시해야 합니다. 동일 이메일 기준 10분 윈도우 내 최대 5회 발송 가능하며, 검증 5회 실패 시 해당 코드는 차단됩니다(8702). `verificationToken`은 발급 목적과 동일한 `register` 또는 `recover` 요청에 한 번만 사용할 수 있습니다. 서버는 원문 대신 SHA-256 해시를 단일 PM2 프로세스 메모리에 최대 30분 보관하고, 검증 성공 시 즉시 폐기합니다. 앱은 이 값을 화면 상태에만 보관하며 로그인 토큰으로 사용하지 않습니다.

> 등급 변경 전용 엔드포인트는 없습니다. `T_USER_INFO.tier`/`valid_date`는 Google Play 검증을 거친 `/api/billing/receipt`와 `/api/billing/pubsub`, 그리고 만료 정리를 위한 `/api/billing/reconcile`에서만 갱신합니다 (ADR-009, ADR-015).

### 로또

| 메서드 | 경로 | 설명 | 비고 |
|--------|------|------|------|
| GET | `/api/lotto/winning` | 당첨 번호 조회 (DB 기반) | `?round=1100` (0=최신) |
| GET | `/api/lotto/fetch-winning` | 동행복권 신규 API 실시간 당첨 정보 조회 및 검증 | `?round=1100` (DB INSERT 미수행, ADR-019) |
| POST | `/api/lotto/expect` | 예상 번호 조회 | `{ email, phone }` → 무료 발급행 10개, 유료 발급행 30개 |
| GET | `/api/lotto/stats` | 회차별 등수 조합 통계 조회 | `?round=1100` (0=최신) |

### 푸시 알림(FCM)

| 메서드 | 경로 | 설명 | 비고 |
|--------|------|------|------|
| POST | `/api/fcm/token` | FCM 토큰 등록 | `{ email, fcmToken }` → `{ message }` |
| DELETE | `/api/fcm/user` | FCM 토큰 삭제 | `{ email }` → `{ message }` |
| POST | `/api/fcm/send` | 전체 푸시 발송 | `{ title, body }` + `x-api-key` 헤더 필요 → `{ message, totalTokens, sent, failed }` |

### 결제

| 메서드 | 경로 | 설명 | 비고 |
|--------|------|------|------|
| POST | `/api/billing/receipt` | Google Play 영수증 검증 및 저장 | `{ orderId, productId, purchaseToken, email }` → `{ success, message, ... }` |
| POST | `/api/billing/subscription` | 구독 상태 조회 | `{ purchaseToken }` → `{ success, isEntitled, ... }` |
| POST | `/api/billing/pubsub` | RTDN Pub/Sub 수신 웹훅 | `?token=PUBSUB_SECRET_TOKEN` → `{ ok: true }` |
| POST | `/api/billing/reconcile` | 한국 표준시(KST) 만료 프리미엄 등급 정리 | `Authorization: Bearer CRON_SECRET_TOKEN` → `{ ok: true, demoted }` |

`/api/lotto/expect`는 `T_EXPECT_PICK.pick_expect`의 기본 10개를 항상 반환합니다. 무료 발급행의 `pay_expect` 값은 `$$`이며, 유료 JSON이 저장된 경우에만 추가 20개를 뒤에 합쳐 기존 `{ status, count, lotto }` 형식으로 30개를 반환합니다. 발급 후 주중에 구독이 취소되거나 만료되어도 저장된 유료 JSON은 그대로 제공하며, 다음 주차 발급 때 메인 서버가 최신 등급을 다시 적용합니다.

`/api/users/register`는 사용자 등록(`T_USER_INFO`) 및 인증 증명 소비가 성공한 직후, 기존 메인 서버(`http://127.0.0.1:10907/lotto/1022`, 환경변수 `MAIN_SERVER_REGISTER_URL`로 주소 변경 가능)를 호출합니다(`{ name, email, phone, birth }`). `T_USER_INFO`는 서브백엔드가 이미 저장했으므로 1022의 남은 역할은 두 번째 사용자 저장이 아니라 초기 무료 10세트의 공유 `T_EXPECT_PICK.pick_expect` 할당입니다. 소유자 확인 계약상 메인 서버가 이를 생성·저장하지만, 메인 서버 소스와 런타임은 아직 검증되지 않았습니다. 서브백엔드는 응답 번호를 사용하거나 저장하지 않고 HTTP 성공과 `{ status: "8200" }`만 확인하며, 호출 실패는 회원가입 성공 응답 `{ status: "8200" }`에 영향을 주지 않습니다(5초 타임아웃 및 격리된 `try/catch`).

`/api/billing/receipt`는 Google Play `subscriptionsv2`로 자격을 검증하고, 트랜잭션 커밋으로 신규 구매가 확인된 경우(`isNewPurchase`)에만 같은 가비아 가상 머신 내부의 기존 메인 서버(`http://127.0.0.1:10907/lotto/1077`, 환경변수 `MAIN_SERVER_REISSUE_URL`로 주소 변경 가능)를 호출해 이번 주차의 유료 20개(`pay_expect`) 추가 발급을 요청합니다(`{ email, phone }`). 메인 서버 호출 실패는 이미 커밋된 등급 갱신이나 영수증 응답에 영향을 주지 않습니다.

## 응답 규격 및 상태 코드

### 1. 사용자·이메일 인증·로또 API (Lotto Protocol)

클라이언트 호환을 위해 JSON body 내 커스텀 `status` 문자열/숫자를 반환합니다.

| 코드 | 설명 |
|------|------|
| 8200 | 성공 |
| 8404 | 데이터 없음 |
| 8611 | 이메일 중복 |
| 8633 | 전화번호 중복 |
| 8655 | 서버/DB 오류 |
| 8677 | 요청 필드 오류 |
| 8699 | 사용자 정보 없음 |
| 8700 | 이메일 인증코드 발송 제한 초과 (10분 창 5회) |
| 8701 | 인증코드 불일치 또는 만료 |
| 8702 | 인증코드 검증 횟수 초과 (5회 실패 시 차단) |
| 8703 | 이메일 인증 증명 없음/만료/불일치·재사용·목적 불일치 |

### 2. 결제 및 FCM API

표준 HTTP 상태 코드와 상황에 따른 JSON 객체를 반환합니다:
- **결제 API (`/api/billing/*`)**: HTTP 200/400/401/404/409/500 상태 코드와 `{ success, message, ... }`, `{ ok: true, demoted }` 등 사용.
- **FCM API (`/api/fcm/*`)**: HTTP 200/400/401/404/500 상태 코드와 `{ message }` 또는 `{ error }` 사용.

## 데이터베이스 테이블

- `T_USER_INFO` — 사용자 정보 (`tier`: 0=무료, 1=프리미엄, `valid_date`, `fcm_token`)
- `T_PURCHASES` — Google Play 구독 영수증 (`purchase_token_sha256` 유니크 인덱스)
- `T_WINNER_NUM` — 로또 회차별 당첨 번호
- `T_EXPECT_PICK` — 예상번호 발급행 (`pick_expect`: 공통 10개 JSON, `pay_expect`: 무료는 `$$`, 유료 발급 시 추가 20개 JSON; 기존 `pick_count` 삭제)
- `T_RESULT_COMBI` — 로또 회차별 등수(1~5등) 당첨 조합 개수 및 전체 조합 개수(`combi_count`)

자세한 내용은 [DB 마이그레이션 문서](docs/MIGRATION.md)를 참고하세요.
