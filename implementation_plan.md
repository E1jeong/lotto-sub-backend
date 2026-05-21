# 결제 트랜잭션 보강, 구독 처리 예외 대응 및 API 규격 일치화 구현 계획

구글 결제 영수증 등록 시 데이터의 무결성을 보장하기 위해 트랜잭션을 도입하고, 이전 구독 만료 알림에 의해 최신 활성 구독이 무단 해지되는 예외 케이스를 안전하게 우회하도록 비즈니스 로직을 강화합니다. 아울러 FCM 및 결제 관련 API 응답을 메인 서버 로또 프로토콜에 맞게 일치시키고 보안 처리를 보완합니다.

---

## User Review Required

> [!IMPORTANT]
> **1. 안드로이드 앱의 티어 업그레이드 호출 API 검증**
> - 현재 앱 결제 후 서버에 등급(tier) 상승을 알리기 위해 호출하는 API가 `/api/users/tier`인지 또는 결제 영수증 검증 API인 `/api/billing/receipt`인지 앱 소스코드를 확인해야 합니다.
> - 만약 앱이 `/api/users/tier`를 사용하고 있다면, 유저 등급 상승 시 만료 기간인 `valid_date`가 누락되는 현상이 발생하므로 이 API 내에 `valid_date`를 특정 미래 날짜(예: `'9999-12-31'`)로 셋팅해 주는 처리가 수반되어야 합니다.

> [!WARNING]
> **2. 타임존 관련 날짜 직렬화 검토**
> - 서버는 MySQL의 `DATE` 타입을 자바스크립트 Date 객체로 해석하여 JSON 직렬화(ISO 8601 UTC 기준 문자열)하여 반환합니다.
> - 안드로이드 클라이언트 측에서 이 문자열을 파싱할 때 타임존 변환 오차로 인해 하루 차이가 발생하는 이슈를 이미 단말 앱 내에서 보정해 두었는지 검토가 필요합니다. 앱 쪽에서 처리가 되어 있지 않다면 서버에서 문자열(`YYYY-MM-DD`)로 강제 포맷팅하여 응답하도록 보강해야 합니다.

---

## Open Questions

> [!NOTE]
> **존재하지 않는 유저 이메일의 영수증 처리 방침**
> - `/api/billing/receipt`를 통해 영수증이 등록될 때, 전달받은 `email`이 `T_USER_INFO` 테이블에 존재하지 않는 경우 어떻게 처리할 것인지에 대한 정의입니다.
> - **제안:** 존재하지 않는 이메일인 경우 영수증을 등록하지 않고 롤백한 후 로또 프로토콜 에러 코드인 `8699` (유저 정보 없음)를 반환하도록 수정하는 것이 비즈니스 무결성에 안전합니다. 이에 동의하시는지 확인을 요청드립니다.

---

## Proposed Changes

### Billing & FCM Components

구글 영수증 검증, 유저 티어 강등 예외 처리 및 웹훅 보안 보강을 수행합니다.

---

#### [MODIFY] [receipt/route.ts](file:///c:/Users/Unionbiometrics/Desktop/dev/1.project/lotto-sub-backend/app/api/billing/receipt/route.ts)
- 영수증 처리 시 DB 트랜잭션을 적용합니다 (`connection.beginTransaction()`, `connection.commit()`, `connection.rollback()`).
- 영수증 등록 작업 도중 커넥션 점유 시간을 최소화하기 위해, 구글 API 연동 함수 `getSubscriptionDetails` 호출은 트랜잭션 외부에서 먼저 수행하도록 분리합니다.
- 트랜잭션 내부 동작 순서:
  1. 전달받은 `email`의 유저가 `T_USER_INFO`에 존재하는지 조회합니다. 존재하지 않는 경우 `8699` 응답 및 트랜잭션을 롤백합니다.
  2. `order_id` 중복 여부를 `FOR UPDATE` 옵션(배타적 락)으로 조회합니다.
  3. 만약 이미 영수증이 등록되어 있다면, 해당 유저의 등급이 현재 프리미엄(`tier = 1`)인지 확인합니다. 만약 유저 상태가 누락된 경우(`tier = 0`), 티어를 `1` 및 `valid_date`를 업데이트해 주는 자가 치유(Auto-heal) 로직을 실행한 후 커밋합니다.
  4. 영수증 정보가 신규인 경우 `T_PURCHASES`에 영수증 정보를 삽입하고 `T_USER_INFO`의 `tier`와 `valid_date`를 업데이트한 후 커밋합니다.
- 응답 구조를 로또 프로토콜 규격(`status: '8200'` 등)으로 전면 전환합니다.

