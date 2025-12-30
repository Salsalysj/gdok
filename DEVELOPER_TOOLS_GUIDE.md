# 개발자 도구 사용 가이드

## 브라우저 개발자 도구 열기

### Chrome/Edge
- **Windows/Linux**: `F12` 또는 `Ctrl + Shift + I` 또는 `Ctrl + Shift + J`
- **Mac**: `Cmd + Option + I` 또는 `Cmd + Option + J`

### Firefox
- **Windows/Linux**: `F12` 또는 `Ctrl + Shift + I`
- **Mac**: `Cmd + Option + I`

### Safari
- 먼저 Safari 설정에서 "개발자용 메뉴 보기" 활성화 필요
- **Mac**: `Cmd + Option + I`

## 콘솔 탭에서 에러 확인하기

1. 개발자 도구를 엽니다
2. **Console** 탭을 클릭합니다
3. 빨간색으로 표시된 에러 메시지를 확인합니다
4. 에러 메시지를 클릭하면 해당 코드 위치로 이동합니다

## 네트워크 탭에서 라우팅 확인하기

1. 개발자 도구를 엽니다
2. **Network** 탭을 클릭합니다
3. 다른 탭을 클릭했을 때 네트워크 요청이 발생하는지 확인합니다
4. 요청이 없다면 클릭 이벤트가 제대로 전달되지 않는 것입니다

## Elements 탭에서 이벤트 리스너 확인하기

1. 개발자 도구를 엽니다
2. **Elements** (또는 **Inspector**) 탭을 클릭합니다
3. 문제가 되는 링크 요소를 선택합니다 (예: "이벤트 효율" 링크)
4. 오른쪽 패널에서 **Event Listeners** 탭을 확인합니다
5. 등록된 이벤트 리스너를 확인합니다

## React DevTools 사용하기 (선택사항)

1. Chrome 확장 프로그램으로 React DevTools 설치
2. 개발자 도구에서 **Components** 탭 확인
3. 컴포넌트 트리에서 Navigation 컴포넌트 찾기
4. props와 state 확인

## 디버깅 팁

### 콘솔에서 직접 테스트
```javascript
// 링크 클릭 이벤트 테스트
document.querySelector('a[href="/event-efficiency"]')?.click();

// 라우터 확인
window.location.href = '/event-efficiency';
```

### 이벤트 리스너 확인
```javascript
// 모든 클릭 이벤트 리스너 확인
getEventListeners(document);
```

### 라우팅 차단 확인
```javascript
// Next.js 라우터가 차단되었는지 확인
console.log(window.next?.router);
```

