import FavoriteButton from '../components/FavoriteButton';

export const metadata = {
  title: '업데이트 내역 - 껨산기',
  description: '껨산기 업데이트 내역',
};

export default function UpdatesPage() {
  return (
    <div className="min-h-screen bg-gray-950 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 sm:mb-6 md:mb-8 px-4 sm:px-0">
          <div className="flex items-center gap-3 flex-wrap mb-1 sm:mb-2">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight text-white">
              업데이트 내역
            </h1>
            <FavoriteButton title="업데이트 내역" />
          </div>
          <p className="text-[10px] sm:text-xs md:text-sm text-gray-400 whitespace-normal break-words">껨산기의 업데이트 내역을 확인하세요.</p>
        </div>

        <div className="space-y-3 sm:space-y-4 md:space-y-6 lg:space-y-8">
          {/* v0.5.0 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.5.0 (2026. 02. 21)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>내 캐릭터 시뮬레이션에서 이제 목표 레벨을 설정하고 도달하는 데 드는 경로와 비용을 한번에 볼 수 있습니다.</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>즐겨찾기한 페이지를 사이드바에서 x 클릭으로 삭제할 수 있습니다.</li>
                  <li>모바일 UI가 더욱 더 깔끔해졌습니다.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.4.5 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.4.5 (2026. 02. 13)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>레이드 보상 아이템에 아크그리드 코어 추가</li>
                  <li>모바일 UI 개선</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.4.4 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.4.4 (2026. 02. 13)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>제작 재료 교환 페이지 추가 : 레이드 제작 재료 (고통의 가시, 우레의 뇌옥 등) 교환 및 제작 효율</li>
                  <li>싱글 상점 교환 효율 페이지 추가</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>내 캐릭터 시뮬레이션에서 평균 재료 소모량을 확인할 수 있게끔 변경</li>
                  <li>내 캐릭터 시뮬레이션에서 1730 이상인 카제로스 장비의 경우 계승 이후의 시나리오 기준으로 계산하는 기능 추가</li>
                  <li>내비게이션 메뉴 재조정</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.4.3 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.4.3 (2026. 02. 12)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>원정대 주간 수익 시뮬레이션 기능 추가 (이제 내 원정대의 생산성을 종합적으로 볼 수 있습니다)</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>일반 재련에서 평균 재료 소모량도 보여주게끔 변경</li>
                  <li>재련 요약표에서 평균 재료 소모량도 보여주게끔 변경</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.4.2 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.4.2 (2026. 02. 05)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>컨텐츠 보상 페이지 UI 개선</li>
                  <li>아이템 이미지 추가 적용 (일반재련, 상급재련 페이지)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.4.1 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.4.1 (2026. 02. 01)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>아이템 이름 앞에 아이콘 이미지 추가</li>
                  <li>시급 계산기 기능 추가</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>내 캐릭터 시뮬레이션 불러오기 로직 개선 (불필요한 트래픽 제거)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.10 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.10 (2026. 01. 28)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>즐겨찾기 기능 추가</li>
                  <li>화폐거래소 환율 추이 그래프 추가</li>
                  <li>내 캐릭터 시뮬레이션에 상재 효율도 추가 (이제 별도의 페이지로 구분되어 내 캐릭터에 맞는 일반재련, 상급재련 전략을 한번에 볼 수 있습니다)</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>지옥 보상에 천상 입장권+1 (3000골) 가치 계산에 포함</li>
                  <li>정련된 운명의 돌 가치 조정</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.9 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.9 (2026. 01. 26)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>재련 효율에 강화 야금술/재봉술 포함</li>
                  <li>내 캐릭터 시뮬레이션에서 강화 야금술/재봉술도 표시되도록 변경</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>입장권 (지옥 교환) 의 가치 계산 시 가장 효율이 좋은 교환 기준으로 변경</li>
                  <li>재련 효율에서 보조재료 최대치 투입 관련 로직 오류 수정</li>
                  <li>가격 조정 스위치 추가 (젬)</li>
                  <li>가격 조정 스위치 UI 변경 (체크박스 → 단추)</li>
                  <li>경매 계산기(쌀산기)에 추천 입찰가 복사 기능 추가</li>
                  <li>페이지 간 컴포넌트 계산 로직 통일</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.8 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.8 (2026. 01. 24)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>쌀산기 (경매 최적가 계산기) 구현</li>
                  <li>과금 효율에서 항목별 계산 제외 기능 추가</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>가격 조정 스위치 추가 (융화 재료, 숨결, 야금/재봉)</li>
                  <li>지옥 보상의 카테고리 합계에서 풍요 상자 기준 추가</li>
                  <li>과금 효율 및 지옥 보상 페이지 사용성 개선</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.7 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.7 (2026. 01. 24)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>낙원 시즌2 지옥 열쇠 (큐브 입장권) 교환 효율</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>지옥 III 보상 수량 오류 수정</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.6 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.6 (2026. 01. 23)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>낙원 시즌2 지옥 보상 업데이트</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>과금 효율 구성요소에 하위 묶음항목 수량이 제대로 계산되지 않는 문제 수정</li>
                  <li>모바일 UI 개선 (미반영 스위치 사용 가능)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.5 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.5 (2026. 01. 20)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>홈화면 UI 개선</li>
                  <li>일반 재련 효율 요약표에 세르카 장비 추가</li>
                </ul>
              </div>
            </div>
        </div>

          {/* v0.3.4 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.4 (2026. 01. 18)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>세르카 장비 재련 효율 및 전이 돌파석 가치 업데이트</li>
                  <li>세르카 장비 계승 완료 시 하위 레이드 귀속재료 가치 조정 (5:1 합성 기준)</li>
                  <li>내 캐릭터 시뮬레이션 기능에 세르카 장비 반영</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>레이드 보상 계산기 UI 개선</li>
                  <li>일부 기능에서 실링의 가치가 제대로 반영되지 않던 문제 수정</li>
                  <li>디스코드 환율 계산 로직 최적화</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.3 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.3 (2026. 01. 14)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선 사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>재련 효율 페이지에서 실링의 가치가 제대로 반영되지 않던 문제 수정</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.2 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.2 (2026. 01. 12)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>레이드 보상 계산기 추가</li>
                  <li>에픽/카제로스/그림자 레이드 보상 조회</li>
                  <li>관문별 클리어 보상 및 더보기 효율 확인</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>가격 조정 스위치 배치 최적화</li>
                  <li>상재 1, 2단계 재료 필요 수량 오류 수정</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.1 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.1 (2026. 01. 11)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-green-400 mb-1 sm:mb-2">신규 기능</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>커스텀 계산기 (상자 선택 도우미) 기능 추가</li>
                  <li>사이트 UI 개선 및 사이드바 구현</li>
                  <li>업데이트 노트 작성 시작</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-blue-400 mb-1 sm:mb-2">개선사항</h3>
                <ul className="list-disc list-inside space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs md:text-sm text-gray-300 ml-3 sm:ml-4 whitespace-normal break-words">
                  <li>과금 효율 상품 종료예정일 날짜 처리 오류 수정</li>
                </ul>
              </div>
            </div>
          </div>

          {/* v0.3.0 */}
          <div className="bg-gray-800 rounded-none sm:rounded-lg p-3 sm:p-4 md:p-6 border-x-0 sm:border-x border-gray-700">
            <h2 className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-white mb-2 sm:mb-3 md:mb-4">v0.3.0 (2026. 01. 7)</h2>
            
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-300 whitespace-normal break-words">사이트 오픈 베타 시작 (유튜브 공개)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
