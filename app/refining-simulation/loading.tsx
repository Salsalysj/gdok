export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div className="space-y-6">
        {/* 헤더 스켈레톤 */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-64 mb-2"></div>
          <div className="h-4 bg-gray-700 rounded w-96"></div>
        </div>

        {/* 탭 버튼 스켈레톤 */}
        <div className="flex gap-3 mb-6">
          <div className="h-10 bg-gray-800 rounded-lg w-32 animate-pulse"></div>
          <div className="h-10 bg-gray-800 rounded-lg w-32 animate-pulse"></div>
          <div className="h-10 bg-gray-800 rounded-lg w-32 animate-pulse"></div>
        </div>

        {/* 콘텐츠 스켈레톤 */}
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 animate-pulse">
            <div className="h-6 bg-gray-700 rounded w-48 mb-4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-700 rounded w-full"></div>
              <div className="h-4 bg-gray-700 rounded w-3/4"></div>
              <div className="h-4 bg-gray-700 rounded w-5/6"></div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 animate-pulse">
            <div className="h-6 bg-gray-700 rounded w-48 mb-4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="h-32 bg-gray-700 rounded"></div>
              <div className="h-32 bg-gray-700 rounded"></div>
              <div className="h-32 bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
