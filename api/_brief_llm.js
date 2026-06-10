export class BriefLLMNotConfiguredError extends Error {
  constructor() {
    super('DEEPSEEK_API_KEY is not configured')
    this.code = 'BRIEF_NOT_CONFIGURED'
  }
}

export async function fetchBriefLLM({ system, user }) {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('[brief] DEEPSEEK_API_KEY missing')
    throw new BriefLLMNotConfiguredError()
  }

  let res
  try {
    res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: 1500,
        stream: false,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60000),
    })
  } catch (err) {
    console.error('[brief] deepseek fetch failed', err.message)
    err.code = 'BRIEF_PROVIDER_FAILED'
    throw err
  }

  if (!res.ok) {
    const bodyText = await res.text()
    const detail = bodyText.slice(0, 300)
    console.error('[brief] deepseek non-2xx', res.status, detail)
    const err = new Error(`DeepSeek API error: ${res.status}`)
    err.code = 'BRIEF_PROVIDER_FAILED'
    err.status = res.status
    err.detail = detail
    throw err
  }

  let data
  try {
    data = await res.json()
  } catch {
    console.error('[brief] json parse failed')
    const err = new Error('DeepSeek response JSON parse failed')
    err.code = 'BRIEF_PROVIDER_FAILED'
    throw err
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    console.error('[brief] empty content', JSON.stringify(data?.choices?.[0]?.message ?? {}).slice(0, 300))
    const err = new Error('Empty LLM response')
    err.code = 'BRIEF_PROVIDER_FAILED'
    throw err
  }

  return content
}
