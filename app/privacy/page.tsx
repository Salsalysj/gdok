export const metadata = {
  title: '개인정보 처리방침 - 껨산기',
  description: '껨산기 개인정보 처리방침을 확인하세요.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-full bg-gray-950">
      <div className="py-6 sm:py-8 md:py-12 lg:py-16 sm:px-6">
        <div className="mb-4 sm:mb-6 md:mb-8 px-4 sm:px-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight text-white mb-1 sm:mb-2">
            개인정보 처리방침
          </h1>
        </div>

        <div className="space-y-3 sm:space-y-4 md:space-y-6 text-gray-300 px-4 sm:px-0">
          <section>
            <h2 className="text-sm sm:text-base md:text-lg font-semibold text-white mb-2 sm:mb-3 md:mb-4">개인정보 수집</h2>
            <p className="text-[10px] sm:text-xs md:text-sm leading-relaxed whitespace-normal break-words">
              현재 본 사이트는 이름, 이메일 등 개인정보를 수집하지 않습니다. 
              계정 생성 기능이 없으며, 사용자 식별을 위한 개인정보를 요구하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-sm sm:text-base md:text-lg font-semibold text-white mb-2 sm:mb-3 md:mb-4">광고</h2>
            <p className="text-[10px] sm:text-xs md:text-sm leading-relaxed whitespace-normal break-words">
              현재 본 사이트는 Google AdSense를 포함한 어떠한 광고도 사용하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-sm sm:text-base md:text-lg font-semibold text-white mb-2 sm:mb-3 md:mb-4">분석 도구</h2>
            <p className="text-[10px] sm:text-xs md:text-sm leading-relaxed whitespace-normal break-words">
              현재 본 사이트는 Google Analytics(GA4)를 포함한 어떠한 분석 도구도 사용하지 않습니다.
            </p>
            <p className="text-[10px] sm:text-xs md:text-sm leading-relaxed mt-2 sm:mt-3 md:mt-4 text-gray-400 whitespace-normal break-words">
              향후 서비스 개선을 위해 분석 도구(예: Google Analytics)를 도입할 수 있습니다. 
              그 경우 본 정책이 업데이트됩니다.
            </p>
          </section>

          <section>
            <h2 className="text-sm sm:text-base md:text-lg font-semibold text-white mb-2 sm:mb-3 md:mb-4">문의</h2>
            <p className="text-[10px] sm:text-xs md:text-sm leading-relaxed whitespace-normal break-words">
              개인정보 처리방침에 대한 문의사항이 있으시면 다음 이메일로 연락해 주세요:
            </p>
            <p className="text-[10px] sm:text-xs md:text-sm leading-relaxed mt-1 sm:mt-2">
              <span className="text-gray-300 hover:text-white">snuggdok[at]지메일.com</span>
            </p>
          </section>

          <section>
            <p className="text-[10px] sm:text-xs md:text-sm text-gray-400 mt-4 sm:mt-6 md:mt-8">
              최종 업데이트: 2026년
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}


