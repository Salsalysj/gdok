export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="h-8 w-48 bg-gray-800 rounded animate-pulse mb-2"></div>
          <div className="h-5 w-64 bg-gray-800 rounded animate-pulse"></div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
            <div className="h-6 w-32 bg-gray-700 rounded animate-pulse mb-4"></div>
            <div className="h-10 bg-gray-700 rounded animate-pulse mb-4"></div>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-20 bg-gray-700 rounded animate-pulse"></div>
              ))}
            </div>
          </div>
          
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
            <div className="h-6 w-24 bg-gray-700 rounded animate-pulse mb-4"></div>
            <div className="h-32 bg-gray-700 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
