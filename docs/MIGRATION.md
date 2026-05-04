# Firestore → MySQL 마이그레이션 + 메인 백엔드 통합

## 배경

lotto-sub-backend를 Vercel → Gabia 클라우드(PM2)로 이전하고,
Firebase Firestore → MySQL DB 서버로 교체한다.
FCM(Firebase Cloud Messaging)은 Firebase Admin SDK를 통해 그대로 유지.
DB 서버에 이미 `T_USER_INFO` 테이블이 존재하며, 이를 기반으로 작업한다.

추가로, 기존 메인 백엔드(Lotto Protocol)의 유저 관련 API를 이 서버로 흡수한다.
Android 앱(fisherlotto)이 `/lotto/1022~1066`으로 호출하던 기능들이 대상이다.

---

## DB 서버에서 실행할 SQL

### 1. T_USER_INFO 컬럼 변경 및 fcm_token 추가

```sql
ALTER TABLE T_USER_INFO
  MODIFY COLUMN tier tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN fcm_token VARCHAR(512) DEFAULT NULL,
  ADD INDEX idx_fcm_token (fcm_token);
```

> `tier`: 0 = FREE, 1 = PREMIUM
> `idx_fcm_token` 인덱스 이유: `POST /api/fcm/token`에서 "동일 토큰을 가진 다른 유저 NULL 처리" 쿼리 성능용

### 2. T_PURCHASES 테이블 신규 생성

```sql
CREATE TABLE `T_PURCHASES` (
  `order_id`       varchar(255) NOT NULL,
  `product_id`     varchar(100) NOT NULL,
  `purchase_token` text         NOT NULL,
  `purchase_time`  bigint       NOT NULL,
  `auto_renewing`  tinyint(1)   NOT NULL DEFAULT 0,
  `email`          varchar(32)  DEFAULT NULL,
  `created_at`     datetime     DEFAULT current_timestamp(),
  PRIMARY KEY (`order_id`),
  INDEX idx_email (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## .env.local에 추가할 환경변수

```
MYSQL_HOST=<db-server-ip>
MYSQL_PORT=3306
MYSQL_USER=lotto_app
MYSQL_PASSWORD=<password>
MYSQL_DATABASE=lotto_sub
MYSQL_CONNECTION_LIMIT=10
```

> 기존 Firebase 변수(`FIREBASE_*`, `FCM_SEND_API_KEY`)는 FCM용으로 그대로 유지

---

## 구현 목록

### 패키지 설치

```bash
npm install mysql2
```

### 신규 생성 파일

| 파일 | 역할 | Lotto Protocol |
|---|---|---|
| `lib/db.ts` | mysql2 connection pool 싱글톤 | — |
| `app/api/users/register/route.ts` | `POST /api/users/register` — 유저 등록 | 1022 |
| `app/api/users/login/route.ts` | `POST /api/users/login` — 유저 조회/로그인 | 1033 |
| `app/api/users/route.ts` | `GET /api/users?email=xxx` — 유저 조회 (내부용) | — |
| `app/api/users/tier/route.ts` | `POST /api/users/tier` — tier 직접 변경 | 1055 |
| `app/api/users/withdraw/route.ts` | `POST /api/users/withdraw` — 회원탈퇴 | 1066 |
| `app/api/lotto/winning/route.ts` | `GET /api/lotto/winning?round=xxx` — 당첨 번호 조회 | 1044, 1000 |

### 수정 파일

| 파일 | 변경 내용 |
|---|---|
| `lib/firebaseAdmin.ts` | Firestore `db` export 제거, FCM `admin`만 유지 |
| `app/api/fcm/token/route.ts` | Firestore → MySQL (`T_USER_INFO.fcm_token` 업데이트) |
| `app/api/fcm/send/route.ts` | Firestore → MySQL (`T_USER_INFO`에서 `fcm_token` 조회) |
| `app/api/fcm/user/route.ts` | Firestore 삭제 → MySQL `fcm_token NULL` 처리 |
| `app/api/billing/receipt/route.ts` | Firestore → MySQL (`T_PURCHASES` 저장 + `T_USER_INFO` tier/valid_date 업데이트) |

---

## 응답 코드 (Lotto Protocol 호환)

Android 앱과의 호환을 위해 기존 Lotto Protocol 응답 코드를 유지한다.

| 코드 | 설명 |
|---|---|
| 8200 | 성공 |
| 8404 | 데이터 없음 |
| 8611 | 이메일 중복 |
| 8633 | 전화번호 중복 |
| 8655 | 유저 등록 오류 |
| 8677 | 요청 전문 오류 |
| 8699 | 유저 정보 없음 |

---

## 각 파일 변경 상세

### lib/db.ts (신규)

```typescript
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host:             process.env.MYSQL_HOST,
  port:             Number(process.env.MYSQL_PORT) || 3306,
  user:             process.env.MYSQL_USER,
  password:         process.env.MYSQL_PASSWORD,
  database:         process.env.MYSQL_DATABASE,
  connectionLimit:  Number(process.env.MYSQL_CONNECTION_LIMIT) || 10,
  waitForConnections: true,
  timezone: 'Z', // UTC 고정 (서버 KST 환경에서 datetime 오차 방지)
});

