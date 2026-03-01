import { FormEvent, useEffect, useMemo, useState } from 'react'

import { useRouter } from 'next/router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type SourceEvent = {
  type: 'sources'
  data: string[]
}

type TokenEvent = {
  type: 'token'
  data: string
}

type DoneEvent = {
  type: 'done'
}

type StreamEvent = SourceEvent | TokenEvent | DoneEvent

type ChatApiResponse = {
  answer?: string
  sources?: string[]
}

type SourceContentResponse = {
  path: string
  title: string
  content: string
}

type ChatMessage = {
  id: string
  question: string
  answer: string
  sources: string[]
  loading: boolean
  error?: string
}

type SourcePreview = {
  path: string
  title: string
  content: string
}

const baseUrl = process.env.NEXT_PUBLIC_KB_AI_BASE_URL || 'http://localhost:8000'
const apiKey = process.env.NEXT_PUBLIC_KB_AI_API_KEY || ''
const jsonHeaders: HeadersInit = apiKey
  ? { 'Content-Type': 'application/json', 'X-API-Key': apiKey }
  : { 'Content-Type': 'application/json' }
const authHeaders: HeadersInit = apiKey ? { 'X-API-Key': apiKey } : {}
const quickPrompts = [
  'NotionNext 如何接入 RAG 问答？',
  'langchain + milvus 的最佳实践是什么？',
  '知识库文档分块参数应该怎么选？'
]

function formatSourceLabel(source: string): string {
  const normalized = source.replaceAll('\\', '/')
  const segments = normalized.split('/')
  return segments[segments.length - 1] || source
}

function isHttpSource(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://')
}

