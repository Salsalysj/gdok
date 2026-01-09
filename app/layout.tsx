import type { Metadata } from 'next'
import './globals.css'
import Navigation from './components/Navigation'
import Footer from '../components/Footer'
import SidebarWrapper from './components/SidebarWrapper'
import LeftSidebarPlaceholder from './components/LeftSidebarPlaceholder'
import ValueDBSidebar from './components/ValueDBSidebar'
import { SidebarProvider } from './contexts/SidebarContext'
import { PriceOverrideProvider } from './contexts/PriceOverrideContext'
import { ValueDbProvider } from './contexts/ValueDbContext'
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

export const metadata: Metadata = {
  title: '껨산기 by 스누껨독',
  description: '로스트아크 효율 계산 도구 (컨텐츠 보상, 과금 효율, 재련 효율, 이벤트 효율)',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  other: {
    'naver-site-verification': '8f08231fdf313560e91a3a0594db9fc420681267',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [
    valueDbData,
    weaponData,
    armorData,
    marketInfo
  ] = await Promise.all([
    getValueDbData(),
    parseUpgradeCsv(UPGRADE_FILE_WEAPON, 'upgrade1.csv'),
    parseUpgradeCsv(UPGRADE_FILE_ARMOR, 'upgrade2.csv'),
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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '껨산기',
    url: 'https://gcalc.kr',
  };

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning className="flex flex-col min-h-screen">
        <SidebarProvider>
          <PriceOverrideProvider>
            <ValueDbProvider
              entries={valueDbData.entries}
              cubeStageRewards={valueDbData.cubeStageRewards}
              kurzanStageRewards={valueDbData.kurzanStageRewards}
              marketPriceMap={valueDbData.marketPriceMap}
              etcListData={valueDbData.etcListDataObj}
              weaponStages={weaponStages}
              armorStages={armorStages}
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
            >
              {/* Header */}
              <Navigation />
              
              {/* Body: 3-column grid layout */}
              <div className="flex-1 min-w-0">
                <div className="max-w-[1800px] mx-auto px-6">
                  <div className="grid lg:grid-cols-[280px,1fr,360px] gap-3">
                    {/* Left Sidebar */}
                    <aside className="hidden lg:block">
                      <div className="sticky top-14 md:top-16 h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)]">
                        <LeftSidebarPlaceholder />
                      </div>
                    </aside>
                    
                    {/* Main Content */}
                    <main className="min-w-0 pt-14 md:pt-16 pb-6">
                      {children}
                    </main>
                    
                    {/* Right Sidebar */}
                    <aside className="hidden lg:block">
                      <div className="sticky top-14 md:top-16 h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)]">
                        <ValueDBSidebar />
                      </div>
                    </aside>
                  </div>
                </div>
              </div>
              
              {/* Mobile Sidebar Wrapper (for toggle functionality) */}
              <SidebarWrapper />
              
              {/* Footer */}
              <div className="w-full">
                <div className="max-w-[1800px] mx-auto px-6">
                  <Footer />
                </div>
              </div>
            </ValueDbProvider>
          </PriceOverrideProvider>
        </SidebarProvider>
      </body>
    </html>
  )
}

