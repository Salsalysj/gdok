const https = require('https');

// .env.local 파일에서 API 키 읽기
const fs = require('fs');
const path = require('path');

let apiKey = '';

try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/LOSTARK_API_KEY\s*=\s*(.+)/);
    if (match) {
      apiKey = match[1].trim().replace(/^["']|["']$/g, ''); // 따옴표 제거
    }
  }
} catch (error) {
  console.error('환경변수 읽기 오류:', error.message);
}

if (!apiKey) {
  console.error('LOSTARK_API_KEY를 .env.local 파일에서 찾을 수 없습니다.');
  process.exit(1);
}

const itemName = process.argv[2] || '원한 각인서';

console.log(`\n🔍 "${itemName}" 아이템의 Category 값 확인 중...\n`);

// 각인서 관련 카테고리 코드들 (각인서는 보통 70000대 또는 특정 카테고리)
// Lost Ark API 문서에 따르면 각인서는 보통 특정 카테고리에 있습니다
const categoryCodes = [70000, 70010, 70020, 70030, 50000, 60000];
let foundResults = [];

async function searchItem(categoryCode, useItemName = true, pageNo = 1) {
  return new Promise((resolve, reject) => {
    // 먼저 ItemName으로 검색, 실패하면 빈 이름으로 시도
    const postData = JSON.stringify({
      Sort: 'GRADE',
      CategoryCode: categoryCode,
      CharacterClass: '',
      ItemTier: 0,
      ItemGrade: '',
      ItemName: useItemName ? itemName : '',
      PageNo: pageNo,
      SortCondition: 'ASC',
    });

    const options = {
      hostname: 'developer-lostark.game.onstove.com',
      path: '/markets/items',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            resolve({
              categoryCode,
              success: true,
              data: jsonData,
            });
          } catch (error) {
            resolve({
              categoryCode,
              success: false,
              error: 'JSON 파싱 오류',
              responseBody: data,
            });
          }
        } else {
          resolve({
            categoryCode,
            success: false,
            error: `HTTP ${res.statusCode}`,
            responseBody: data,
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        categoryCode,
        success: false,
        error: error.message,
      });
    });

    req.write(postData);
    req.end();
  });
}

