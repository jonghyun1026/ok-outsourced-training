# 2026년 위탁교육 과정 리스트

OK금융그룹 2026년 위탁교육 과정을 조회할 수 있는 웹 애플리케이션입니다.

## 기술 스택

- **Frontend**: React 19, TypeScript
- **Styling**: Tailwind CSS v4
- **Build Tool**: Vite
- **Database**: Supabase

## 주요 기능

- 📋 위탁교육 과정 목록 조회
- 🔍 과정명 검색
- 🏷️ 카테고리, 교육기관, 시작월, 비용별 필터링
- 📊 정렬 기능 (카테고리, 과정명, 기관명, 시작일, 교육비용)
- 🌓 다크모드 지원
- 📱 반응형 디자인 (데스크톱/모바일)
- ⚡ 페이지네이션

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하고 Supabase 정보를 입력하세요:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

### 3. 개발 서버 실행

```bash
npm run dev
```

### 4. 프로덕션 빌드

```bash
npm run build
```

빌드된 파일은 `dist` 폴더에 생성됩니다.

### 5. 프로덕션 미리보기

```bash
npm run preview
```

## 데이터베이스 설정

### Supabase 테이블 구조

테이블명: `outsourced_training`

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| 기관명 | text | 교육기관 이름 |
| 기관링크 | text | 교육기관 웹사이트 URL |
| 카테고리 | text | 교육 카테고리 |
| 과정명 | text | 교육 과정명 |
| 시작일 | date | 교육 시작일 (YYYY-MM-DD) |
| 종료일 | date | 교육 종료일 (YYYY-MM-DD) |
| 교육기간(일) | numeric | 교육 기간 (일) |
| 교육기간(시간) | numeric | 교육 기간 (시간) |
| 교육비용 | text | 교육 비용 |

### RLS (Row Level Security) 설정

데이터를 공개적으로 조회하려면 Supabase에서 다음과 같은 정책을 추가하세요:

```sql
-- 모든 사용자에게 읽기 권한 부여
CREATE POLICY "Enable read access for all users" ON "public"."outsourced_training"
FOR SELECT
USING (true);
```

## 배포

### Vercel 배포

1. Vercel에 프로젝트 연결
2. 환경변수 설정:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. 빌드 명령어: `npm run build`
4. 출력 디렉토리: `dist`

### Netlify 배포

1. Netlify에 프로젝트 연결
2. 빌드 설정:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. 환경변수 설정:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## 라이선스

© 2026 OK금융그룹
