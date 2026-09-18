export interface DhLotteryRow {
  winType0: number;
  winType1: number;
  winType2: number;
  winType3: number;
  gmSqNo: number;
  ltEpsd: number;
  tm1WnNo: number;
  tm2WnNo: number;
  tm3WnNo: number;
  tm4WnNo: number;
  tm5WnNo: number;
  tm6WnNo: number;
  bnsWnNo: number;
  ltRflYmd: string;
  rnk1WnNope: number;
  rnk1WnAmt: number;
  rnk1SumWnAmt: number;
  rnk2WnNope: number;
  rnk2WnAmt: number;
  rnk2SumWnAmt: number;
  rnk3WnNope: number;
  rnk3WnAmt: number;
  rnk3SumWnAmt: number;
  rnk4WnNope: number;
  rnk4WnAmt: number;
  rnk4SumWnAmt: number;
  rnk5WnNope: number;
  rnk5WnAmt: number;
  rnk5SumWnAmt: number;
  sumWnNope: number;
  rlvtEpsdSumNtslAmt: number;
  wholEpsdSumNtslAmt: number;
  excelRnk: string;
}

export interface DhLotteryApiResponse {
  resultCode: string | null;
  resultMessage: string | null;
  data: {
    list: DhLotteryRow[];
  } | null;
}

/**
 * T_WINNER_NUM 테이블 스키마에 1:1 매핑되는 로또 당첨 데이터 인터페이스.
 * 추후 DB 갱신 시 이 인터페이스의 값을 그대로 INSERT 문에 바인딩할 수 있습니다.
 */
export interface WinnerNumberRecord {
  lottoRound: number;       // lotto_round (smallint)
  pickDate: string;         // pick_date (date: YYYY-MM-DD)
  no1: string;              // no1 (char(2), '01'~'45')
  no2: string;              // no2
  no3: string;              // no3
  no4: string;              // no4
  no5: string;              // no5
  no6: string;              // no6
  bonus: string;            // bonus (char(2), '01'~'45')
  firstCount: string;       // 1_count (varchar(16), e.g. '18')
  firstMoney: string;       // 1_money (varchar(32), e.g. '1,628,391,980원')
  secondCount: string;      // 2_count
  secondMoney: string;      // 2_money
  thirdCount: string;       // 3_count
  thirdMoney: string;       // 3_money
  fourthCount: string;      // 4_count
  fourthMoney: string;      // 4_money
  fifthCount: string;       // 5_count
  fifthMoney: string;       // 5_money
  fullText: string;         // full_text (varchar(18), e.g. '07,13,16,23,24,43')
}

const DHLOTTERY_API_URL = 'https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do';

/**
 * 숫자를 2자리 0 채움 문자열로 포맷팅 (07, 09 등)
 */
function pad2(num: number): string {
  return String(num).padStart(2, '0');
}

/**
 * 숫자를 천 단위 콤마 문자열로 변환 (1,234)
 */
function formatCount(num: number): string {
  return Number(num).toLocaleString('ko-KR');
}

/**
 * 금액을 천 단위 콤마 + '원' 문자열로 변환 (1,234원)
 * DB의 T_WINNER_NUM.*_money 규격 및 UTF-8 한글 처리
 */
function formatMoney(amount: number): string {
  return `${Number(amount).toLocaleString('ko-KR')}원`;
}

/**
 * YYYYMMDD 형태의 날짜 문자열을 YYYY-MM-DD 포맷으로 변환
 */
