import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[100svh] grid place-items-center bg-white text-slate-900 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Page Not Found</h1>
        <p className="mt-2 text-slate-600">The page you are looking for does not exist.</p>
        <Link href="/" className="mt-4 inline-block rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700">Go Home</Link>
      </div>
    </div>
  )
}
