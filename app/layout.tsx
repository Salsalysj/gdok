import type { Metadata } from 'next'
import './globals.css'
import Navigation from './components/Navigation'
import { PriceOverrideProvider } from './contexts/PriceOverrideContext'
import { ValueDbProvider } from './contexts/ValueDbContext'
import ValueDBSidebar from './components/ValueDBSidebar'
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
  description: '로스트아크 효율 계산 도구 (컨텐츠 보상, 과금 효율, 재련 효율, 이벤트 효율, 골드 환율)',
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

  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>
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
          >
            <Navigation />
            <div className="flex" style={{ height: 'calc(100vh - 4rem)' }}>
              <div className="hidden lg:block w-96 flex-shrink-0">
                <ValueDBSidebar />
              </div>
              <div className="flex-1 overflow-y-auto min-w-0">
                {children}
              </div>
            </div>
          </ValueDbProvider>
        </PriceOverrideProvider>
      </body>
    </html>
  )
}

