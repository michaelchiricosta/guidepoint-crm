// SUPERSEDED — Anthropic calls now go through /api/ai (Vercel serverless proxy).
// The browser no longer sends the API key or calls Anthropic directly.
// This file is kept only for reference and is not imported by any component.
//
// To use AI from a component, call callClaudeWithRetry or callAI from
// src/utils/aiHelper.js — both route through /api/ai automatically.

export const callClaude = async (messages, system) => {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system,
      messages,
    }),
  })
  return res.json()
}
