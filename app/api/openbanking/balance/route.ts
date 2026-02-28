import { NextRequest, NextResponse } from "next/server";

// 계좌 잔액 조회 (Real KFTC OpenBanking API)
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

  const token = authHeader.replace("Bearer ", "");
  
  // 환경 변수 세팅 (Vercel 환경변수에 등록되어 있어야 함)
  const baseUrl = process.env.OPENBANKING_BASE_URL || "https://testapi.openbanking.or.kr";
  const clientUseCode = process.env.OPENBANKING_CLIENT_USE_CODE; // 발급받은 이용기관코드 (9자리)

  if (!clientUseCode) {
    return NextResponse.json(
      { error: "서버 환경변수 오류: OPENBANKING_CLIENT_USE_CODE가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

// 1. bank_tran_id 생성 (이용기관코드 10자리 + 'U' 1자리 + 난수 9자리 = 총 20자리)
  const generateBankTranId = () => {
    // 9자리 랜덤 영문/숫자 (금융결제원 가이드에 따라 하루동안 중복되지 않게 생성)
    const random9 = Math.random().toString(36).substring(2, 11).toUpperCase().padEnd(9, '0');
    return `${clientUseCode}U${random9}`; // 총 20자리 완성
  };

  // 2. tran_dtime 생성 (YYYYMMDDHHmmss 형식)
  const generateTranDtime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  };

  try {
    const bankTranId = generateBankTranId();
    const tranDtime = generateTranDtime();

    // 3. KFTC 오픈뱅킹 API 호출
    const url = new URL(`${baseUrl}/v2.0/account/balance/fin_num`);
    url.searchParams.append("bank_tran_id", bankTranId);
    url.searchParams.append("fintech_use_num", fintechUseNum);
    url.searchParams.append("tran_dtime", tranDtime);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    // 금융결제원 통신 실패 시
    if (!response.ok) {
      return NextResponse.json(
        { error: "오픈뱅킹 API 호출 실패", details: data },
        { status: response.status }
      );
    }

    // if (data.rsp_code === "A0002") {
    //   console.log("KFTC 테스트 데이터 없음. 임시 Mock 데이터를 내려줍니다.");
    //   return NextResponse.json({
    //     api_tran_id: data.api_tran_id || `mock-${Date.now()}`,
    //     rsp_code: "A0000", // 정상 코드로 둔갑
    //     rsp_message: "성공(Mock 우회)",
    //     bank_name: "테스트은행",
    //     fintech_use_num: fintechUseNum,
    //     balance_amt: "1500000",      // 실제 화면에 띄울 잔액
    //     available_amt: "1450000",
    //     account_type: "1",
    //     product_name: "Fisher 보통예금",
    //   });
    // }

    // 4. 성공적으로 가져온 실제 잔액 데이터 반환
    return NextResponse.json(data);

  } catch (error: any) {
    console.error("Balance fetch error:", error);
    return NextResponse.json(
      { error: "서버 내부 오류", details: error.message },
      { status: 500 }
    );
  }
}