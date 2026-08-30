// lib/mainServer.ts
// 동일 Gabia VM 내부의 레거시 main-server 호출 (loopback 전용, 외부 노출 없음)

const REISSUE_URL =
  process.env.MAIN_SERVER_REISSUE_URL || 'http://127.0.0.1:10907/lotto/1077';
const REGISTER_URL =
  process.env.MAIN_SERVER_REGISTER_URL || 'http://127.0.0.1:10907/lotto/1022';
const REQUEST_TIMEOUT_MS = 5000;

// `MAIN_SERVER_REISSUE_URL`은 배포 환경 호환을 위해 이름을 유지한다.
// Free -> Premium 전환 직후 호출해 이번 주차 유료 예상번호(20개) 발급 상태를 동기화한다. (1077)
// main-server가 불가하거나 실패해도 이미 커밋된 tier 갱신에는 영향을 주지 않는다.
export async function requestExpectNumberIssuance(
  email: string,
  phone: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(REISSUE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || data?.status !== '8200') {
      console.error('[main-server] 1077 예상번호 발급 동기화 실패:', data?.status ?? res.status);
    }
  } catch (e) {
    console.error('[main-server] 1077 호출 오류:', e);
  } finally {
    clearTimeout(timeout);
  }
}

// 회원가입 성공 직후 호출해 신규 가입 사용자의 초기 무료 예상번호(10개) 발급을 요청한다. (1022)
// 메인 서버는 DB 저장은 건너뛰고 무료 번호 발급만 수행한다.
// main-server가 불가하거나 실패해도 이미 완료된 회원가입 성공에는 영향을 주지 않는다.
export async function requestInitialExpectNumberIssuance(params: {
  name: string;
  email: string;
  phone: string;
  birth?: string | null;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.name,
        email: params.email,
        phone: params.phone,
        birth: params.birth ?? '',
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || data?.status !== '8200') {
      console.error('[main-server] 1022 무료 예상번호 초기 발급 실패:', data?.status ?? res.status);
    }
  } catch (e) {
    console.error('[main-server] 1022 호출 오류:', e);
  } finally {
    clearTimeout(timeout);
  }
}
