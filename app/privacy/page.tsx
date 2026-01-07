export default function PrivacyPage() {
  return (
    <div className="min-h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-8">
          개인정보 처리방침
        </h1>

        <div className="space-y-6 text-gray-300">
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">개인정보 수집</h2>
            <p className="text-lg leading-relaxed">
              현재 본 사이트는 이름, 이메일 등 개인정보를 수집하지 않습니다. 
              계정 생성 기능이 없으며, 사용자 식별을 위한 개인정보를 요구하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">광고</h2>
            <p className="text-lg leading-relaxed">
              현재 본 사이트는 Google AdSense를 포함한 어떠한 광고도 사용하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">분석 도구</h2>
            <p className="text-lg leading-relaxed">
              현재 본 사이트는 Google Analytics(GA4)를 포함한 어떠한 분석 도구도 사용하지 않습니다.
            </p>
            <p className="text-lg leading-relaxed mt-4 text-gray-400">
              향후 서비스 개선을 위해 분석 도구(예: Google Analytics)를 도입할 수 있습니다. 
              그 경우 본 정책이 업데이트됩니다.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">문의</h2>
            <p className="text-lg leading-relaxed">
              개인정보 처리방침에 대한 문의사항이 있으시면 다음 이메일로 연락해 주세요:
            </p>
            <p className="text-lg leading-relaxed mt-2">
              <a href="mailto:snuggdok@gmail.com" className="text-blue-400 hover:text-blue-300 transition-colors">
                snuggdok@gmail.com
              </a>
            </p>
          </section>

          <section>
            <p className="text-sm text-gray-400 mt-8">
              최종 업데이트: 2026년
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

