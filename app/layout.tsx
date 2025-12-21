import type { Metadata } from 'next'
import './globals.css'
import Navigation from './components/Navigation'
import { PriceOverrideProvider } from './contexts/PriceOverrideContext'
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
  title: '로스트아크 시세 검색',
  description: '로스트아크 거래소 아이템 시세 검색',
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
          <Navigation />
          <div className="flex" style={{ height: 'calc(100vh - 4rem)' }}>
            <div className="hidden lg:block w-96 flex-shrink-0">
              <ValueDBSidebar
                entries={valueDbData.entries}
                cubeStageRewards={valueDbData.cubeStageRewards}
                kurzanStageRewards={valueDbData.kurzanStageRewards}
                marketPriceMap={valueDbData.marketPriceMap}
                etcListData={valueDbData.etcListDataObj}
                weaponStages={weaponStages}
                armorStages={armorStages}
                marketInfo={marketInfo}
                hellStages={valueDbData.hellStages}
                narakStages={valueDbData.narakStages}
                valueDbEntryMap={new Map(Object.entries(valueDbData.entryMap))}
              />
            </div>
            <div className="flex-1 overflow-y-auto min-w-0">
              {children}
            </div>
          </div>
        </PriceOverrideProvider>
      </body>
    </html>
  )
}

