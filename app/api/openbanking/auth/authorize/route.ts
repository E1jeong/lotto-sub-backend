import { NextResponse } from "next/server";
import crypto from 'crypto';

// 오픈뱅킹 OAuth 인증 URL 생성
// GET /api/openbanking/auth/authorize
export async function GET() {
  const clientId = process.env.OPENBANKING_CLIENT_ID ?? "mock_client_id";
  const redirectUri =
    process.env.OPENBANKING_REDIRECT_URI ??
    "https://lotto-sub-backend.vercel.app/api/openbanking/auth/callback";
  const baseUrl =
    process.env.OPENBANKING_BASE_URL ?? "https://testapi.openbanking.or.kr";

  const state = crypto.randomBytes(16).toString('hex');
  const authorizeUrl = `${baseUrl}/oauth/2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=login%20inquiry%20transfer&state=${state}&auth_type=0`;

  return NextResponse.json({
    authorizeUrl,
    state,
  });
}