#### [MODIFY] [pubsub/route.ts](file:///c:/Users/Unionbiometrics/Desktop/dev/1.project/lotto-sub-backend/app/api/billing/pubsub/route.ts)
- `PUBSUB_SECRET_TOKEN` 환경변수가 주입되어 있지 않거나 비어있는 상황에서 빈 토큰 요청(`?token=`)이 들어왔을 때 우회되는 보안 취약점을 완벽하게 보완합니다.
- 웹훅 동작 및 FCM 알림 등 비동기 사이드 이펙트 오류를 안전하게 처리하고 응답 포맷을 프로토콜 코드에 맞춰 조정합니다.

#### [MODIFY] [googlePlayApi.ts](file:///c:/Users/Unionbiometrics/Desktop/dev/1.project/lotto-sub-backend/lib/googlePlayApi.ts)
- 구글 플레이 RTDN 만료 알림에 의해 활성 구독이 무단 취소되지 않도록 보호하는 로직을 추가합니다.
- `updateUserTierByToken` 내에서 프리미엄 해제(`tier = 0`) 요청 시, 만료 알림이 온 토큰이 유저가 보유한 **가장 최근의 결제 토큰**인지 검증합니다.
  ```sql
  SELECT purchase_token FROM T_PURCHASES WHERE email = ? ORDER BY purchase_time DESC LIMIT 1
  ```
- 가장 최근의 결제 토큰이 현재 만료 처리를 진행하는 토큰과 다를 경우(즉, 다른 새로운 구독 토큰이 존재하는 경우) 강등 업데이트를 수행하지 않고 조기 리턴시킵니다.

#### [MODIFY] [subscription/route.ts](file:///c:/Users/Unionbiometrics/Desktop/dev/1.project/lotto-sub-backend/app/api/billing/subscription/route.ts)
- 조회 응답 및 에러 처리를 메인 서버 프로토콜 규격(`status: '8200'`, `'8677'`, `'8655'`)으로 통일합니다.

---

### User & FCM Push Components

FCM 토큰 관련 API 응답 규격을 일치시키고 수동 티어 관리 시 만료일 정합성을 맞춥니다.

---

#### [MODIFY] [token/route.ts](file:///c:/Users/Unionbiometrics/Desktop/dev/1.project/lotto-sub-backend/app/api/fcm/token/route.ts)
- FCM 토큰 등록 시 반환 규격을 메인 서버 프로토콜 규격(`status: '8200'`, `'8677'`, `'8699'`, `'8655'`)으로 변경합니다.

#### [MODIFY] [user/route.ts](file:///c:/Users/Unionbiometrics/Desktop/dev/1.project/lotto-sub-backend/app/api/fcm/user/route.ts)
- FCM 토큰 삭제 시 반환 규격을 메인 서버 프로토콜 규격(`status: '8200'`, `'8677'`, `'8699'`, `'8655'`)으로 변경합니다.

#### [MODIFY] [tier/route.ts](file:///c:/Users/Unionbiometrics/Desktop/dev/1.project/lotto-sub-backend/app/api/users/tier/route.ts)
- 유저 티어 변경 시 `valid_date` 정보도 일치하도록 강제 세팅합니다.
  - `isPremium: true` 설정 시: 만료일을 반영구적인 미래 시점(`'9999-12-31'`)으로 업데이트합니다.
  - `isPremium: false` 설정 시: 만료일을 오늘 날짜(`CURDATE()`)로 맞추어 권한을 즉시 정지시킵니다.

---

## Verification Plan

### Automated Tests
- 코드 변경 이후 Next.js 빌드가 에러 없이 정상적으로 수행되는지 검증합니다.
  ```bash
  npm run lint
  npm run build
  ```

### Manual Verification
- 테스트 툴(curl, Postman 또는 HTTP Client)을 이용하여 다음 시나리오를 모의 요청하여 상태값을 검증합니다.
  1. **트랜잭션 검증:** `/api/billing/receipt`에서 영수증을 신규 삽입할 때 DB 에러를 강제 유발시켜 `T_PURCHASES`와 `T_USER_INFO` 양쪽 모두 정상 롤백(데이터 미반영)되는지 확인합니다.
  2. **자가 치유(Auto-heal) 검증:** 영수증은 이미 존재하지만 유저 테이블은 프리미엄이 유실된 상태를 가정하고, 중복 영수증 조회를 요청했을 때 유저 등급이 프리미엄으로 복구 처리되는지 확인합니다.
  3. **구독 복수 구매 검증:** 임의의 만료 토큰과 신규 결제 토큰이 동시에 들어갔을 때, 이전 만료 토큰에 의해 유저가 강등되지 않는지 `T_USER_INFO` 결과를 확인합니다.
  4. **보안 토큰 및 프로토콜 규격 검증:** 인증 토큰을 누락시키고 호출해 401 권한 차단 여부를 테스트하며, FCM 토큰 등록/삭제 API 호출 시 `{ status: "8200" }` 형태로 통일성 있게 리턴되는지 최종 확인합니다.
