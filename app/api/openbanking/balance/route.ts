import { NextRequest, NextResponse } from "next/server";

// 계좌 잔액 조회 (Mock)
// GET /api/openbanking/balance?fintech_use_num=xxx
// Headers: Authorization: Bearer {token}
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authorization 헤더가 필요합니다 (Bearer token)" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const fintechUseNum = searchParams.get("fintech_use_num");

  if (!fintechUseNum) {
    return NextResponse.json(
      { error: "fintech_use_num 파라미터가 필요합니다" },
      { status: 400 }
    );
  }

  // TODO: Replace mock with actual OpenBanking API call
  // 실제 구현 시:
  // const baseUrl = process.env.OPENBANKING_BASE_URL;
  // const token = authHeader.replace("Bearer ", "");
  // const tran_no = `${Date.now()}`.slice(-9).padStart(9, "0");
  // const response = await axios.get(`${baseUrl}/v2.0/account/balance/fin_num`, {
  //   headers: { Authorization: `Bearer ${token}` },
  //   params: { fintech_use_num: fintechUseNum, tran_no },
  // });

  const bankMap: Record<string, { bank_name: string; account_num_masked: string }> = {
    "100000000001": { bank_name: "한국은행", account_num_masked: "110-***-****01" },
    "100000000002": { bank_name: "신한은행", account_num_masked: "220-***-****02" },
    "100000000003": { bank_name: "국민은행", account_num_masked: "330-***-****03" },
  };

  const info = bankMap[fintechUseNum] ?? {
    bank_name: "테스트은행",
    account_num_masked: "000-***-****00",
  };

  return NextResponse.json({
    api_tran_id: `mock-${Date.now()}`,
    rsp_code: "A0000",
    rsp_message: "성공",
    bank_name: info.bank_name,
    fintech_use_num: fintechUseNum,
    account_num_masked: info.account_num_masked,
    balance_amt: "1500000",
    available_amt: "1450000",
    account_type: "1",
    product_name: "보통예금",
  });
}
