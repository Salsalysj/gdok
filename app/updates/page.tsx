export const metadata = {
  title: '업데이트 내역 - 껨산기',
  description: '껨산기 업데이트 내역',
};

export default function UpdatesPage() {
  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
            업데이트 내역
          </h1>
          <p className="text-base text-gray-400">껨산기의 업데이트 내역을 확인하세요.</p>
        </div>

        <div className="space-y-8">
          {/* v0.3.4 */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4">v0.3.4 (2026. 01. 18)</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-green-400 mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                  <li>세르카 장비 재련 효율 및 전이 돌파석 가치 업데이트</li>
                  <li>세르카 장비 계승 완료 시 하위 레이드 귀속재료 가치 조정 (5:1 합성 기준)</li>
                  <li>내 캐릭터 시뮬레이션 기능에 세르카 장비 반영</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                  <li>레이드 보상 계산기 UI 개선</li>
                  <li>일부 기능에서 실링의 가치가 제대로 반영되지 않던 문제 수정</li>
                  <li>디스코드 환율 계산 로직 최적화</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.3 */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4">v0.3.3 (2026. 01. 14)</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                  <li>재련 효율 페이지에서 실링의 가치가 제대로 반영되지 않던 문제 수정</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.2 */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4">v0.3.2 (2026. 01. 12)</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-green-400 mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                  <li>레이드 보상 계산기 추가</li>
                  <li>에픽/카제로스/그림자 레이드 보상 조회</li>
                  <li>관문별 클리어 보상 및 더보기 효율 확인</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">개선사항</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                  <li>가격 조정 스위치 배치 최적화</li>
                  <li>상재 1, 2단계 재료 필요 수량 오류 수정</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.1 */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4">v0.3.1 (2026. 01. 11)</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-green-400 mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                  <li>커스텀 계산기 (상자 선택 도우미) 기능 추가</li>
                  <li>사이트 UI 개선 및 사이드바 구현</li>
                  <li>업데이트 노트 작성 시작</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-blue-400 mb-2">개선사항</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-300 ml-4">
                  <li>과금 효율 상품 종료예정일 날짜 처리 오류 수정</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.0 */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4">v0.3.0 (2026. 01. 7)</h2>
            
            <div className="space-y-4">
              <p className="text-gray-300">사이트 오픈 베타 시작 (유튜브 공개)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
