const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelFile = path.join(__dirname, '..', 'calc.xlsx');
const outputFile = path.join(__dirname, '..', 'data', 'content-rewards.json');

try {
  console.log('Excel 파일 읽기 시작:', excelFile);
  const workbook = XLSX.readFile(excelFile);
  
  console.log('시트 목록:', workbook.SheetNames);
  
  const result = {};
  
  // 각 시트별로 처리
  workbook.SheetNames.forEach(sheetName => {
    console.log(`\n시트 처리 중: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    // 시트명에 따라 분기
    if (sheetName === '카던&전선') {
      result['카던&전선'] = processSheetData(data, sheetName);
    } else if (sheetName === '에브니 큐브') {
      result['에브니 큐브'] = processSheetData(data, sheetName);
    } else if (sheetName === '가디언 토벌') {
      result['가디언 토벌'] = processSheetData(data, sheetName);
    }
  });
  
  // JSON 파일로 저장
  const dataDir = path.dirname(outputFile);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf-8');
  console.log('\n✅ Excel 파일 파싱 완료:', outputFile);
  console.log('\n변환된 데이터 구조:');
  console.log(JSON.stringify(result, null, 2));
  
} catch (error) {
  console.error('❌ Excel 파일 파싱 실패:', error);
  process.exit(1);
}

function processSheetData(data, sheetName) {
  if (!data || data.length === 0) {
    console.warn(`  ⚠️ ${sheetName}: 데이터가 비어있습니다.`);
    return {};
  }
  
  console.log(`  첫 번째 행 (헤더):`, data[0]);
  if (data.length > 1) {
    console.log(`  두 번째 행 (데이터 예시):`, data[1]);
  }
  
  // 헤더 행 찾기 (첫 번째 행이 헤더일 것으로 가정)
  const headers = data[0].map(h => String(h || '').trim());
  console.log(`  헤더 개수: ${headers.length}`);
  
  // "이름" 또는 "입장레벨" 컬럼 찾기
  const nameIdx = findColumnIndex(headers.map(h => h.toLowerCase()), ['이름', 'name', '단계', 'stage']);
  const levelIdx = findColumnIndex(headers.map(h => h.toLowerCase()), ['입장레벨', '레벨', 'level', '난이도']);
  
  console.log(`  컬럼 인덱스 - 이름:${nameIdx}, 입장레벨:${levelIdx}`);
  
  if (headers.length < 2) {
    console.warn(`  ⚠️ 헤더가 너무 적습니다. 다른 형식의 데이터일 수 있습니다.`);
    // 에브니 큐브 같은 경우 특별 처리
    if (sheetName === '에브니 큐브') {
      // 에브니 큐브는 다른 형식일 수 있으므로 빈 객체 반환
      return {};
    }
    return {};
  }
  
  const result = {};
  
  // 첫 번째 행은 헤더, 두 번째 행부터 데이터
  // 각 행은 하나의 단계이고, 각 컬럼(헤더 제외)이 아이템
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    // 단계명/이름 찾기
    const stageName = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
    const level = levelIdx >= 0 ? String(row[levelIdx] || '').trim() : '';
    
    // 단계명이나 레벨이 없으면 건너뛰기
    // 또한 "이름", "입장레벨" 같은 헤더 값 자체는 건너뛰기
    if ((!stageName && !level) || stageName === '이름' || level === '입장레벨') continue;
    
    // 레벨이 숫자가 아니면 건너뛰기 (헤더 값일 가능성)
    if (level && isNaN(parseFloat(level)) && level !== '') continue;
    
    // 레벨 키 결정 (레벨이 있으면 레벨 사용, 없으면 기본값)
    // "입장레벨"이나 "이름" 같은 헤더명이 값으로 들어오는 경우 필터링
    let levelKey = level || (levelIdx === -1 ? '기본' : '레벨없음');
    
    // 헤더명과 같은 값은 무시
    if (levelKey === '입장레벨' || levelKey === '레벨' || levelKey === '이름' || levelKey === 'name') {
      levelKey = '기본';
    }
    
    if (!result[levelKey]) {
      result[levelKey] = [];
    }
    
    const rewards = [];
    
    // 각 컬럼을 아이템으로 처리 (이름, 입장레벨 컬럼 제외)
    for (let j = 0; j < headers.length; j++) {
      // 이름과 입장레벨 컬럼은 건너뛰기
      if (j === nameIdx || j === levelIdx) continue;
      
      const itemName = headers[j].trim();
      const quantityValue = row[j];
      
      // 빈 아이템명이나 값은 건너뛰기
      // 헤더명 자체가 아이템명이 될 수 없는 경우 (예: "에브니확률")는 조건부 처리
      if (!itemName) continue;
      
      // "에브니확률" 같은 확률 관련 컬럼은 보상으로 취급하지 않음
      if (itemName.toLowerCase().includes('확률') || itemName.toLowerCase().includes('probability')) {
        continue;
      }
      
      if (!quantityValue && quantityValue !== 0) continue;
      
      // 수량 파싱
      let quantity = 0;
      if (typeof quantityValue === 'number') {
        quantity = quantityValue;
      } else if (typeof quantityValue === 'string') {
        quantity = parseFloat(quantityValue.replace(/[^\d.-]/g, '')) || 0;
      }
      
      // 수량이 0보다 크면 보상에 추가
      if (quantity > 0) {
        rewards.push({ itemName, quantity });
      }
    }
    
    if (rewards.length > 0) {
      result[levelKey].push({
        stage: stageName || `단계${result[levelKey].length + 1}`,
        rewards: rewards
      });
    }
  }
  
  // 단계별로 정렬 (이름 기준)
  // 빈 키나 잘못된 키 제거
  Object.keys(result).forEach(levelKey => {
    // "기본" 키의 경우, stage가 "이름"인 경우 제거
    if (levelKey === '기본' || levelKey === '레벨없음') {
      result[levelKey] = result[levelKey].filter(stage => stage.stage !== '이름' && stage.stage !== '');
    }
    if (result[levelKey].length > 0) {
      result[levelKey].sort((a, b) => {
        return a.stage.localeCompare(b.stage, 'ko');
      });
    } else {
      // 빈 배열 제거
      delete result[levelKey];
    }
  });
  
  const totalStages = Object.values(result).reduce((sum, stages) => sum + stages.length, 0);
  const totalRewards = Object.values(result).reduce((sum, stages) => 
    sum + stages.reduce((s, stage) => s + stage.rewards.length, 0), 0);
  
  console.log(`  ✅ 처리 완료: ${Object.keys(result).length}개 레벨, 총 ${totalStages}개 단계, 총 ${totalRewards}개 보상`);
  
  return result;
}

function findColumnIndex(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (keywords.some(keyword => header.includes(keyword))) {
      return i;
    }
  }
  return -1;
}

