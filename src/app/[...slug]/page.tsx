export default function PlaceholderPage({ params }: { params: { slug?: string[] } }) {
  const path = '/' + (params.slug?.join('/') || '')
  return (
    <div className="min-h-[100svh] bg-white text-slate-900 grid place-items-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{path || '/'}</h1>
        <p className="mt-2 text-slate-600">This page is not implemented yet</p>
      </div>
    </div>
  )
}


