import { NextRequest, NextResponse } from "next/server";

// 오픈뱅킹 인증 완료 후 KFTC가 호출하는 콜백 주소
// GET /api/openbanking/auth/callback
export async function GET(req: NextRequest) {
  // 1. KFTC가 전달해준 URL 파라미터(searchParams)를 추출합니다.
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error"); // 사용자가 동의를 취소했거나 에러가 난 경우

  // 2. 안드로이드 앱을 깨우기 위한 커스텀 스킴(Deep Link) 기본 주소
  // 나중에 안드로이드 AndroidManifest.xml에 똑같이 설정해 줄 겁니다.
  const appScheme = "fisherlotto://auth";

  // 3. 예외 처리: 사용자가 인증을 취소했거나 코드가 없는 경우
  if (error || !code) {
    // 앱으로 에러 상태를 달아서 돌려보냅니다. (앱에서 토스트로 "인증 취소" 등을 띄울 수 있게)
    return NextResponse.redirect(`${appScheme}?error=${error || "no_code"}`);
  }

  // (선택) state 값 검증 로직을 여기에 추가할 수 있습니다. 
  // 발급했던 state와 돌아온 state가 같은지 DB나 캐시에서 확인하여 CSRF 공격을 방어합니다.

  // 4. 성공 처리: 발급받은 code를 달아서 안드로이드 앱으로 강제 리다이렉트(302) 시킵니다.
  const deepLinkUrl = `${appScheme}?code=${code}`;
  
  // 브라우저에게 "이 주소(앱)로 즉시 이동해!" 라고 명령합니다.
  return NextResponse.redirect(deepLinkUrl);
}