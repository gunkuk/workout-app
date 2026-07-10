# 배포 가이드 — GitHub Pages

> **용어**: GitHub Pages = GitHub이 정적 웹사이트를 무료로 호스팅해주는 기능. Pages는 저장소(repo)
> 안의 빌드 결과물(정적 HTML/JS/CSS)을 `https://<사용자명>.github.io/<저장소명>/` 주소로 서빙한다.
> Actions = GitHub이 제공하는 CI/CD 자동화(빌드·테스트·배포를 서버에서 자동 실행).
>
> 이 문서는 이 앱(운동 추적기 PWA)을 GitHub Pages에 실제로 올리는 절차다. 이 저장소는 아직
> 로컬(`C:\Users\rjs11\Desktop\workout-app`)에만 있고 원격(remote) 저장소가 없다 — 아래 절차는
> **모두 사용자가 직접 실행**해야 한다(Claude가 원격 push나 GitHub 설정을 대신 하지 않음, 배포는
> 되돌리기 어려운 공개 행위이므로 사용자 결정 사항).

## 왜 base path 설정이 필요한가

GitHub Pages는 프로젝트 저장소를 `https://<사용자명>.github.io/<저장소명>/` 하위 경로에 서빙한다
(사용자명.github.io 저장소 자체가 아닌 한). 그래서 빌드 시 정적 자산(JS/CSS) 경로 앞에
`/저장소명/`을 붙여야 페이지가 깨지지 않는다. 이 값은 `vite.config.ts`의 `base` 옵션으로 제어하며,
`VITE_BASE` 환경변수로 오버라이드 가능하게 이미 구성해두었다(기본값 `"./"` — 로컬 개발/빌드는 이 변경과
무관하게 그대로 동작).

라우팅은 hash 방식(`#/...`)을 쓰므로 — GitHub Pages는 서버사이드 라우팅이 없어 새로고침 시
경로가 없는 URL(예: `/today`)로 직접 접근하면 404가 뜨는데, hash 라우팅은 항상 `index.html` +
`#조각`으로만 이동하므로 이 문제를 피한다(스펙 §3.4 근거).

## 절차

### ① GitHub 저장소 만들기
1. https://github.com/new 에서 새 저장소 생성 (예: `workout-app`). Public/Private 무관하게
   Pages는 동작하지만, Private repo는 GitHub Pro 이상 요금제가 필요할 수 있다.
2. README·gitignore·license는 추가하지 않는다(이미 로컬에 파일이 있으므로 충돌 방지).

### ② 로컬 저장소를 remote에 push
로컬 `workout-app` 폴더(현재 branch: `stage1`)에서 직접 실행:

```bash
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin stage1
```

Pages 배포는 어느 브랜치에서 실행하든 무방(workflow가 push된 브랜치의 코드를 빌드) — 다만
`main`으로 병합 후 실행하는 것을 권장.

### ③ Settings → Pages → Source를 GitHub Actions로 설정
1. 저장소 페이지에서 **Settings → Pages**.
2. **Build and deployment → Source**를 **GitHub Actions**로 선택(기본값인 "Deploy from a branch"가 아님).
   이 저장소의 `.github/workflows/deploy.yml`이 Pages 아티팩트 업로드·배포를 담당하므로 별도 브랜치
   지정은 불필요.

### ④ Actions 탭에서 배포 워크플로 수동 실행
1. 저장소 상단 **Actions** 탭 → 좌측 **"Deploy to GitHub Pages"** 워크플로 선택.
2. **Run workflow** 버튼 → 브랜치 선택 → 실행.
   (이 워크플로는 `workflow_dispatch`로만 트리거된다 — push해도 자동 실행되지 않음, 배포 시점을
   사용자가 직접 통제하기 위함.)
3. 워크플로는 `npm ci` → 테스트(vitest) → typecheck → lint → `VITE_BASE=/<저장소명>/`로 빌드 →
   Pages 아티팩트 업로드 → 배포 순으로 진행. 하나라도 실패하면 배포되지 않는다(품질 게이트).
4. 완료 후 `https://<사용자명>.github.io/<저장소명>/` 에서 확인.

**로컬에서 같은 빌드를 미리 확인하고 싶다면** (선택):

```bash
# macOS/Linux/Git Bash
VITE_BASE=/저장소명/ npm run build:pages

# Windows cmd.exe
set VITE_BASE=/저장소명/&& npm run build:pages

# Windows PowerShell
$env:VITE_BASE = "/저장소명/"; npm run build:pages
```

(신규 devDependency인 `cross-env` 없이도, GitHub Actions는 `env:` 블록으로 OS 무관하게 환경변수를
설정하므로 CI에서는 별도 처리 불필요 — 위 로컬 명령은 사람이 수동 확인할 때만 참고.)

## iPhone/Android 설치 방법 (홈 화면에 추가)

배포된 URL을 브라우저로 연 뒤:

- **iPhone (Safari)**: 공유 버튼(사각형+↑) → **홈 화면에 추가**.
- **Android (Chrome)**: 우측 상단 점 3개 메뉴 → **홈 화면에 추가** (또는 자동으로 뜨는 설치 배너 사용).

설치하면 아이콘이 생기고, 앱을 열면 브라우저 주소창 없이 전체화면(standalone)으로 실행된다.

## ⚠️ 주의: 설치 전/후 데이터는 분리된다

이 앱의 모든 데이터(운동 기록·프로그램·TM 등)는 기기 로컬의 **IndexedDB**(브라우저 자체 저장소)에
저장된다 — 서버에 올라가지 않는다. **브라우저 탭에서 쓰던 데이터와 "홈 화면에 추가"로 설치한 앱의
데이터는 별개의 저장소**로 취급될 수 있다(iOS Safari는 특히 standalone 앱과 일반 탭의 저장소를
분리하는 경우가 있음). 즉 설치 전에 브라우저에서 기록을 쌓았다면, 설치 후 앱을 처음 열었을 때
데이터가 비어 보일 수 있다.

**대응**: 설치 전에 설정 화면의 **백업 내보내기(export)**로 데이터를 파일로 저장해두고, 설치한 앱에서
**가져오기(import)**로 복원할 것. (내보내기/가져오기 기능은 이미 구현되어 있음 — 설정 화면 참고.)
