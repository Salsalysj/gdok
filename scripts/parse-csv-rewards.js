const fs = require('fs');
const path = require('path');

const cube3tFile = path.join(__dirname, '..', 'cube3t.csv');
const cube4tFile = path.join(__dirname, '..', 'cube4t.csv');
const tobul3tFile = path.join(__dirname, '..', 'tobul3t.csv');
const tobul4tFile = path.join(__dirname, '..', 'tobul4t.csv');
const outputFile = path.join(__dirname, '..', 'data', 'csv-rewards.json');

function parseCSV(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      console.warn(`  ⚠️ ${path.basename(filePath)}: 데이터가 비어있습니다.`);
      return [];
    }
    
    // 헤더 파싱
    const headers = lines[0].split(',').map(h => h.trim());
    const firstColumnName = headers[0] || '';
    
    const result = [];
    
    // 데이터 행 처리
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(',').map(v => v.trim());
      const stageName = values[0] || '';
      
      if (!stageName) continue;
      
      const rewards = [];
      
      // 각 컬럼을 아이템으로 처리 (첫 번째 컬럼 제외)
      for (let j = 1; j < headers.length && j < values.length; j++) {
        const itemName = headers[j].trim();
        const quantityStr = values[j].trim();
        
        if (!itemName || !quantityStr) continue;
        
        // 수량 파싱
        const quantity = parseFloat(quantityStr.replace(/[^\d.-]/g, '')) || 0;
        
        if (quantity > 0) {
          rewards.push({ itemName, quantity });
        }
      }
      
      if (rewards.length > 0) {
        result.push({
          stage: stageName,
          rewards: rewards
        });
      }
    }
    
    return result;
  } catch (error) {
    console.error(`  ❌ ${path.basename(filePath)} 파싱 실패:`, error);
    return [];
  }
}

try {
  console.log('CSV 파일 파싱 시작...');
  
  const result = {
    '에브니 큐브': {
      '티어3': parseCSV(cube3tFile),
      '티어4': parseCSV(cube4tFile),
    },
    '가디언 토벌': {
      '티어3': parseCSV(tobul3tFile),
      '티어4': parseCSV(tobul4tFile),
    },
  };
  
  // JSON 파일로 저장
  const dataDir = path.dirname(outputFile);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf-8');
  console.log('\n✅ CSV 파일 파싱 완료:', outputFile);
  console.log(`에브니 큐브: 티어3 ${result['에브니 큐브']['티어3'].length}개, 티어4 ${result['에브니 큐브']['티어4'].length}개`);
  console.log(`가디언 토벌: 티어3 ${result['가디언 토벌']['티어3'].length}개, 티어4 ${result['가디언 토벌']['티어4'].length}개`);
  
} catch (error) {
  console.error('❌ CSV 파일 파싱 실패:', error);
  process.exit(1);
}