(async () => {
  for (const categoryCode of categoryCodes) {
    // 먼저 ItemName으로 검색 시도
    let result = await searchItem(categoryCode, true);
    
    // 결과가 없으면 ItemName 없이 검색
    if (!result.success || !result.data?.Items?.length) {
      console.log(`   → ItemName 없이 다시 시도...`);
      result = await searchItem(categoryCode, false);
    }
    
    if (result.success && result.data?.Items?.length > 0) {
      console.log(`✅ CategoryCode ${categoryCode}: ${result.data.Items.length}개 결과 발견`);
      
      // 각인서 관련 아이템 찾기 ('원한' 키워드도 포함)
      const searchKeywords = ['각인서', '원한'];
      const engravingItems = result.data.Items.filter((item) => {
        const itemNameLower = (item.Name || '').toLowerCase();
        return searchKeywords.some(keyword => itemNameLower.includes(keyword.toLowerCase()));
      });
      
      // '원한'이 포함된 아이템도 확인
      const wishItems = result.data.Items.filter((item) => 
        (item.Name || '').includes('원한')
      );
      
      const matchedItem = engravingItems.find((item) => 
        item.Name === itemName || item.Name?.includes(itemName)
      ) || engravingItems[0];

      if (matchedItem || engravingItems.length > 0) {
        const displayItem = matchedItem || engravingItems[0];
        console.log(`\n📦 발견된 아이템: ${displayItem.Name}`);
        console.log('─────────────────────────────────────');
        console.log(`이름: ${displayItem.Name}`);
        console.log(`등급: ${displayItem.Grade || 'N/A'}`);
        console.log(`CategoryCode: ${displayItem.CategoryCode || 'N/A'}`);
        console.log(`Category: ${displayItem.Category || 'N/A'}`);
        
        // 응답에 포함된 모든 키 확인
        console.log('\n📋 응답에 포함된 모든 필드:');
        console.log(Object.keys(displayItem).join(', '));
        
        // CategoryCode나 Category 관련 필드가 있는지 확인
        const categoryFields = Object.keys(displayItem).filter(key => 
          key.toLowerCase().includes('category') || 
          key.toLowerCase().includes('cate')
        );
        
        if (categoryFields.length > 0) {
          console.log('\n🎯 Category 관련 필드:');
          categoryFields.forEach(field => {
            console.log(`  ${field}: ${displayItem[field]}`);
          });
        }
        
        // 각인서가 포함된 모든 아이템 이름 표시
        if (engravingItems.length > 0) {
          console.log(`\n📝 "${itemName}" 관련 발견된 항목들 (${engravingItems.length}개):`);
          engravingItems.slice(0, 10).forEach((item, idx) => {
            const hasCategoryCode = item.CategoryCode !== undefined ? ` [CategoryCode: ${item.CategoryCode}]` : '';
            console.log(`  ${idx + 1}. ${item.Name} (${item.Grade || 'N/A'})${hasCategoryCode}`);
          });
          if (engravingItems.length > 10) {
            console.log(`  ... 외 ${engravingItems.length - 10}개`);
          }
        }
        
        // '원한' 키워드가 있는 아이템 표시
        if (wishItems.length > 0) {
          console.log(`\n💫 "원한" 키워드 발견된 항목들 (${wishItems.length}개):`);
          wishItems.forEach((item, idx) => {
            const hasCategoryCode = item.CategoryCode !== undefined ? ` [CategoryCode: ${item.CategoryCode}]` : '';
            console.log(`  ${idx + 1}. ${item.Name} (${item.Grade || 'N/A'})${hasCategoryCode}`);
          });
        }
        
        if (matchedItem) {
          console.log('\n📄 일치하는 아이템의 전체 응답 구조:');
          console.log(JSON.stringify(matchedItem, null, 2));
          
          foundResults.push({
            searchedCategoryCode: categoryCode,
            item: matchedItem,
          });
        }
      } else {
        console.log(`⚠️  CategoryCode ${categoryCode}: 각인서 관련 아이템 없음`);
        console.log(`   (첫 3개 결과: ${result.data.Items.slice(0, 3).map(i => i.Name).join(', ')})`);
      }
    } else {
      console.log(`❌ CategoryCode ${categoryCode}: ${result.error || '결과 없음'}`);
      if (result.responseBody) {
        try {
          const errorData = JSON.parse(result.responseBody);
          console.log(`   에러 상세: ${JSON.stringify(errorData, null, 2)}`);
        } catch {
          console.log(`   응답: ${result.responseBody.substring(0, 200)}`);
        }
      }
    }
    
    // CategoryCode 70000의 경우 여러 페이지 확인 (각인서 카테고리일 가능성 높음)
    if (categoryCode === 70000 && result.success) {
      console.log(`\n📄 CategoryCode 70000에서 추가 페이지 확인 중...`);
      let allEngravings = [];
      let allWishItems = [];
      
      for (let page = 1; page <= 20; page++) {
        const pageResult = await searchItem(70000, false, page);
        if (pageResult.success && pageResult.data?.Items?.length > 0) {
          const pageEngravingItems = pageResult.data.Items.filter((item) => {
            const itemNameLower = (item.Name || '').toLowerCase();
            return itemNameLower.includes('각인서');
          });
          
          const pageWishItems = pageResult.data.Items.filter((item) => {
            return (item.Name || '').includes('원한');
          });
          
          allEngravings.push(...pageEngravingItems);
          allWishItems.push(...pageWishItems);
          
          if (pageEngravingItems.length > 0) {
            console.log(`  페이지 ${page}에서 각인서 ${pageEngravingItems.length}개 발견`);
          }
          if (pageWishItems.length > 0) {
            console.log(`  페이지 ${page}에서 "원한" ${pageWishItems.length}개 발견`);
          }
          
          if (pageResult.data.Items.length < 10) break; // 마지막 페이지
        } else {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      if (allEngravings.length > 0) {
        console.log(`\n📚 총 ${allEngravings.length}개의 각인서 발견:`);
        allEngravings.slice(0, 20).forEach((item, idx) => {
          const hasCategoryCode = item.CategoryCode !== undefined ? ` [CategoryCode: ${item.CategoryCode}]` : '';
          console.log(`  ${idx + 1}. ${item.Name} (${item.Grade || 'N/A'})${hasCategoryCode}`);
        });
        if (allEngravings.length > 20) {
          console.log(`  ... 외 ${allEngravings.length - 20}개`);
        }
      }
      
      if (allWishItems.length > 0) {
        console.log(`\n💫 총 ${allWishItems.length}개의 "원한" 관련 아이템 발견:`);
        allWishItems.forEach((item, idx) => {
          const hasCategoryCode = item.CategoryCode !== undefined ? ` [CategoryCode: ${item.CategoryCode}]` : '';
          console.log(`  ${idx + 1}. ${item.Name} (${item.Grade || 'N/A'})${hasCategoryCode}`);
          
          // 첫 번째 원한 각인서의 상세 정보 표시
          if (idx === 0 && item.Name?.includes('각인서')) {
            console.log(`\n🎯 "${item.Name}" 상세 정보:`);
            console.log(`  CategoryCode: ${item.CategoryCode || 'N/A'}`);
            console.log(`  Category: ${item.Category || 'N/A'}`);
            console.log(`  등급: ${item.Grade || 'N/A'}`);
            console.log(`  전체 필드: ${Object.keys(item).join(', ')}`);
            console.log('\n📄 전체 응답 구조:');
            console.log(JSON.stringify(item, null, 2));
            
            foundResults.push({
              searchedCategoryCode: categoryCode,
              item: item,
            });
          }
        });
      }
    }
    
    // API 호출 간격
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(50));
  console.log('\n📊 요약:');
  
  if (foundResults.length > 0) {
    const firstResult = foundResults[0];
    console.log(`\n✅ 발견된 CategoryCode: ${firstResult.item.CategoryCode || 'N/A'}`);
    console.log(`✅ Category: ${firstResult.item.Category || 'N/A'}`);
    console.log(`✅ 검색한 CategoryCode: ${firstResult.searchedCategoryCode}`);
  } else {
    console.log('\n❌ 아이템을 찾을 수 없습니다.');
  }
  
  console.log('\n');
})();

