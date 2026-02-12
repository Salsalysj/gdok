export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="h-8 bg-gray-800 rounded w-48 mb-2 animate-pulse" />
        <div className="h-4 bg-gray-800 rounded w-96 animate-pulse" />
        <div className="flex gap-3">
          <div className="flex-1 h-11 bg-gray-800 rounded-lg animate-pulse" />
          <div className="h-11 w-24 bg-gray-800 rounded-lg animate-pulse" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-800 rounded-lg border border-gray-700 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
