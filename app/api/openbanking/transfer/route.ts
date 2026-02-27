import { NextRequest, NextResponse } from "next/server";

// 출금이체 (송금) 실행 (Mock)
// POST /api/openbanking/transfer
// Headers: Authorization: Bearer {token}
// body: { fintech_use_num, tran_amt, req_client_name, req_client_num, recv_client_name, recv_client_account_num }
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authorization 헤더가 필요합니다 (Bearer token)" },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    fintech_use_num,
    tran_amt,
    req_client_name,
    req_client_num,
    recv_client_name,
    recv_client_account_num,
  } = body ?? {};

  // 필수 필드 검증
  if (!fintech_use_num || !tran_amt || !req_client_name || !recv_client_name || !recv_client_account_num) {
    return NextResponse.json(
      {
        error: "필수 파라미터가 누락되었습니다",
        required: [
          "fintech_use_num",
          "tran_amt",
          "req_client_name",
          "recv_client_name",
          "recv_client_account_num",
        ],
      },
      { status: 400 }
    );
  }

  const amount = Number(tran_amt);
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "tran_amt는 0보다 큰 숫자여야 합니다" },
      { status: 400 }
    );
  }

  // TODO: Replace mock with actual OpenBanking API call
  // 실제 구현 시:
  // const baseUrl = process.env.OPENBANKING_BASE_URL;
  // const token = authHeader.replace("Bearer ", "");
  // const response = await axios.post(
  //   `${baseUrl}/v2.0/transfer/withdraw/fin_num`,
  //   {
  //     bank_tran_id: `${이용기관코드}U${난수9자리}`,
  //     cntr_account_type: "N",
  //     cntr_account_num: "contractAccountNum",
  //     dps_print_content: req_client_name,
  //     fintech_use_num,
  //     tran_amt: String(tran_amt),
  //     tran_dtime: new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14),
  //     req_client_name,
  //     req_client_num,
  //     transfer_purpose: "TR",
  //     recv_client_name,
  //     recv_client_account_num,
  //   },
  //   { headers: { Authorization: `Bearer ${token}` } }
  // );

  const now = new Date();
  const tranDtime = now.toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
  const apiTranId = `mock-transfer-${Date.now()}`;

  return NextResponse.json({
    api_tran_id: apiTranId,
    rsp_code: "A0000",
    rsp_message: "이체가 정상 처리되었습니다",
    dps_bank_name: "수취은행",
    dps_account_num_masked: `${String(recv_client_account_num).slice(0, 3)}-***-****`,
    bank_tran_id: `MOCK_U${Date.now().toString().slice(-9)}`,
    bank_tran_date: tranDtime.slice(0, 8),
    bank_code_tran: "097",
    bank_rsp_code: "000",
    bank_rsp_message: "정상처리",
    fintech_use_num: String(fintech_use_num),
    tran_amt: String(tran_amt),
    recv_client_name: String(recv_client_name),
    wd_limit_remain_amt: "1000000",
  });
}
