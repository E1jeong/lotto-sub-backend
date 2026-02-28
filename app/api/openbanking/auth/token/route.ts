import { NextRequest, NextResponse } from "next/server";
import axios from "axios"; // axios가 설치되어 있어야 합니다 (npm install axios)

// 오픈뱅킹 토큰 발급/갱신 (실제 KFTC 연동)
// POST /api/openbanking/auth/token
// body: { code?: string, refreshToken?: string }
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { code, refreshToken } = body ?? {};

  if (!code && !refreshToken) {
    return NextResponse.json(
      { error: "code 또는 refreshToken 중 하나는 필수입니다" },
      { status: 400 }
    );
  }

  try {
    const baseUrl = process.env.OPENBANKING_BASE_URL;
    
    // KFTC 토큰 발급 규격에 맞게 폼 데이터(URLSearchParams) 생성
    const params = new URLSearchParams();
    params.append("client_id", process.env.OPENBANKING_CLIENT_ID || "");
    params.append("client_secret", process.env.OPENBANKING_CLIENT_SECRET || "");
    params.append("redirect_uri", process.env.OPENBANKING_REDIRECT_URI || "");

    // code가 있으면 신규 발급, refreshToken이 있으면 갱신(Refresh) 요청
    if (code) {
      params.append("grant_type", "authorization_code");
      params.append("code", code as string);
    } else if (refreshToken) {
      params.append("grant_type", "refresh_token");
      params.append("refresh_token", refreshToken as string);
    }

    // 실제 KFTC로 토큰 요청 쏘기!
    const response = await axios.post(`${baseUrl}/oauth/2.0/token`, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    // KFTC로부터 받은 진짜 Access Token, user_seq_no 등을 앱으로 그대로 전달
    return NextResponse.json(response.data);

  } catch (error: any) {
    // KFTC에서 에러를 뱉었을 경우 상세 내용 로깅 및 앱으로 에러 전달
    console.error("KFTC 토큰 발급 에러:", error.response?.data || error.message);
    
    return NextResponse.json(
      { 
        error: "토큰 발급에 실패했습니다.", 
        details: error.response?.data 
      },
      { status: error.response?.status || 500 }
    );
  }
}