export default pool;
```

### lib/firebaseAdmin.ts

```typescript
// 제거: const db = admin.firestore();
// 변경: export { admin, db } → export { admin }
export { admin };
```

### app/api/fcm/token/route.ts

```typescript
// 동일 토큰을 가진 다른 유저의 토큰 NULL 처리 (기기 재사용 대응)
await pool.execute(
  'UPDATE T_USER_INFO SET fcm_token = NULL WHERE fcm_token = ? AND email != ?',
  [fcmToken, email]
);
// 해당 유저의 토큰 저장
await pool.execute(
  'UPDATE T_USER_INFO SET fcm_token = ? WHERE email = ?',
  [fcmToken, email]
);
```

### app/api/fcm/send/route.ts

```typescript
// Firestore 전체 조회 → MySQL 조회로 교체
const [rows] = await pool.execute<RowDataPacket[]>(
  'SELECT fcm_token FROM T_USER_INFO WHERE fcm_token IS NOT NULL'
);
const tokens: string[] = rows.map(row => row.fcm_token);
```

### app/api/fcm/user/route.ts

```typescript
// 유저 문서 전체 삭제 → fcm_token만 NULL 처리 (유저 행은 유지)
const [result] = await pool.execute<ResultSetHeader>(
  'UPDATE T_USER_INFO SET fcm_token = NULL WHERE email = ?',
  [email]
);
if (result.affectedRows === 0) return 404;
```

### app/api/billing/receipt/route.ts

```typescript
// T_PURCHASES 저장 (INSERT IGNORE: 중복 orderId는 무시 — 클라이언트 재시도 안전)
await pool.execute(
  `INSERT IGNORE INTO T_PURCHASES
     (order_id, product_id, purchase_token, purchase_time, auto_renewing, email)
   VALUES (?, ?, ?, ?, ?, ?)`,
  [orderId, productId, purchaseToken, purchaseTime, autoRenewing ? 1 : 0, email ?? null]
);

// T_USER_INFO tier/valid_date 업데이트 (email 있을 때만)
if (email && expiryTimeMillis) {
  await pool.execute(
    `UPDATE T_USER_INFO
     SET tier = 1, valid_date = DATE(FROM_UNIXTIME(? / 1000))
     WHERE email = ?`,
    [expiryTimeMillis, email]
  );
}
```

### app/api/users/register/route.ts (신규 — 1022)

```typescript
// POST /api/users/register
// body: { name, email, birth, phone }
// 이메일 중복 → 8611, 전화번호 중복 → 8633, DB오류 → 8655, 필드 누락 → 8677

const [byEmail] = await pool.execute<RowDataPacket[]>(
  'SELECT user_index FROM T_USER_INFO WHERE email = ? LIMIT 1', [email]
);
if (byEmail.length > 0) return { status: '8611' };

const [byPhone] = await pool.execute<RowDataPacket[]>(
  'SELECT user_index FROM T_USER_INFO WHERE phone = ? LIMIT 1', [phone]
);
if (byPhone.length > 0) return { status: '8633' };

