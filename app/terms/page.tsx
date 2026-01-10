export const metadata = {
  title: '이용약관 - 껨산기',
  description: '껨산기 서비스 이용약관을 확인하세요.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-full bg-gray-950">
      <div className="py-12 md:py-16">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
            이용약관
          </h1>
        </div>

        <div className="space-y-6 text-gray-300">
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">서비스 제공</h2>
            <p className="text-lg leading-relaxed">
              본 서비스는 <span className="font-semibold">"있는 그대로"</span> 제공됩니다. 
              서비스의 정확성, 가용성, 완전성에 대해 어떠한 보장도 하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">서비스 변경 및 중단</h2>
            <p className="text-lg leading-relaxed">
              서비스는 사전 통지 없이 변경되거나 중단될 수 있습니다. 
              서비스 제공자는 언제든지 서비스를 수정하거나 중단할 권리를 보유합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">사용 목적</h2>
            <p className="text-lg leading-relaxed">
              본 서비스는 정보 제공 및 참고 목적으로만 제공됩니다. 
              계산 결과는 참고용이며, 실제 게임 내 가치와 다를 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">결제 및 구독</h2>
            <p className="text-lg leading-relaxed">
              본 서비스는 현재 무료로 제공되며, 결제나 구독에 대한 약속이나 의무를 암시하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-4">책임의 제한</h2>
            <p className="text-lg leading-relaxed text-gray-400">
              서비스 제공자는 본 서비스의 사용으로 인해 발생하는 어떠한 직접적, 간접적, 
              부수적, 특별, 결과적 손해에 대해서도 책임을 지지 않습니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}