function formatDate(rawDate: string): string {
  if (rawDate && rawDate.length === 8) {
    return `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
  }
  return rawDate;
}

/**
 * 동행복권의 최신 당첨정보를 T_WINNER_NUM 규격으로 변환합니다.
 * 집계가 아직 완료되지 않았거나 데이터가 없으면 null을 반환합니다.
 */
export async function fetchLatestDhLotteryWinningNumber(): Promise<WinnerNumberRecord | null> {
  // 동행복권 API는 srchLtEpsd를 빈 값으로 전달할 때 최신 회차를 반환합니다.
  const url = `${DHLOTTERY_API_URL}?srchLtEpsd=`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000), // 10초 타임아웃
  });

  if (!response.ok) {
    throw new Error(`동행복권 API HTTP 오류: ${response.status}`);
  }

  const json: DhLotteryApiResponse = await response.json();
  const list = json.data?.list;

  if (!list || list.length === 0) {
    return null;
  }

  const item = list[0];

  if (!Number.isInteger(item.ltEpsd) || item.ltEpsd <= 0 || !/^\d{8}$/.test(item.ltRflYmd)) {
    throw new Error('동행복권 API 회차 또는 추첨일 형식이 올바르지 않습니다.');
  }

  // 당첨 번호 유효성 검사 (1~45 범위)
  const hasValidNumbers = [
    item.tm1WnNo, item.tm2WnNo, item.tm3WnNo,
    item.tm4WnNo, item.tm5WnNo, item.tm6WnNo,
    item.bnsWnNo
  ].every(n => typeof n === 'number' && n >= 1 && n <= 45);

  if (!hasValidNumbers) {
    throw new Error('동행복권 API 당첨번호가 올바르지 않습니다.');
  }

  const numbers = [
    item.tm1WnNo, item.tm2WnNo, item.tm3WnNo,
    item.tm4WnNo, item.tm5WnNo, item.tm6WnNo,
    item.bnsWnNo,
  ];
  if (new Set(numbers).size !== numbers.length) {
    throw new Error('동행복권 API 당첨번호에 중복이 있습니다.');
  }

  const winnerCounts = [
    item.rnk1WnNope, item.rnk2WnNope, item.rnk3WnNope,
    item.rnk4WnNope, item.rnk5WnNope, item.sumWnNope,
  ];
  const prizeAmounts = [
    item.rnk1WnAmt, item.rnk2WnAmt, item.rnk3WnAmt,
    item.rnk4WnAmt, item.rnk5WnAmt, item.rlvtEpsdSumNtslAmt,
  ];
  if (!winnerCounts.every((value) => Number.isInteger(value) && value >= 0)
    || !prizeAmounts.every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error('동행복권 API 당첨 집계가 올바르지 않습니다.');
  }

  // 집계 완료 검증:
  // 1등 당첨자가 없는 회차(이월)의 경우 rnk1WnNope/rnk1WnAmt가 0이 될 수 있으므로,
  // 고정 당첨금인 5등(rnk5WnNope) 및 총 당첨자 수(sumWnNope), 판매액(rlvtEpsdSumNtslAmt)이 0보다 큰지로 집계 완료를 판단합니다.
  const isAggregated = item.sumWnNope > 0
    && item.rnk5WnNope > 0
    && item.rlvtEpsdSumNtslAmt > 0;
  if (!isAggregated) {
    return null;
  }

  const no1 = pad2(item.tm1WnNo);
  const no2 = pad2(item.tm2WnNo);
  const no3 = pad2(item.tm3WnNo);
  const no4 = pad2(item.tm4WnNo);
  const no5 = pad2(item.tm5WnNo);
  const no6 = pad2(item.tm6WnNo);
  const bonus = pad2(item.bnsWnNo);
  const fullText = `${no1},${no2},${no3},${no4},${no5},${no6}`;

  return {
    lottoRound: item.ltEpsd,
    pickDate: formatDate(item.ltRflYmd),
    no1,
    no2,
    no3,
    no4,
    no5,
    no6,
    bonus,
    firstCount: formatCount(item.rnk1WnNope),
    firstMoney: formatMoney(item.rnk1WnAmt),
    secondCount: formatCount(item.rnk2WnNope),
    secondMoney: formatMoney(item.rnk2WnAmt),
    thirdCount: formatCount(item.rnk3WnNope),
    thirdMoney: formatMoney(item.rnk3WnAmt),
    fourthCount: formatCount(item.rnk4WnNope),
    fourthMoney: formatMoney(item.rnk4WnAmt),
    fifthCount: formatCount(item.rnk5WnNope),
    fifthMoney: formatMoney(item.rnk5WnAmt),
    fullText,
  };
}