await pool.execute(
  'INSERT INTO T_USER_INFO (email, name, phone, birth) VALUES (?, ?, ?, ?)',
  [email, name, phone, birth ?? null]
);
return { status: '8200' };
```

### app/api/users/login/route.ts (신규 — 1033)

```typescript
// POST /api/users/login
// body: { email, phone }
// 성공 시 유저 정보 + 8200 반환, 없으면 8699

const [rows] = await pool.execute<RowDataPacket[]>(
  'SELECT * FROM T_USER_INFO WHERE email = ? AND phone = ? LIMIT 1',
  [email, phone]
);
if (rows.length === 0) return { status: '8699' };

const u = rows[0];
return {
  status: '8200',
  userIndex: u.user_index,
  email: u.email,
  name: u.name,
  birth: u.birth,
  phone: u.phone,
  tier: u.tier,
  validDate: u.valid_date,
};
```

### app/api/users/route.ts (신규 — 내부 조회)

```typescript
// GET /api/users?email=xxx
// snake_case DB 컬럼 → camelCase 응답으로 매핑
return {
  userIndex, email, name, birth, phone,
  tier, validDate, validCount, address,
  fcmToken, createdAt
};
```

### app/api/users/tier/route.ts (신규 — 1055)

```typescript
// POST /api/users/tier
// body: { email, phone, isPremium: boolean }
// 유저 확인 후 tier 업데이트 (boolean 그대로 저장: 1 / 0)

const [rows] = await pool.execute<RowDataPacket[]>(
  'SELECT user_index FROM T_USER_INFO WHERE email = ? AND phone = ? LIMIT 1',
  [email, phone]
);
if (rows.length === 0) return { status: '8699' };

await pool.execute(
  'UPDATE T_USER_INFO SET tier = ? WHERE email = ?',
  [isPremium ? 1 : 0, email]
);
return { status: '8200' };
```

### app/api/users/withdraw/route.ts (신규 — 1066)

```typescript
// POST /api/users/withdraw
// body: { email, phone }
// 회원탈퇴: T_USER_INFO 행 삭제 (hard delete)
// → 이후 로그인 시 조회 불가 → 8699 반환으로 자연 차단
// (T_PURCHASES 이력은 email 기준 별도 보존)

const [result] = await pool.execute<ResultSetHeader>(
  'DELETE FROM T_USER_INFO WHERE email = ? AND phone = ?',
  [email, phone]
);
if (result.affectedRows === 0) return { status: '8699' };
return { status: '8200' };
```

### app/api/lotto/winning/route.ts (신규 — 1044, 1000)

```typescript
// GET /api/lotto/winning?round=1100
// 동행복권 공개 API 프록시
// https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={round}

const round = searchParams.get('round');
if (!round) return { status: '8677' };

const res = await fetch(
  `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`
);
const data = await res.json();
if (data.returnValue !== 'success') return { status: '8404' };
return { status: '8200', ...data };
```

---

## 검증 순서

1. DB 서버에서 위의 SQL 2개 실행
2. `.env.local`에 `MYSQL_*` 변수 설정 후 `npm run dev`
3. Smoke test:
   - `POST /api/users/register` `{ name, email, phone, birth }` → 8200 / 8611 / 8633 확인
   - `POST /api/users/login` `{ email, phone }` → 8200 + 유저 정보 반환 확인
   - `GET /api/users?email=xxx` → 유저 조회 확인
   - `POST /api/users/tier` `{ email, phone, tier }` → DB tier 변경 확인
   - `POST /api/users/withdraw` `{ email, phone }` → 행 삭제 후 재로그인 시 8699 확인
   - `GET /api/lotto/winning?round=1100` → 동행복권 API 프록시 확인
   - `POST /api/fcm/token` `{ email, fcmToken }` → `fcm_token` 컬럼 업데이트 확인
   - `POST /api/fcm/send` `{ title, body }` + `x-api-key` → FCM 실제 전송 확인
   - `POST /api/billing/receipt` `{ orderId, ... }` → `T_PURCHASES` 저장 + `T_USER_INFO` tier 업데이트 확인
   - `DELETE /api/fcm/user` `{ email }` → `fcm_token` NULL 처리 확인
