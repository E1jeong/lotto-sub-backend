// lib/mainServer.ts
// 동일 Gabia VM 내부의 레거시 main-server 호출 (loopback 전용, 외부 노출 없음)

const REISSUE_URL =
  process.env.MAIN_SERVER_REISSUE_URL || 'http://127.0.0.1:10907/lotto/1077';
const REQUEST_TIMEOUT_MS = 5000;

export interface ReissueResult {
  reissued: boolean;
}

// Free -> Premium 전환 직후 호출. 이번 주차 예상번호 세트를 10개에서 30개로 교체 요청한다.
// main-server가 불가하거나 실패해도 이미 커밋된 tier 갱신에는 영향을 주지 않는다.
export async function requestExpectNumberReissue(
  email: string,
  phone: string,
): Promise<ReissueResult> {
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
      console.error('[main-server] 1077 재발급 실패:', data?.status ?? res.status);
      return { reissued: false };
    }

    return { reissued: data.reissued === true };
  } catch (e) {
    console.error('[main-server] 1077 호출 오류:', e);
    return { reissued: false };
  } finally {
    clearTimeout(timeout);
  }
}
