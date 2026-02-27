import { NextResponse } from "next/server";

// 오픈뱅킹 OAuth 인증 URL 생성 (Mock)
// GET /api/openbanking/auth/authorize
export async function GET() {
  const clientId = process.env.OPENBANKING_CLIENT_ID ?? "mock_client_id";
  const redirectUri =
    process.env.OPENBANKING_REDIRECT_URI ??
    "https://lotto-sub-backend.vercel.app/api/openbanking/auth/callback";
  const baseUrl =
    process.env.OPENBANKING_BASE_URL ?? "https://testapi.openbanking.or.kr";

  // TODO: Replace mock with actual OpenBanking API call
  // 실제 구현 시:
  // const authorizeUrl = `${baseUrl}/oauth/2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=login inquiry transfer&state=${state}&auth_type=0`;

  const state = `state-${Date.now()}`;
  const authorizeUrl = `${baseUrl}/oauth/2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=login+inquiry+transfer&state=${state}&auth_type=0`;

  return NextResponse.json({
    authorizeUrl,
    state,
  });
}
