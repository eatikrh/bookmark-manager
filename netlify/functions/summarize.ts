import type { Handler } from '@netlify/functions'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

function extractMainText(html: string): string {
  // Naive extraction for now; can be improved later or replaced with a library
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, '')
  const bodyMatch = withoutStyles.match(/<body[\s\S]*?<\/body>/i)
  const body = bodyMatch ? bodyMatch[0] : withoutStyles
  const text = body
    .replace(/<[^>]+>/g, ' ') // strip tags
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
  return text
}

async function callOpenAI(text: string) {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY')
  }

  const prompt = `Based on the following article text, provide a one-sentence summary and suggest 3 to 5 relevant tags (as a comma-separated string). Return ONLY a valid JSON object with keys "summary" and "tags".\n\nArticle:\n${text.slice(0, 12000)}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a helpful assistant that returns strict JSON.' },
        { role: 'user', content: prompt },
      ],
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || 'OpenAI error')
  }

  const content = data?.choices?.[0]?.message?.content
  return JSON.parse(content)
}

export const handler: Handler = async (event) => {
  try {
    const url = event.queryStringParameters?.url
    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing url parameter' }),
      }
    }

    const resp = await fetch(url, { redirect: 'follow' })
    if (!resp.ok) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Failed to fetch article' }) }
    }

    const html = await resp.text()
    const text = extractMainText(html)
    if (text.length < 150) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Not enough readable content' }) }
    }

    const ai = await callOpenAI(text)
    return {
      statusCode: 200,
      body: JSON.stringify({ summary: ai.summary, tags: ai.tags }),
      headers: { 'Content-Type': 'application/json' },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { statusCode: 500, body: JSON.stringify({ error: message }) }
  }
}