function splitParagraphs(content: string): string[] {
  return content
    .split(/\r?\n\s*\r?\n/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function paragraphSummary(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  if (compact.length <= 90) return compact
  return `${compact.slice(0, 90)}...`
}

function extractQueryTokens(query: string): string[] {
  const normalized = query.toLowerCase()
  const words = normalized
    .split(/[^\u4e00-\u9fa5a-z0-9]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)

  const tokens = new Set<string>(words)
  const chinese = normalized.replace(/[^\u4e00-\u9fa5]/g, '')
  for (let i = 0; i < chinese.length - 1; i += 1) {
    tokens.add(chinese.slice(i, i + 2))
  }
  return Array.from(tokens)
}

function findBestParagraphIndex(paragraphs: string[], query: string): number {
  if (!paragraphs.length) return -1
  const tokens = extractQueryTokens(query)
  if (!tokens.length) return 0

  let bestIndex = 0
  let bestScore = -1
  paragraphs.forEach((paragraph, index) => {
    const content = paragraph.toLowerCase()
    let score = 0
    for (const token of tokens) {
      if (content.includes(token)) {
        score += token.length >= 4 ? 2 : 1
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

function updateMessage(messages: ChatMessage[], id: string, updater: (msg: ChatMessage) => ChatMessage): ChatMessage[] {
  return messages.map((msg) => (msg.id === id ? updater(msg) : msg))
}

export default function AIPage() {
  const router = useRouter()
  const [isClientReady, setIsClientReady] = useState(false)
  const isEmbedded = isClientReady && router.query.embed === '1'

  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [globalError, setGlobalError] = useState('')
  const [streamMode, setStreamMode] = useState(true)
  const [preview, setPreview] = useState<SourcePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [collapsedParagraphs, setCollapsedParagraphs] = useState<Record<number, boolean>>({})
  const [previewFocusIndex, setPreviewFocusIndex] = useState<number | null>(null)

  const canSubmit = useMemo(() => question.trim().length > 0 && !loading, [question, loading])
  const previewParagraphs = useMemo(() => splitParagraphs(preview?.content || ''), [preview?.content])

  useEffect(() => {
    setIsClientReady(true)
  }, [])

  useEffect(() => {
    if (previewFocusIndex === null) return
    const el = document.getElementById(`preview-paragraph-${previewFocusIndex}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [previewFocusIndex, preview?.path])

  const submitQuestion = async (q: string) => {
    const cleanQuestion = q.trim()
    if (!cleanQuestion || loading) return

    const messageId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const nextMessage: ChatMessage = {
      id: messageId,
      question: cleanQuestion,
      answer: '',
      sources: [],
      loading: true
    }

    setQuestion('')
    setLoading(true)
    setGlobalError('')
    setMessages((prev) => [nextMessage, ...prev])

    try {
      if (streamMode) {
        await askStream(cleanQuestion, messageId)
      } else {
        await askOnce(cleanQuestion, messageId)
      }
      setMessages((prev) =>
        updateMessage(prev, messageId, (msg) => ({
          ...msg,
          loading: false
        }))
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '请求失败，请稍后重试'
      setGlobalError(message)
      setMessages((prev) =>
        updateMessage(prev, messageId, (msg) => ({
          ...msg,
          loading: false,
          error: message
        }))
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await submitQuestion(question)
  }

  const askOnce = async (q: string, messageId: string) => {
    const res = await fetch(`${baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ question: q, session_id: 'notionnext-web' })
    })
    if (!res.ok) {
      throw new Error(`接口错误: ${res.status}`)
    }

    const data = (await res.json()) as ChatApiResponse
    setMessages((prev) =>
      updateMessage(prev, messageId, (msg) => ({
        ...msg,
        answer: data.answer || '',
        sources: Array.isArray(data.sources) ? data.sources : []
      }))
    )
  }

  const askStream = async (q: string, messageId: string) => {
    const res = await fetch(`${baseUrl}/api/v1/chat/stream`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ question: q, session_id: 'notionnext-web' })
    })
    if (!res.ok || !res.body) {
      throw new Error(`流式接口错误: ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let done = false

    while (!done) {
      const { value, done: streamDone } = await reader.read()
      done = streamDone
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })

      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        const line = block
          .split('\n')
          .find((item) => item.startsWith('data: '))
        if (!line) continue

        const payload = line.slice(6)
        let evt: StreamEvent
        try {
          evt = JSON.parse(payload) as StreamEvent
        } catch {
          continue
        }

        if (evt.type === 'sources') {
          setMessages((prev) =>
            updateMessage(prev, messageId, (msg) => ({
              ...msg,
              sources: evt.data || []
            }))
          )
        } else if (evt.type === 'token') {
          setMessages((prev) =>
            updateMessage(prev, messageId, (msg) => ({
              ...msg,
              answer: msg.answer + (evt.data || '')
            }))
          )
        }
      }
    }
  }

  const onClickSource = async (source: string, relatedQuestion: string) => {
    if (isHttpSource(source)) {
      window.open(source, '_blank', 'noopener,noreferrer')
      return
    }

    setPreview(null)
    setPreviewError('')
    setPreviewLoading(true)
    setPreviewFocusIndex(null)

    try {
      const res = await fetch(`${baseUrl}/api/v1/sources/content?path=${encodeURIComponent(source)}`, {
        headers: authHeaders
      })
      if (!res.ok) {
        throw new Error(`来源读取失败: ${res.status}`)
      }
      const data = (await res.json()) as SourceContentResponse
      const paragraphs = splitParagraphs(data.content)
      const focusIndex = findBestParagraphIndex(paragraphs, relatedQuestion)

      const nextCollapsed: Record<number, boolean> = {}
      paragraphs.forEach((_, idx) => {
        nextCollapsed[idx] = idx !== focusIndex
      })

      setPreview({ path: data.path, title: data.title, content: data.content })
      setCollapsedParagraphs(nextCollapsed)
      setPreviewFocusIndex(focusIndex)
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : '来源读取失败')
    } finally {
      setPreviewLoading(false)
    }
  }

  const clearHistory = () => {
    if (loading) return
    setMessages([])
    setGlobalError('')
  }

  return (
    <main
      className={`relative overflow-hidden text-slate-100 ${
        isEmbedded ? 'h-full bg-transparent p-0' : 'min-h-screen bg-slate-950 px-4 py-8 sm:px-6 sm:py-10'
      }`}
    >
      {!isEmbedded ? (
        <>
          <div className='ai-blob ai-blob-one' />
          <div className='ai-blob ai-blob-two' />
          <div className='ai-grid' />
        </>
      ) : null}

      <div className={`relative mx-auto ${isEmbedded ? 'h-full max-w-none space-y-0' : 'max-w-6xl space-y-6'}`}>
        <header className={`border-white/15 bg-white/5 backdrop-blur-xl ${isEmbedded ? 'rounded-none border-b p-4' : 'rounded-2xl border p-6'}`}>
          <div className='mb-4 flex items-center justify-between gap-4'>
            <span className='inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-medium tracking-wide text-cyan-200'>
              KB-AI Assistant
            </span>
          </div>
          {isEmbedded ? (
            <p className='text-sm text-slate-300/90'>对话模式</p>
          ) : (
            <>
              <h1 className='text-2xl font-semibold sm:text-3xl'>知识库问答控制台</h1>
              <p className='mt-2 text-sm text-slate-300/90'>
                支持多轮会话、来源追溯和原文预览。可在下方连续提问，查看每一轮回答与对应来源。
              </p>
            </>
          )}
        </header>

        <section
          className={`border-white/15 bg-slate-900/65 backdrop-blur-xl ${
            isEmbedded
              ? 'flex h-[calc(100%-77px)] flex-col overflow-hidden rounded-none'
              : 'rounded-2xl border p-5 sm:p-6'
          }`}
        >
          <div className={`${isEmbedded ? 'flex-1 overflow-y-auto overflow-x-hidden p-4' : ''}`}>
            <section className='space-y-4'>
              {messages.length === 0 ? (
                <div className='rounded-2xl border border-white/15 bg-slate-900/65 p-6 text-sm text-slate-300 backdrop-blur-xl'>
                  还没有会话记录，开始你的第一条提问。
                </div>
              ) : null}

              {messages.map((message) => (
                <article key={message.id} className='min-w-0 rounded-2xl border border-white/15 bg-slate-900/65 p-5 backdrop-blur-xl sm:p-6'>
                  <div className='mb-4 rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-4'>
                    <p className='mb-1 text-xs text-cyan-200/90'>你的问题</p>
                    <p className='text-sm leading-6 text-cyan-50'>{message.question}</p>
                  </div>

                  <div className='min-w-0 overflow-hidden rounded-xl border border-white/10 bg-slate-950/75 p-4 text-sm leading-7 text-slate-100'>
                    <p className='mb-2 text-xs text-slate-400'>AI 回答</p>
                    {message.loading && !message.answer ? (
                      <div className='flex items-center gap-3 rounded-lg border border-cyan-300/20 bg-cyan-400/5 px-3 py-3 text-slate-200/90'>
                        <span className='h-5 w-5 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300' />
                        <span className='text-sm'>AI 正在思考中...</span>
                      </div>
                    ) : null}

                    {message.answer ? (
                      <div className='kb-markdown max-w-full font-sans'>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.answer}</ReactMarkdown>
                        {message.loading ? <span className='typing-caret'>|</span> : null}
                      </div>
                    ) : null}

                    {message.error ? <p className='text-rose-300'>{message.error}</p> : null}
                  </div>

                  <div className='mt-4'>
                    <p className='mb-2 text-xs text-slate-400'>来源（点击可自动定位相关段落，URL 将直接新开页面）</p>
                    {message.sources.length ? (
                      <ul className='grid gap-2 sm:grid-cols-2'>
                        {message.sources.map((source) => (
                          <li key={`${message.id}-${source}`}>
                            <button
                              type='button'
                              className='w-full break-all rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-cyan-300/35 hover:bg-cyan-400/10'
                              onClick={() => {
                                void onClickSource(source, message.question)
                              }}
                              title={source}
                            >
                              {formatSourceLabel(source)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className='text-sm text-slate-400'>暂无来源引用。</p>
                    )}
                  </div>
                </article>
              ))}
            </section>
          </div>

          <div className={`${isEmbedded ? 'shrink-0 border-t border-white/10 bg-slate-900/95 p-4 pb-5' : ''}`}>
            <form
              onSubmit={(e) => {
                void handleSubmit(e)
              }}
              className='space-y-4'
            >
              <div className='flex flex-wrap gap-2'>
                  {quickPrompts.map((item) => (
                    <button
                      key={item}
                      type='button'
                      className='rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-300/35 hover:bg-cyan-400/10'
                      onClick={() => {
                        setQuestion(item)
                        void submitQuestion(item)
                      }}
                      disabled={loading}
                    >
                      {item}
                    </button>
                  ))}
                </div>

              <textarea
                className='h-32 w-full rounded-xl border border-white/10 bg-slate-950/80 p-4 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/25'
                placeholder='输入你的问题，例如：NotionNext 项目中如何落地知识库问答系统？'
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />

              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='flex items-center gap-3'>
                  <button
                    type='submit'
                    disabled={!canSubmit}
                    className='rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-cyan-700/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    {loading ? '思考中...' : '发送问题'}
                  </button>
                  <button
                      type='button'
                      className='rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-slate-200 transition hover:bg-white/10 disabled:opacity-40'
                      onClick={clearHistory}
                      disabled={loading || messages.length === 0}
                    >
                      清空历史
                    </button>
                  <label className='inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200'>
                    <input
                      type='checkbox'
                      className='h-4 w-4 accent-cyan-400'
                      checked={streamMode}
                      onChange={(e) => setStreamMode(e.target.checked)}
                    />
                    流式返回
                  </label>
                </div>
              </div>
            </form>

            {globalError ? (
              <p className='mt-4 rounded-lg border border-rose-300/35 bg-rose-400/10 px-3 py-2 text-sm text-rose-100'>
                {globalError}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {(previewLoading || preview || previewError) && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4'>
          <div className='max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-slate-950 shadow-2xl'>
            <div className='flex items-center justify-between border-b border-white/10 px-4 py-3'>
              <div>
                <p className='text-xs text-slate-400'>来源预览</p>
                <p className='text-sm font-medium text-slate-100'>{preview?.title || '加载中...'}</p>
              </div>
              <button
                type='button'
                className='rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-sm text-slate-200 hover:bg-white/10'
                onClick={() => {
                  setPreview(null)
                  setPreviewError('')
                  setPreviewLoading(false)
                  setCollapsedParagraphs({})
                  setPreviewFocusIndex(null)
                }}
              >
                关闭
              </button>
            </div>

            <div className='max-h-[70vh] overflow-auto px-4 py-3'>
              {previewLoading ? <p className='text-sm text-slate-300'>正在加载来源内容...</p> : null}
              {previewError ? <p className='text-sm text-rose-300'>{previewError}</p> : null}
              {preview ? (
                <>
                  <div className='mb-3 flex flex-wrap items-center gap-2'>
                    <span className='rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-300'>
                      {preview.path}
                    </span>
                    <button
                      type='button'
                      className='rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10'
                      onClick={() => {
                        void navigator.clipboard.writeText(preview.path)
                      }}
                    >
                      复制路径
                    </button>
                    <button
                      type='button'
                      className='rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10'
                      onClick={() => {
                        const nextState: Record<number, boolean> = {}
                        previewParagraphs.forEach((_, idx) => {
                          nextState[idx] = true
                        })
                        setCollapsedParagraphs(nextState)
                        setPreviewFocusIndex(null)
                      }}
                    >
                      全部折叠
                    </button>
                    <button
                      type='button'
                      className='rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10'
                      onClick={() => {
                        const nextState: Record<number, boolean> = {}
                        previewParagraphs.forEach((_, idx) => {
                          nextState[idx] = false
                        })
                        setCollapsedParagraphs(nextState)
                        setPreviewFocusIndex(null)
                      }}
                    >
                      全部展开
                    </button>
                  </div>
                  <div className='space-y-2 rounded-xl border border-white/10 bg-slate-900/70 p-3'>
                    {previewParagraphs.length ? (
                      previewParagraphs.map((paragraph, index) => {
                        const isCollapsed = collapsedParagraphs[index] ?? false
                        const isFocused = previewFocusIndex === index
                        return (
                          <section
                            id={`preview-paragraph-${index}`}
                            key={`${preview.path}-${index}`}
                            className={`rounded-lg border bg-black/20 ${
                              isFocused ? 'border-cyan-300/60' : 'border-white/10'
                            }`}
                          >
                            <button
                              type='button'
                              className='flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5'
                              onClick={() => {
                                setCollapsedParagraphs((prev) => ({
                                  ...prev,
                                  [index]: !isCollapsed
                                }))
                                setPreviewFocusIndex(index)
                              }}
                            >
                              <span>段落 {index + 1}</span>
                              <span>{isFocused ? '已定位' : isCollapsed ? '展开' : '折叠'}</span>
                            </button>
                            <div className='border-t border-white/10 px-3 py-2 text-sm text-slate-100'>
                              {isCollapsed ? (
                                <p className='text-slate-300'>{paragraphSummary(paragraph)}</p>
                              ) : (
                                <pre className='whitespace-pre-wrap break-words font-sans'>{paragraph}</pre>
                              )}
                            </div>
                          </section>
                        )
                      })
                    ) : (
                      <p className='px-2 py-1 text-sm text-slate-400'>该来源暂无可展示段落。</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .ai-grid {
          position: absolute;
          inset: 0;
          background-image: linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: radial-gradient(circle at center, black, transparent 85%);
          pointer-events: none;
        }

        .ai-blob {
          position: absolute;
          width: 28rem;
          height: 28rem;
          border-radius: 9999px;
          filter: blur(80px);
          opacity: 0.34;
          animation: float 9s ease-in-out infinite;
          pointer-events: none;
        }

        .ai-blob-one {
          top: -8rem;
          left: -6rem;
          background: radial-gradient(circle, #22d3ee 0%, rgba(34, 211, 238, 0) 70%);
        }

        .ai-blob-two {
          bottom: -9rem;
          right: -8rem;
          background: radial-gradient(circle, #3b82f6 0%, rgba(59, 130, 246, 0) 70%);
          animation-delay: 1.8s;
        }

        .typing-caret {
          display: inline-block;
          margin-left: 2px;
          animation: blink 1s steps(2, start) infinite;
        }

        .kb-markdown {
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .kb-markdown :global(p) {
          margin: 0.3rem 0;
          line-height: 1.75;
        }

        .kb-markdown :global(ul),
        .kb-markdown :global(ol) {
          margin: 0.4rem 0;
          padding-left: 1.2rem;
        }

        .kb-markdown :global(li) {
          margin: 0.25rem 0;
        }

        .kb-markdown :global(pre),
        .kb-markdown :global(code) {
          white-space: pre-wrap;
          word-break: break-word;
          overflow-wrap: anywhere;
        }

        .kb-markdown :global(pre) {
          margin: 0.5rem 0;
          padding: 0.5rem 0.7rem;
          border-radius: 0.5rem;
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(148, 163, 184, 0.2);
        }

        @keyframes blink {
          to {
            visibility: hidden;
          }
        }

        @keyframes float {
          0% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(0, 10px, 0);
          }
          100% {
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>
    </main>
  )
}
