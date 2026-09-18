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
 * 동행복권 신규 API에서 특정 회차 당첨정보를 가져와 T_WINNER_NUM 규격으로 변환합니다.
 * 집계가 아직 완료되지 않았거나(1등 당첨금/인원 <= 0) 데이터가 없으면 null을 반환합니다.
 *
 * [추후 DB 저장 시 참고]
 * ```typescript
 * await pool.execute(
 *   `INSERT INTO T_WINNER_NUM (
 *     lotto_round, pick_date, no1, no2, no3, no4, no5, no6, bonus,
 *     \`1_count\`, \`1_money\`, \`2_count\`, \`2_money\`,
 *     \`3_count\`, \`3_money\`, \`4_count\`, \`4_money\`,
 *     \`5_count\`, \`5_money\`, full_text
 *   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
 *   ON DUPLICATE KEY UPDATE
 *     pick_date = VALUES(pick_date),
 *     no1 = VALUES(no1), no2 = VALUES(no2), no3 = VALUES(no3),
 *     no4 = VALUES(no4), no5 = VALUES(no5), no6 = VALUES(no6),
 *     bonus = VALUES(bonus),
 *     \`1_count\` = VALUES(\`1_count\`), \`1_money\` = VALUES(\`1_money\`),
 *     \`2_count\` = VALUES(\`2_count\`), \`2_money\` = VALUES(\`2_money\`),
 *     \`3_count\` = VALUES(\`3_count\`), \`3_money\` = VALUES(\`3_money\`),
 *     \`4_count\` = VALUES(\`4_count\`), \`4_money\` = VALUES(\`4_money\`),
 *     \`5_count\` = VALUES(\`5_count\`), \`5_money\` = VALUES(\`5_money\`),
 *     full_text = VALUES(full_text)`,
 *   [
 *     data.lottoRound, data.pickDate,
 *     data.no1, data.no2, data.no3, data.no4, data.no5, data.no6, data.bonus,
 *     data.firstCount, data.firstMoney,
 *     data.secondCount, data.secondMoney,
 *     data.thirdCount, data.thirdMoney,
 *     data.fourthCount, data.fourthMoney,
 *     data.fifthCount, data.fifthMoney,
 *     data.fullText
 *   ]
 * );
 * ```
 */
export async function fetchDhLotteryWinningNumber(round: number = 0): Promise<WinnerNumberRecord | null> {
  // round가 0이면 빈 문자열을 전달하여 동행복권의 최신 회차 정보를 조회합니다.
  const roundParam = round > 0 ? String(round) : '';
  const url = `${DHLOTTERY_API_URL}?srchLtEpsd=${roundParam}`;

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

  // 당첨 번호 유효성 검사 (1~45 범위)
  const hasValidNumbers = [
    item.tm1WnNo, item.tm2WnNo, item.tm3WnNo,
    item.tm4WnNo, item.tm5WnNo, item.tm6WnNo,
    item.bnsWnNo
  ].every(n => typeof n === 'number' && n >= 1 && n <= 45);

  if (!hasValidNumbers) {
    return null;
  }

  // 집계 완료 검증:
  // 1등 당첨자가 없는 회차(이월)의 경우 rnk1WnNope/rnk1WnAmt가 0이 될 수 있으므로,
  // 고정 당첨금인 5등(rnk5WnNope) 및 총 당첨자 수(sumWnNope), 판매액(rlvtEpsdSumNtslAmt)이 0보다 큰지로 집계 완료를 판단합니다.
  const isAggregated = (item.sumWnNope && item.sumWnNope > 0) || (item.rnk5WnNope && item.rnk5WnNope > 0);
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
