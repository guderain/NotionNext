import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'

const AIFloatAssistant = () => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [frameLoading, setFrameLoading] = useState(false)

  const visible = useMemo(() => {
    return router.pathname === '/' || router.pathname === '/[prefix]'
  }, [router.pathname])

  if (!visible) return null

  return (
    <>
      {open && (
        <div className='fixed bottom-24 right-4 z-[999] flex h-[70vh] max-h-[640px] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-cyan-200/20 bg-slate-950/95 shadow-2xl shadow-cyan-900/30 backdrop-blur-xl sm:right-6'>
          <div className='flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2'>
            <div className='text-sm text-cyan-100'>KB-AI Assistant</div>
            <button
              type='button'
              className='rounded-md border border-white/15 px-2 py-0.5 text-xs text-slate-200 hover:bg-white/10'
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <iframe
            title='KB-AI Chat'
            src='/ai?embed=1'
            className={`min-h-0 flex-1 w-full border-0 bg-slate-950 transition-opacity duration-200 ${
              frameLoading ? 'opacity-0' : 'opacity-100'
            }`}
            onLoad={() => setFrameLoading(false)}
          />
          {frameLoading && (
            <div className='pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/92'>
              <div className='flex flex-col items-center gap-3 text-cyan-100'>
                <span className='h-8 w-8 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300' />
                <span className='text-xs tracking-wide text-slate-300'>正在加载助手...</span>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type='button'
        aria-label='Open AI Assistant'
        onClick={() =>
          setOpen(v => {
            const nextOpen = !v
            if (nextOpen) {
              setFrameLoading(true)
            }
            return nextOpen
          })
        }
        className='group fixed bottom-5 right-4 z-[1000] flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200/35 bg-gradient-to-br from-cyan-500 to-blue-600 text-2xl text-white shadow-xl shadow-cyan-800/40 transition hover:scale-105 sm:right-6'
      >
        <span className='select-none'>🤖</span>
        <span className='pointer-events-none absolute -left-44 top-1/2 hidden -translate-y-1/2 rounded-lg border border-white/15 bg-slate-900/95 px-2 py-1 text-xs text-slate-100 shadow-lg group-hover:block'>
          {open ? 'Hide AI Assistant' : 'Open AI Assistant'}
        </span>
      </button>
    </>
  )
}

export default AIFloatAssistant
