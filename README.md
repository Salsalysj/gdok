# 로스트아크 시세 검색 웹앱

로스트아크 공식 OpenAPI를 이용한 거래소 아이템 시세 검색 웹앱입니다.

## 🛠 기술 스택

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes
- **스타일**: Tailwind CSS (다크 테마)

## 🚀 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.local` 파일을 프로젝트 루트에 생성하고 로스트아크 API 키를 입력하세요:

```env
LOSTARK_API_KEY=your_api_key_here
```

#### API 키 발급 방법:
1. [로스트아크 개발자 포털](https://developer-lostark.game.onstove.com/)에 접속
2. 로그인 후 API 키 발급
3. 발급받은 키를 `.env.local` 파일에 입력

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 📋 주요 기능

- ✅ 거래소 아이템 검색
- ✅ 실시간 시세 정보 표시
  - 최근 거래가
  - 전일 평균가
  - 현재 최저가
- ✅ 다크 테마 UI
- ✅ 반응형 디자인

## 📁 프로젝트 구조

```
.
├── app/
│   ├── api/
│   │   └── market/
│   │       └── search/
│   │           └── route.ts       # 거래소 검색 API 엔드포인트
│   ├── globals.css                # 전역 스타일
│   ├── layout.tsx                 # 루트 레이아웃
│   └── page.tsx                   # 메인 페이지
├── .env.local.example             # 환경변수 예시
├── next.config.js                 # Next.js 설정
├── tailwind.config.ts             # Tailwind CSS 설정
├── tsconfig.json                  # TypeScript 설정
└── package.json                   # 프로젝트 의존성
```

## 🔌 API 엔드포인트

### POST /api/market/search

거래소 아이템 검색

**요청 Body:**
```json
{
  "itemName": "파괴강석"
}
```

**응답:**
```json
{
  "Items": [
    {
      "Id": 12345,
      "Name": "파괴강석",
      "Grade": "희귀",
      "BundleCount": 10,
      "RecentPrice": 50,
      "YDayAvgPrice": 48,
      "CurrentMinPrice": 49
    }
  ]
}
```

## 🎨 UI 기능

- 다크 테마 디자인
- 등급별 색상 구분 (전설, 영웅, 희귀, 고급, 일반)
- 가격 정보 한눈에 확인
- 반응형 테이블
- 로딩 상태 표시
- 에러 메시지 표시

## 🔒 보안

- API 키는 서버 사이드에서만 사용
- 클라이언트에 API 키 노출 금지
- 환경변수로 안전하게 관리

## 📝 사용 예시

1. 검색창에 아이템 이름 입력 (예: "파괴강석")
2. 검색 버튼 클릭
3. 거래소 시세 정보를 테이블로 확인

## ⚠️ 주의사항

- `.env.local` 파일은 반드시 `.gitignore`에 포함되어야 합니다
- API 키는 절대 공개 저장소에 커밋하지 마세요
- API 호출 제한이 있을 수 있으니 과도한 요청은 자제해주세요

## 📄 라이선스

MIT License

