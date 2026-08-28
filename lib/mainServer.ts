// lib/mainServer.ts
// 동일 Gabia VM 내부의 레거시 main-server 호출 (loopback 전용, 외부 노출 없음)

const ISSUE_URL =
  process.env.MAIN_SERVER_REISSUE_URL || 'http://127.0.0.1:10907/lotto/1077';
const REQUEST_TIMEOUT_MS = 5000;

// `MAIN_SERVER_REISSUE_URL`은 배포 환경 호환을 위해 이름을 유지한다.
// Free -> Premium 전환 직후 호출해 이번 주차 유료 예상번호 발급 상태를 동기화한다.
// main-server가 불가하거나 실패해도 이미 커밋된 tier 갱신에는 영향을 주지 않는다.
export async function requestExpectNumberIssuance(
  email: string,
  phone: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(ISSUE_URL, {
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
