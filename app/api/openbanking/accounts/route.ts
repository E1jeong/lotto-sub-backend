import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

// 사용자 등록 계좌 목록 조회 (실제 KFTC 연동)
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

  try {
    // KFTC 테스트 서버 주소
    const baseUrl = process.env.OPENBANKING_BASE_URL;
    
    // "Bearer " 글자를 떼어내고 순수 토큰 문자열만 추출
    const token = authHeader.replace("Bearer ", "");

    // KFTC 계좌조회 API 호출!
    const response = await axios.get(`${baseUrl}/v2.0/account/list`, {
      headers: { 
        Authorization: `Bearer ${token}` 
      },
      params: { 
        user_seq_no: userSeqNo, 
        include_cancel_yn: "N", // 해지된 계좌 포함 여부 (N: 포함 안함)
        sort_order: "D"         // 정렬 순서 (D: 최근 등록순)
      },
    });

    // KFTC가 준 진짜 계좌 목록을 앱으로 그대로 전달
    return NextResponse.json(response.data);

  } catch (error: any) {
    console.error("KFTC 계좌 조회 에러:", error.response?.data || error.message);
    return NextResponse.json(
      { 
        error: "계좌 조회에 실패했습니다.", 
        details: error.response?.data 
      },
      { status: error.response?.status || 500 }
    );
  }
}