---
name: obsidian-sync
description: 이 저장소(lotto-sub-backend, Fisher Lotto 서브백엔드)와 옵시디언 LLM 위키 'Project/Personal/Fisher Lotto'를 동기화한다. 위키 노트를 읽어 작업 컨텍스트로 쓰거나(pull), 세션에서 바뀐 내용을 위키 핸드오프/log/서버 문서에 반영한다(push). "옵시디언", "위키", "wiki", "위키 업데이트", "위키 반영", "sync" 같은 요청에 사용.
---

# Obsidian Wiki 동기화 (Fisher Lotto 서브백엔드)

이 저장소와 옵시디언 위키를 동기화한다. 위키 쪽 운영 규칙은 위키의 `AGENTS.md`(볼트 루트)와 `schema.md`(프로젝트 폴더)가 기준이다. 이 스킬은 그 워크플로우를 코드 저장소에서 실행하는 도구일 뿐, 규칙을 여기 복제하지 않는다 — 충돌 시 항상 위키 쪽이 최신 기준이다.

## 대상 위키 폴더

`{WIKI}/Project/Personal/Fisher Lotto`

이 위키는 Fisher Lotto 앱 저장소와 이 서버 저장소를 같은 폴더에서 함께 다룬다. 이 저장소 관련 문서는 주로 `{PROJECT}/서버/서브백엔드.md`, `{PROJECT}/서버/API.md`, `{PROJECT}/서버/설계 결정.md`, `{PROJECT}/서버/결제 구현 이력.md`에 있다.

## 0단계 — 위키 경로 해석 (필수, 매번 먼저)

옵시디언 볼트 경로는 머신마다 다르다. 하드코딩하지 않고 아래 순서로 해석한다.

1. 환경변수 `OBSIDIAN_VAULT_PATH`가 있으면 사용한다.
2. 없으면 이 저장소 루트의 `.claude/obsidian-sync.local.json`을 읽어 `vaultPath` 값을 사용한다 (있다면 gitignore 대상으로 유지).
3. 둘 다 없으면 자동 탐지한다:
   ```bash
   find /c/Users -maxdepth 10 -not -path "*/AppData/*" -path "*Project/Personal/Fisher Lotto/schema.md" 2>/dev/null | head -1
   ```
   (실제 볼트 깊이는 머신마다 다르다 — 예: `C:\Users\<user>\Desktop\dev\5.obsidian\...` 구조는 `/c/Users`부터 깊이 8이다. `maxdepth`를 너무 낮게 잡으면 조용히 못 찾으므로 여유 있게 잡는다.)
   찾으면 그 `schema.md`의 부모 폴더가 `{PROJECT}`이고, `{PROJECT}/../../..`가 볼트 루트 `{WIKI}`다. **탐지에 성공하면 매번 재탐색하지 않도록 바로 `.claude/obsidian-sync.local.json`에 `{"vaultPath": "{WIKI}"}`로 저장한다.**
4. 그래도 못 찾으면 사용자에게 한 줄로 경로를 묻고, 확인되면 `.claude/obsidian-sync.local.json`에 저장할지 물어본다.

이후 `{PROJECT} = {WIKI}/Project/Personal/Fisher Lotto`로 참조한다. 진행 전 `{PROJECT}/schema.md` 존재를 확인한다.

## Pull — 위키 → 코드 (작업 시작 시)

1. **`{PROJECT}/핸드오프.md`부터 읽는다** — 지난 세션이 어디까지 했고 다음에 뭘 하면 되는지 파악한다.
2. `{PROJECT}/README.md`, `{PROJECT}/schema.md`로 프로젝트 성격과 운영 규칙(민감정보 정책 등)을 확인한다.
3. `{PROJECT}/서버/서브백엔드`, `{PROJECT}/서버/설계 결정`, `{PROJECT}/이슈/미구현`(서버 항목)을 읽어 배경과 제약을 파악한다.

## Push — 코드 → 위키 ("위키 업데이트해" 요청 시 또는 세션 종료 시)

1. 이번 세션에서 실제로 바뀐 것(API 변경, 결제/구독 로직, DB 트랜잭션, Pub/Sub 처리 등)을 정리한다.
2. 확정된 사실은 `{PROJECT}/서버/서브백엔드`, `{PROJECT}/서버/API`, `{PROJECT}/서버/설계 결정`에 반영한다. 불확실한 내용은 단정하지 말고 `{PROJECT}/이슈/확인 필요.md`에 남긴다.
3. `{PROJECT}/log.md`에 append-only로 갱신 이력을 남긴다 (기존 항목은 절대 수정하지 않는다).
4. `{PROJECT}/핸드오프.md`를 **덮어써서** 이번 세션 요약, 현재 상태, 다음 세션 시작점, 블로커를 최신화한다. 앱 쪽 세션과 서버 쪽 세션이 같은 파일을 공유하므로, 다른 쪽 작업 내용을 지우지 않도록 기존 핸드오프를 먼저 읽고 병합한다.
5. 새 페이지를 만들었다면 `{PROJECT}/index.md`에 반영한다.

## 동기화 규칙

- 상세 규칙은 항상 `{PROJECT}/schema.md`가 기준이다. 이 스킬과 충돌하면 그쪽을 따른다.
- 위키 변경은 별도 git 저장소(옵시디언 볼트)에서 일어난다 — 이 저장소의 커밋과 섞지 않는다.
- 실제 서버 접속값, API key, private key, Firebase 계정 등은 위키 일반 문서로 복사하지 않는다. `{PROJECT}/_sensitive/`의 규칙을 따른다.

## 작업 마무리 보고

- Pull/Push 중 무엇을 했는지, 읽거나 수정한 위키 파일 경로, `핸드오프.md`/`log.md` 갱신 여부를 짧게 보고한다.
