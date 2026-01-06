/**
 * 가치계산DB의 모든 항목을 CSV 파일로 추출하는 스크립트
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getValueDbData } from '../lib/valueDb';

async function exportValueDbToCsv() {
  try {
    console.log('가치계산DB 데이터 로딩 중...');
    const valueDbData = await getValueDbData();
    const entries = valueDbData.entries;

    console.log(`총 ${entries.length}개의 항목을 찾았습니다.`);

    // CSV 헤더
    const headers = ['항목명', '단위타입', '단위가치', '비고'];
    
    // CSV 행 생성
    const rows = entries.map(entry => {
      const itemName = entry.itemName || '';
      const unitType = entry.unitType || '';
      const unitValue = entry.unitValue != null ? entry.unitValue.toString() : '';
      const note = entry.note || '';
      
      // CSV 형식에 맞게 쉼표와 따옴표 처리
      const escapeCsv = (value: string): string => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      return [
        escapeCsv(itemName),
        escapeCsv(unitType),
        escapeCsv(unitValue),
        escapeCsv(note)
      ].join(',');
    });

    // CSV 내용 생성
    const csvContent = [headers.join(','), ...rows].join('\n');

    // 파일 저장 경로
    const outputPath = path.join(process.cwd(), 'value-db-export.csv');
    
    // UTF-8 BOM 추가 (Excel에서 한글 깨짐 방지)
    const bom = '\uFEFF';
    await fs.writeFile(outputPath, bom + csvContent, 'utf-8');

    console.log(`✅ CSV 파일이 생성되었습니다: ${outputPath}`);
    console.log(`   - 총 항목 수: ${entries.length}개`);
    console.log(`   - 가치가 있는 항목: ${entries.filter(e => e.unitValue != null).length}개`);
    console.log(`   - 가치가 없는 항목: ${entries.filter(e => e.unitValue == null).length}개`);
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    if (error instanceof Error) {
      console.error('   상세:', error.message);
      console.error('   스택:', error.stack);
    }
    process.exit(1);
  }
}

exportValueDbToCsv();

