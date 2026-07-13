import { callClaudeWithRetry } from './aiHelper.js'

const ENRICHMENT_SYSTEM = 'You are a cybersecurity analyst building a vendor intelligence database for GuidePoint Security, a leading cybersecurity VAR. Be exhaustive, accurate, and honest — include weaknesses and competitive positioning. Return ONLY valid JSON with no preamble or markdown fences.'

const enrichmentPrompt = name => `Research the vendor "${name}" and return a COMPLETE and ACCURATE profile of every major product or product line they sell. Be exhaustive — if CrowdStrike has 15 products, return all 15.

Return ONLY a JSON object with no preamble or markdown:

{
  "name": "official vendor name",
  "tagline": "one sentence describing what the vendor is known for",
  "overview": "3-4 sentence paragraph: what they do, who they serve, where they sit in the market",
  "industry_position": "Leader|Challenger|Up and Comer|Niche",
  "industry_position_reason": "one sentence explaining why",
  "founded_year": number or null,
  "hq": "City, State/Country",
  "website": "https://...",
  "products": [
    {
      "name": "exact product name",
      "description": "2-3 sentences: what this specific product does",
      "primary_domain": "one of: Identity & Access | Cloud & App Security | Network & Infra | Data & Endpoint | Risk & Compliance | OT/IoT | Sec Operations",
      "primary_sub_domain": "the most specific sub-domain this maps to (use GuidePoint security framework terminology)",
      "secondary_domains": ["other domains this product touches"],
      "key_capabilities": ["capability 1", "capability 2", "capability 3"],
      "ideal_customer": "2 sentences: what type of org gets the most value from this product",
      "not_a_fit_when": "1-2 sentences: when you would NOT recommend this product",
      "differentiators": ["what makes this product uniquely strong"],
      "weaknesses": ["honest weaknesses or limitations"],
      "things_to_watch_out_for": ["gotchas, licensing complexity, deployment challenges, common complaints"],
      "typical_competitors": ["Vendor A", "Vendor B", "Vendor C"]
    }
  ]
}

Be honest and accurate. Include weaknesses and watch-outs — this is an internal sales tool, not marketing material. If a product competes in a space where it is not the leader, say so.`

const comparePrompt = (vendorA, productA, vendorB, productB) =>
  `You are a cybersecurity sales advisor at GuidePoint Security helping an Enterprise Client Manager explain vendor differences to a CISO or security leader.

Compare ${vendorA}${productA ? ` (specifically their ${productA} product)` : ''} against ${vendorB}${productB ? ` (specifically their ${productB} product)` : ''}.

Write this comparison the way you would explain it over coffee to a CISO — plain language, real-world context, honest about gaps.

Return ONLY JSON:
{
  "headline": "one sentence capturing the core difference",
  "choose_a_if": "2-3 sentences: specific scenarios, org profiles, and problems where Vendor A wins",
  "choose_b_if": "2-3 sentences: specific scenarios, org profiles, and problems where Vendor B wins",
  "key_differences": [
    {
      "dimension": "e.g. Deployment Complexity",
      "vendor_a": "how A handles this",
      "vendor_b": "how B handles this"
    }
  ],
  "capability_overlap": "1-2 sentences: where they actually compete on the same ground",
  "capability_gaps": [
    {
      "vendor": "A or B",
      "gap": "what this vendor cannot do that the other can"
    }
  ],
  "guidepoint_angle": "1-2 sentences: how GuidePoint would position this conversation with a client",
  "bottom_line": "2-3 sentences: the plain-language summary a sales rep would say to close the conversation"
}

If the two products don't actually compete, still complete the comparison but note in capability_gaps that Vendor X has no capability in this area, and explain what each does instead.`

function extractJSON(text) {
  const clean = (text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const start = clean.indexOf('{')
  if (start === -1) throw new Error('No JSON object in response')
  let depth = 0, inStr = false, esc = false, end = -1
  for (let i = start; i < clean.length; i++) {
    const c = clean[i]
    if (esc) { esc = false; continue }
    if (c === '\\' && inStr) { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) throw new Error('Incomplete JSON in response')
  return JSON.parse(clean.slice(start, end + 1))
}

export async function enrichVendor(vendorName) {
  const { data } = await callClaudeWithRetry({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: ENRICHMENT_SYSTEM,
    messages: [{ role: 'user', content: enrichmentPrompt(vendorName) }],
  }, null, null)

  if (data?.error) throw new Error(data.error.message || data.error.type || 'AI error')
  const text = data?.content?.[0]?.text || ''
  if (!text) throw new Error('Empty response from AI')
  return extractJSON(text)
}

export async function compareVendors(vendorA, productA, vendorB, productB) {
  const { data } = await callClaudeWithRetry({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: comparePrompt(vendorA, productA, vendorB, productB) }],
  }, null, null)

  if (data?.error) throw new Error(data.error.message || data.error.type || 'AI error')
  const text = data?.content?.[0]?.text || ''
  if (!text) throw new Error('Empty response from AI')
  return extractJSON(text)
}
