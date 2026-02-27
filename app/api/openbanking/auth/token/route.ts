import { NextRequest, NextResponse } from "next/server";

// 오픈뱅킹 토큰 발급/갱신 (Mock)
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

  // TODO: Replace mock with actual OpenBanking API call
  // 실제 구현 시:
  // const baseUrl = process.env.OPENBANKING_BASE_URL;
  // const response = await axios.post(`${baseUrl}/oauth/2.0/token`, {
  //   grant_type: code ? "authorization_code" : "refresh_token",
  //   client_id: process.env.OPENBANKING_CLIENT_ID,
  //   client_secret: process.env.OPENBANKING_CLIENT_SECRET,
  //   redirect_uri: process.env.OPENBANKING_REDIRECT_URI,
  //   code,
  //   refresh_token: refreshToken,
  // });

  const mockToken = `mock_access_token_${Date.now()}`;
  const mockRefreshToken = `mock_refresh_token_${Date.now()}`;

  return NextResponse.json({
    access_token: mockToken,
    token_type: "Bearer",
    expires_in: 7776000,
    refresh_token: mockRefreshToken,
    scope: "login inquiry transfer",
    user_seq_no: "1234567890",
  });
}
