export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-gray-700 border-r-transparent"></div>
        <p className="mt-4 text-gray-400">레이드 보상 데이터를 불러오는 중...</p>
      </div>
    </div>
  );
}
