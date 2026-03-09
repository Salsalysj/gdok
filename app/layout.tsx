import type { Metadata } from 'next'
import './globals.css'
import Navigation from './components/Navigation'
import PriceAdjustmentBar from './components/PriceAdjustmentBar'
import Footer from '../components/Footer'
import ScrollToTopButton from './components/ScrollToTopButton'
import { PriceOverrideProvider } from './contexts/PriceOverrideContext'
import { ValueDbProvider } from './contexts/ValueDbContext'
import { FavoritesProvider } from './contexts/FavoritesContext'
import { getValueDbData } from '@/lib/valueDb'
import { parseUpgradeCsv, getMarketInfoMap, createStages } from './value-db/page'
import { 
  UPGRADE_FILE_WEAPON, 
  UPGRADE_FILE_ARMOR,
  BASE_MATERIALS_WEAPON,
  BASE_MATERIALS_ARMOR,
  BREATH_ITEM_WEAPON,
  BREATH_ITEM_ARMOR,
  OPTIONAL_METALLURGY_ITEMS_WEAPON,
  OPTIONAL_METALLURGY_ITEMS_ARMOR,
} from './value-db/page'
import path from 'path'

export const metadata: Metadata = {
  title: '껨산기',
  description: '로스트아크 효율 계산 도구 (컨텐츠 보상, 과금 효율, 재련 효율, 이벤트 효율)',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.png', type: 'image/png', sizes: '128x128' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '128x128' }],
  },
  other: {
    'naver-site-verification': '8f08231fdf313560e91a3a0594db9fc420681267',
    'google-adsense-account': 'ca-pub-8290185223283573',
  },
  
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const UPGRADE_FILE_WEAPON_SERKA = path.join(process.cwd(), 'upgrade3.csv');
  const UPGRADE_FILE_ARMOR_SERKA = path.join(process.cwd(), 'upgrade4.csv');
  
  const BASE_MATERIALS_WEAPON_SERKA = [
    '운명의 파괴석 결정',
    '위대한 운명의 돌파석',
    '상급 아비도스 융화 재료',
    '운명의 파편',
    '실링',
  ];

  const BASE_MATERIALS_ARMOR_SERKA = [
    '운명의 수호석 결정',
    '위대한 운명의 돌파석',
    '상급 아비도스 융화 재료',
    '운명의 파편',
    '실링',
  ];

  const [
    valueDbData,
    weaponData,
    armorData,
    weaponDataSerka,
    armorDataSerka,
    marketInfo
  ] = await Promise.all([
    getValueDbData(),
    parseUpgradeCsv(UPGRADE_FILE_WEAPON, 'upgrade1.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR, 'upgrade2.csv'),
    parseUpgradeCsv(UPGRADE_FILE_WEAPON_SERKA, 'upgrade3.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR_SERKA, 'upgrade4.csv'),
    getMarketInfoMap(),
  ]);

  const weaponStages = createStages(
    weaponData.levels,
    weaponData.rowMap,
    BASE_MATERIALS_WEAPON,
    BREATH_ITEM_WEAPON,
    OPTIONAL_METALLURGY_ITEMS_WEAPON
  );

  const armorStages = createStages(
    armorData.levels,
    armorData.rowMap,
    BASE_MATERIALS_ARMOR,
    BREATH_ITEM_ARMOR,
    OPTIONAL_METALLURGY_ITEMS_ARMOR
  );

  const weaponStagesSerka = createStages(
    weaponDataSerka.levels,
    weaponDataSerka.rowMap,
    BASE_MATERIALS_WEAPON_SERKA,
    BREATH_ITEM_WEAPON,
    OPTIONAL_METALLURGY_ITEMS_WEAPON
  );

  const armorStagesSerka = createStages(
    armorDataSerka.levels,
    armorDataSerka.rowMap,
    BASE_MATERIALS_ARMOR_SERKA,
    BREATH_ITEM_ARMOR,
    OPTIONAL_METALLURGY_ITEMS_ARMOR
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '껨산기',
    alternateName: ['gcalc', '껨산기'],
    url: 'https://www.gcalc.kr',
  };

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Google AdSense - data-ad-client, data-ad-slot은 AdsenseSidebar 컴포넌트에서 설정 */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8290185223283573"
          crossOrigin="anonymous"
        />
      </head>
      <body suppressHydrationWarning className="flex flex-col min-h-screen">
        <FavoritesProvider>
          <PriceOverrideProvider>
              <ValueDbProvider
              entries={valueDbData.entries}
              cubeStageRewards={valueDbData.cubeStageRewards}
              kurzanStageRewards={valueDbData.kurzanStageRewards}
              marketPriceMap={valueDbData.marketPriceMap}
              etcListData={valueDbData.etcListDataObj}
              rates={valueDbData.rates}
              weaponStages={weaponStages}
              armorStages={armorStages}
              weaponStagesSerka={weaponStagesSerka}
              armorStagesSerka={armorStagesSerka}
              marketInfo={marketInfo}
              hellStages={valueDbData.hellStages}
              hell1Stages={valueDbData.hell1Stages}
              hell2Stages={valueDbData.hell2Stages}
              narakStages={valueDbData.narakStages}
              narak1Stages={valueDbData.narak1Stages}
              narak2Stages={valueDbData.narak2Stages}
              valueDbEntryMap={new Map(Object.entries(valueDbData.entryMap))}
              cubeStageTotals={valueDbData.cubeStageTotals}
              explanationMap={valueDbData.explanationMap}
              craftMaterialShopData={valueDbData.craftMaterialShopData ?? null}
            >
              {/* Header */}
              <Navigation />
              {/* Body - pt로 고정 네비 아래부터 시작 */}
              <div className="flex-1 min-w-0 pt-14 md:pt-16">
                <PriceAdjustmentBar />
                <div className="max-w-[1080px] mx-auto px-4 lg:px-6 py-4 pb-6">
                  <main className="min-w-0">
                    {children}
                  </main>
                </div>
              </div>

              {/* 모바일: 스크롤 시 맨 위로 가기 버튼 */}
              <ScrollToTopButton />
              
              {/* Footer */}
              <div className="w-full">
                <div className="max-w-[1800px] mx-auto px-4 lg:px-6">
                  <Footer />
                </div>
              </div>
              </ValueDbProvider>
            </PriceOverrideProvider>
        </FavoritesProvider>
      </body>
    </html>
  )
}

