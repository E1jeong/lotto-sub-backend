import { NextRequest, NextResponse } from "next/server";

// 사용자 등록 계좌 목록 조회 (Mock)
// GET /api/openbanking/accounts?user_seq_no=xxx
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
  const userSeqNo = searchParams.get("user_seq_no");

  if (!userSeqNo) {
    return NextResponse.json(
      { error: "user_seq_no 파라미터가 필요합니다" },
      { status: 400 }
    );
  }

  // TODO: Replace mock with actual OpenBanking API call
  // 실제 구현 시:
  // const baseUrl = process.env.OPENBANKING_BASE_URL;
  // const token = authHeader.replace("Bearer ", "");
  // const response = await axios.get(`${baseUrl}/v2.0/account/list`, {
  //   headers: { Authorization: `Bearer ${token}` },
  //   params: { user_seq_no: userSeqNo, include_cancel_yn: "N", sort_order: "D" },
  // });

  return NextResponse.json({
    api_tran_id: `mock-${Date.now()}`,
    rsp_code: "A0000",
    rsp_message: "성공",
    api_tran_dtm: new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14),
    user_seq_no: userSeqNo,
    res_cnt: 3,
    account_list: [
      {
        fintech_use_num: "100000000001",
        account_alias: "급여통장",
        bank_name: "한국은행",
        account_num_masked: "110-***-****01",
        account_holder_name: "홍길동",
        account_type: "1",
        inquiry_agree_yn: "Y",
        transfer_agree_yn: "Y",
      },
      {
        fintech_use_num: "100000000002",
        account_alias: "저축예금",
        bank_name: "신한은행",
        account_num_masked: "220-***-****02",
        account_holder_name: "홍길동",
        account_type: "1",
        inquiry_agree_yn: "Y",
        transfer_agree_yn: "Y",
      },
      {
        fintech_use_num: "100000000003",
        account_alias: "생활비통장",
        bank_name: "국민은행",
        account_num_masked: "330-***-****03",
        account_holder_name: "홍길동",
        account_type: "1",
        inquiry_agree_yn: "Y",
        transfer_agree_yn: "N",
      },
    ],
  });
}
