export const metadata = {
  title: '껨산기 by 스누껨독',
  description: '껨산기는 로스트아크 게임 내 가치를 계산하고 효율을 분석하는 도구입니다.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-full bg-gray-950">
      <div className="py-6 sm:py-8 md:py-12 lg:py-16 sm:px-6">
        <div className="mb-4 sm:mb-6 md:mb-8 px-4 sm:px-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight text-white mb-1 sm:mb-2">
            껨산기에 대하여
          </h1>
        </div>

        <div className="space-y-3 sm:space-y-4 md:space-y-6 text-gray-300 px-4 sm:px-0">
          <section>
            <h2 className="text-sm sm:text-base md:text-lg font-semibold text-white mb-2 sm:mb-3 md:mb-4">서비스 소개</h2>
            <p className="text-[10px] sm:text-xs md:text-sm leading-relaxed whitespace-normal break-words">
              <span className="font-semibold">껨산기</span>는 로스트아크 게임 내 아이템의 가치를 계산하고 
              효율을 분석하는 도구입니다. 컨텐츠 보상, 과금 효율, 재련 효율, 이벤트 효율, 골드 환율 등 
              다양한 측면에서 게임 내 자원의 가치를 정확하게 계산하여 최적의 선택을 돕습니다.
            </p>
          </section>

          <section>
            <h2 className="text-sm sm:text-base md:text-lg font-semibold text-white mb-2 sm:mb-3 md:mb-4">프로젝트 정보</h2>
            <p className="text-[10px] sm:text-xs md:text-sm leading-relaxed whitespace-normal break-words">
              본 서비스는 독립적인 개인 프로젝트로 운영되고 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-sm sm:text-base md:text-lg font-semibold text-white mb-2 sm:mb-3 md:mb-4">면책 조항</h2>
            <p className="text-[10px] sm:text-xs md:text-sm leading-relaxed text-gray-400 whitespace-normal break-words">
              본 서비스는 정보 제공 및 참고 목적으로만 제공됩니다. 
              계산 결과의 정확성을 보장하지 않으며, 게임 내 실제 가치와 다를 수 있습니다. 
              모든 결정은 사용자의 판단에 따라 이루어져야 합니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}


