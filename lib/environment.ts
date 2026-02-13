/**
 * 환경 변수 체크 헬퍼 함수
 * main 브랜치 production 환경이 아닐 때 저장 기능 허용
 */

/**
 * 패키지/이벤트 효율 저장이 허용되는지 확인
 * @returns true면 저장 허용, false면 차단
 */
export function isPackageSaveAllowed(): boolean {
  // 환경 변수로 명시적 활성화
  if (process.env.NEXT_PUBLIC_ALLOW_PACKAGE_SAVE === 'true') {
    return true;
  }
  
  // 로컬 개발 환경
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // main 브랜치 production 환경이 아닐 때 허용
  const isMainProduction = process.env.VERCEL_GIT_COMMIT_REF === 'main' 
    && process.env.VERCEL_ENV === 'production';
  
  return !isMainProduction;
}

/**
 * 혈석 상점 저장이 허용되는지 확인
 * @returns true면 저장 허용, false면 차단
 */
export function isBloodstoneShopSaveAllowed(): boolean {
  // 환경 변수로 명시적 활성화
  if (process.env.NEXT_PUBLIC_ALLOW_BLOODSTONE_SHOP_SAVE === 'true') {
    return true;
  }
  
  // 로컬 개발 환경
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // main 브랜치 production 환경이 아닐 때 허용
  const isMainProduction = process.env.VERCEL_GIT_COMMIT_REF === 'main' 
    && process.env.VERCEL_ENV === 'production';
  
  return !isMainProduction;
}

/**
 * 제작 재료 교환 저장이 허용되는지 확인
 * production 환경이 아닐 때만 저장 버튼 노출 및 JSON 저장 허용
 * @returns true면 저장 허용, false면 차단
 */
export function isCraftMaterialSaveAllowed(): boolean {
  // 환경 변수로 명시적 활성화
  if (process.env.NEXT_PUBLIC_ALLOW_CRAFT_MATERIAL_SAVE === 'true') {
    return true;
  }

  // 로컬 개발 환경
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // main 브랜치 production 환경이 아닐 때 허용
  const isMainProduction =
    process.env.VERCEL_GIT_COMMIT_REF === 'main' && process.env.VERCEL_ENV === 'production';

  return !isMainProduction;
}
