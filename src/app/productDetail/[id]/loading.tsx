"use client"

export default function LoadingProductDetail() {
  return (
    <div className="min-h-screen bg-[#f3f8f3] flex flex-col px-4 py-8 lg:py-12">
      <div className="w-full max-w-6xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-gray-200 rounded-full" />
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="h-[360px] sm:h-[420px] lg:h-[450px] bg-white rounded-3xl border border-gray-100 shadow-sm" />
          <div className="space-y-4">
            <div className="h-6 w-3/4 bg-gray-200 rounded" />
            <div className="h-5 w-1/2 bg-gray-200 rounded" />
            <div className="h-8 w-full bg-gray-200 rounded" />
            <div className="h-32 w-full bg-gray-200 rounded-xl" />
          </div>
        </div>
        <div className="h-48 w-full bg-white border border-gray-100 rounded-3xl shadow-sm" />
      </div>
    </div>
  );
}
