const fs = require('fs');
const path = require('path');

// CSV 파일 읽기
const csvPath = path.join(__dirname, '..', 'raid-reward.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// CSV 파싱
const lines = csvContent.split('\n').filter(line => line.trim());
const headers = lines[0].split(',');

// 보상 아이템 컬럼 인덱스 찾기 (6번째 컬럼부터 끝까지 - 레벨 컬럼 추가됨)
const rewardItemColumns = headers.slice(6);

// 데이터 구조 생성
const result = {
  '에픽 레이드': {},
  '카제로스 레이드': {},
  '그림자 레이드': {}
};

// 난이도별 레벨 정보 저장
const difficultyLevels = {};

// 데이터 행 처리
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line || line.split(',').every(cell => !cell.trim())) continue;
  
  const cells = line.split(',');
  
  const category = cells[0]?.trim();
  const name = cells[1]?.trim();
  const difficulty = cells[2]?.trim();
  const level = cells[3]?.trim();
  const gate = cells[4]?.trim();
  const type = cells[5]?.trim();
  
  if (!category || !name || !difficulty || !gate || !type) continue;
  
  // 보상 데이터 생성
  const rewards = {};
  rewardItemColumns.forEach((itemName, index) => {
    const value = cells[6 + index]?.trim().replace(/\r/g, '');
    if (value && value !== '' && value !== '0') {
      // 숫자로 변환 시도
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        const cleanItemName = itemName.replace(/\r/g, '').trim();
        rewards[cleanItemName] = numValue;
      }
    }
  });
  
  // 구조 생성
  if (!result[category][name]) {
    result[category][name] = {};
  }
  if (!result[category][name][difficulty]) {
    result[category][name][difficulty] = {
      level: level || '',
      gates: {}
    };
  }
  
  // 난이도별 레벨 정보 저장 (첫 번째 발견된 레벨 사용)
  if (level && !result[category][name][difficulty].level) {
    result[category][name][difficulty].level = level;
  }
  
  if (!result[category][name][difficulty].gates[gate]) {
    result[category][name][difficulty].gates[gate] = {};
  }
  
  result[category][name][difficulty].gates[gate][type] = rewards;
}

// JSON 파일로 저장
const outputPath = path.join(__dirname, '..', 'data', 'raid-rewards.json');
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

console.log('✅ raid-rewards.json 파일이 생성되었습니다.');
console.log(`📁 위치: ${outputPath}`);
