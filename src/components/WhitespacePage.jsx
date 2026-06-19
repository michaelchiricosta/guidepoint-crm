import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { ArrowLeft, Pencil, User, Cpu, Zap, Trash2, GitMerge } from 'lucide-react'
import { saveData } from '../supabase.js'
import { isBlockedAccount, getAccountOwner, isOpenNamedAccount } from '../namedAccounts.js'
import { S } from '../theme.js'
import { uid, extractJSON, fmtDate } from '../utils.js'
import { trackAI, FEATURES } from '../utils/aiTracker.js'
import { AI_MODELS, hashStr, getAICache, setAICache, friendlyApiError, isLocked, callClaudeWithRetry, extractStructuredAIResponse } from '../utils/aiHelper.js'

const MONTH_MAP = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12',jan:'01',feb:'02',mar:'03',apr:'04',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'}
const detectDate = text => {
  const t = text.slice(0,200)
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
  const mdy = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  const full = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/i)
  if (full) { const m=MONTH_MAP[full[1].toLowerCase()]; if(m) return `${full[3]}-${m}-${full[2].padStart(2,'0')}` }
  const partial = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)
  if (partial) { const m=MONTH_MAP[partial[1].toLowerCase()]; if(m) return `${new Date().getFullYear()}-${m}-${partial[2].padStart(2,'0')}` }
  return null
}

const WS_VENDORS = ['CrowdStrike','SentinelOne','Palo Alto','Zscaler','Okta','Splunk','Wiz','Varonis','SailPoint','CyberArk','Qualys','Tenable','Rapid7','Darktrace','Vectra','Arctic Wolf','ReliaQuest','Cloudflare','Fortinet','Check Point','Cisco','Proofpoint','Mimecast','Abnormal','KnowBe4','BeyondTrust','Delinea','Microsoft','ThreatLocker','LogRhythm','QRadar','Elastic','Datadog','Lacework','Orca','VMware','Symantec','1Password','Google','Saviynt','NetSpy','IBM','Carbon Black','FireEye','Mandiant','ServiceNow']

// Simple, fast contact extraction — only structured "Contact: Name, Title — context" lines
const parseContactsFromEntries = entries => {
  try {
    const map = {}
    const lines = entries.map(e=>e.text||'').join('\n').split('\n')
    for (const line of lines) {
      const m = line.match(/^Contact:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)[,\s]*([^—]{0,60}?)(?:\s*—\s*(.{0,200}))?$/)
      if (!m) continue
      const name = m[1].trim()
      const title = (m[2]||'').replace(/^[,\s]+|[,\s]+$/g,'').trim()
      const ctx = (m[3]||'').trim()
      if (!map[name]) map[name] = {name, title:'', contexts:[], mentions:0}
      if (!map[name].title && title) map[name].title = title
      if (ctx) map[name].contexts.push(ctx)
      map[name].mentions++
    }
    // Also scan for "Name, Title" pattern with simple title keyword list (no backtracking)
    const titleKw = ['VP','SVP','EVP','Director','Manager','CISO','CTO','CEO','CFO','COO','CIO','President','Head of','Head,']
    const allText = entries.map(e=>e.text||'').join('\n')
    const nameRe = /\b([A-Z][a-z]+ [A-Z][a-z]+)\s*[,(]\s*([^,.\n(]{3,40})/g
    let m2
    while ((m2 = nameRe.exec(allText)) !== null) {
      const name = m2[1].trim()
      const candidate = m2[2].trim()
      if (titleKw.some(t => candidate.toLowerCase().includes(t.toLowerCase()))) {
        if (!map[name]) map[name] = {name, title: candidate.slice(0,40), contexts:[], mentions:0}
        map[name].mentions++
      }
    }
    return Object.values(map)
  } catch(e) { return [] }
}

// Simple, fast tech extraction — structured lines + plain string indexOf for vendors
const parseTechFromEntries = entries => {
  try {
    const map = {}
    const allText = entries.map(e=>e.text||'').join('\n')
    const lower = allText.toLowerCase()
    // Structured "Technology: Vendor — Status — context" lines
    const lines = allText.split('\n')
    for (const line of lines) {
      const m = line.match(/^Technology:\s*([^—]+?)\s*—\s*(Customer|Evaluating|Replacing|Considering|Unknown)\s*—\s*(.{0,200})$/)
      if (!m) continue
      const name = m[1].trim(), status = m[2], ctx = m[3].trim()
      if (!map[name]) map[name] = {name, status, contexts:[], mentions:0}
      map[name].status = status
      if (ctx) map[name].contexts.push(ctx)
      map[name].mentions++
    }
    // Known vendor scan — simple toLowerCase indexOf, no complex regex
    for (const vendor of WS_VENDORS) {
      const vl = vendor.toLowerCase()
      const idx = lower.indexOf(vl)
      if (idx === -1) continue
      if (map[vendor]) { map[vendor].mentions++; continue }
      // Detect status with simple substring checks around the match
      const window = lower.slice(Math.max(0,idx-40), idx+vendor.length+40)
      let status = 'Unknown'
      if (window.includes('evaluat') || window.includes('looking at') || window.includes('considering')) status = 'Evaluating'
      else if (window.includes('customer') || window.includes('uses ') || window.includes('running') || window.includes('deployed')) status = 'Customer'
      else if (window.includes('replac')) status = 'Replacing'
      const ctx = allText.slice(Math.max(0,idx-40), idx+vendor.length+60).replace(/\s+/g,' ').trim()
      map[vendor] = {name:vendor, status, contexts:ctx?[ctx.slice(0,120)]:[], mentions:1}
    }
    return Object.values(map)
  } catch(e) { return [] }
}

// ── Prospect Intelligence Brief ──────────────────────────────────────────────
function ProspectBriefPanel({acct, updateAccount, effectiveKey, isLight}) {
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState('')
  const [briefWarning, setBriefWarning] = useState('')
  const [showBrief, setShowBrief] = useState(!!acct.prospect_brief)
  const [copied, setCopied] = useState(false)

  const brief = acct.prospect_brief || null
  const generatedAt = acct.prospect_brief_generated_at || null

  const generateBrief = async () => {
    if (briefLoading) return
    if (!effectiveKey) { setBriefError('Add your Anthropic API key in Settings first.'); return }
    setBriefLoading(true); setBriefError(''); setBriefWarning('')
    const prompt = `You are a cybersecurity sales intelligence analyst. Research the company "${acct.name}"${acct.hq ? ` located in "${acct.hq}"` : ''} and generate a prospect intelligence brief for a cybersecurity VAR called GuidePoint Security whose Enterprise Client Manager is trying to determine if and how to engage this account.\n\nReturn ONLY a JSON object with no preamble or markdown backticks in this exact structure:\n\n{\n  "security_contacts": [\n    {\n      "name": "string or null",\n      "title": "string",\n      "linkedin_url": "string or null",\n      "confidence": "high|medium|low",\n      "confidence_reason": "string (e.g. Found on LinkedIn, Listed on company website, Inferred from job posting)"\n    }\n  ],\n  "recent_news": [\n    {\n      "headline": "string",\n      "date": "string",\n      "relevance": "string (why this matters for a cybersecurity conversation)"\n    }\n  ],\n  "active_job_postings": [\n    {\n      "title": "string",\n      "posted_date": "string",\n      "guidepoint_signal": "string (what this tells us about their security gaps or investments)",\n      "source_url": "string or null"\n    }\n  ],\n  "guidepoint_service_matches": [\n    {\n      "service_area": "string (e.g. GRC Advisory, Cloud Security, MDR, Identity, AppSec, Pen Testing)",\n      "signal": "string (what triggered this match -- job posting, news, industry pressure)",\n      "urgency": "high|medium|low"\n    }\n  ],\n  "timing_signal": {\n    "is_time_sensitive": true|false,\n    "reason": "string or null (e.g. recent breach in industry, regulation deadline, new CISO hire)"\n  },\n  "suggested_outreach": {\n    "primary_contact": "string (name and title of who to contact first)",\n    "opening_angle": "string (1-2 sentences -- the specific reason to reach out right now)",\n    "first_line": "string (suggested literal first sentence of an outreach email or LinkedIn message)"\n  }\n}\n\nOnly include job postings from the last 60 days. Flag confidence on all contacts. Do not include generic industry boilerplate -- every insight must be specific to this company.\nReturn only valid JSON. No markdown. No code fences. No commentary. Start your response with { and end with }.`
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: prompt }]
        })
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const result = await resp.json()
      // Check for API-level error before attempting parse
      if (result.error) throw new Error(result.error.message || result.error.type || 'API error')

      // Collect all text blocks; try each, keep the last successful parse
      // (web_search responses can have multiple text blocks — the final one has the JSON)
      const textBlocks = (result.content || []).filter(b => b.type === 'text').map(b => b.text)
      let briefData = null
      let rawText = ''
      for (const txt of textBlocks) {
        const parsed = extractStructuredAIResponse(txt)
        if (parsed) briefData = parsed
        rawText = txt // keep last text block for repair/fallback
      }

      // Repair pass: send raw output back to AI once and ask it to re-format
      if (!briefData && rawText) {
        if (import.meta.env.DEV) console.log('[ProspectBrief] Primary parse failed. Blocks:', result.content?.length, '| First 500 chars:', rawText.slice(0, 500))
        try {
          const {data: fixResult} = await callClaudeWithRetry({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            messages: [{ role: 'user', content: `Convert this into valid JSON matching the Prospect Brief schema exactly. Return only valid JSON. No markdown. No code fences. No commentary.\n\nRequired fields: security_contacts (array), recent_news (array), active_job_postings (array), guidepoint_service_matches (array), timing_signal (object with is_time_sensitive bool and reason string), suggested_outreach (object with primary_contact, opening_angle, first_line).\n\nText to convert:\n${rawText}` }]
          }, effectiveKey)
          briefData = extractStructuredAIResponse(fixResult)
        } catch (repairErr) {
          console.error('[ProspectBrief] Repair attempt failed:', repairErr)
        }
      }

      // Fallback: create a usable brief from raw text rather than hard-failing
      if (!briefData) {
        briefData = {
          security_contacts: [],
          recent_news: rawText ? [{ headline: 'AI Research Summary', date: new Date().toISOString().split('T')[0], relevance: rawText.slice(0, 600) }] : [],
          active_job_postings: [],
          guidepoint_service_matches: [],
          timing_signal: { is_time_sensitive: false, reason: null },
          suggested_outreach: { primary_contact: '', opening_angle: 'See the research summary in Recent News above.', first_line: '' },
          _fallback: true
        }
        setBriefWarning('AI returned an unexpected format. Displaying fallback brief.')
      }

      const now = new Date().toISOString()
      const isTS = !!briefData.timing_signal?.is_time_sensitive
      // Merge discovered contacts into account contacts (dedupe by name)
      const existing = acct.contacts || []
      const newContacts = (briefData.security_contacts || [])
        .filter(c => c.name && c.name !== 'null' && c.name !== null)
        .filter(c => !existing.some(e => (e.name||'').toLowerCase() === (c.name||'').toLowerCase()))
        .map(c => ({
          id: uid(), name: c.name, title: c.title || '',
          linkedin: c.linkedin_url || '',
          notes: `Confidence: ${c.confidence} — ${c.confidence_reason||''}`,
          addedBy: 'prospect_brief'
        }))
      updateAccount(acct.id, {
        prospect_brief: briefData,
        prospect_brief_generated_at: now,
        is_time_sensitive: isTS,
        contacts: [...existing, ...newContacts]
      })
      setShowBrief(true)
    } catch(err) {
      console.error('[ProspectBrief]', err)
      setBriefError(err.message || 'Could not generate brief. Try again in a moment.')
    }
    setBriefLoading(false)
  }

  const sHdr = label => (
    <div style={{fontSize:11,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8,marginTop:16}}>{label}</div>
  )
  const confC = c => c==='high'?'#15803d':c==='medium'?'#b45309':'#64748b'
  const confBg = c => c==='high'?'#dcfce7':c==='medium'?'#fef3c7':'#f1f5f9'
  const urgDot = u => u==='high'?'#dc2626':u==='medium'?'#f59e0b':'#3b82f6'

  return (
    <div style={{borderTop:'1px solid #EEEFF2',paddingTop:16,marginTop:4}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:brief&&showBrief?14:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:13,fontWeight:600,color:'#111827'}}>Prospect Intelligence Brief</span>
          {generatedAt&&<span style={{fontSize:11,color:'#9CA3AF'}}>{fmtDate(generatedAt.split('T')[0])}</span>}
          {brief&&<button onClick={()=>setShowBrief(v=>!v)} style={{fontSize:11,color:'#9CA3AF',background:'none',border:'none',cursor:'pointer',padding:'0 4px'}}>{showBrief?'Hide':'Show'}</button>}
        </div>
        <button onClick={generateBrief} disabled={briefLoading}
          style={{display:'inline-flex',alignItems:'center',gap:5,padding:'6px 14px',background:'#ffffff',border:'1px solid #007AFF',borderRadius:8,color:'#007AFF',fontSize:12,fontWeight:600,cursor:briefLoading?'default':'pointer',opacity:briefLoading?0.75:1,flexShrink:0}}>
          {briefLoading
            ? <><span style={{display:'inline-block',width:10,height:10,border:'2px solid rgba(0,122,255,0.3)',borderTopColor:'#007AFF',borderRadius:'50%',animation:'ilSpin 0.7s linear infinite'}}/>Researching…</>
            : <><span style={{fontSize:13}}>✦</span>{brief?'Regenerate':'Generate Prospect Brief'}</>
          }
        </button>
      </div>
      {briefError&&<div style={{fontSize:12,color:'#dc2626',marginTop:6,marginBottom:4}}>{briefError}</div>}
      {briefWarning&&<div style={{fontSize:12,color:'#b45309',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:6,padding:'6px 10px',marginTop:6,marginBottom:4}}>{briefWarning}</div>}

      {brief&&showBrief&&(
        <div style={{background:'#ffffff',border:'1px solid #EEEFF2',borderRadius:12,padding:20,marginTop:8}}>

          {/* Time Sensitive Banner */}
          {brief.timing_signal?.is_time_sensitive&&(
            <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'10px 14px',marginBottom:4,display:'flex',gap:8,alignItems:'flex-start'}}>
              <span style={{fontSize:14,flexShrink:0}}>⚡</span>
              <div><span style={{fontSize:12,fontWeight:700,color:'#92400e'}}>Time Sensitive — </span><span style={{fontSize:12,color:'#78350f'}}>{brief.timing_signal.reason||''}</span></div>
            </div>
          )}

          {/* Security Contacts */}
          {(brief.security_contacts||[]).filter(c=>c.name&&c.name!=='null').length>0&&(
            <div>
              {sHdr('Security Contacts')}
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                {(brief.security_contacts||[]).filter(c=>c.name&&c.name!=='null').map((c,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,padding:'8px 10px',background:'#F9FAFB',borderRadius:7}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:500,color:'#111827'}}>{c.name}</div>
                      <div style={{fontSize:13,color:'#6B7280'}}>{c.title}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                      <span title={c.confidence_reason||''} style={{fontSize:10,fontWeight:600,color:confC(c.confidence),background:confBg(c.confidence),borderRadius:999,padding:'2px 7px',cursor:'help',whiteSpace:'nowrap'}}>
                        {(c.confidence||'low').charAt(0).toUpperCase()+(c.confidence||'low').slice(1)}
                      </span>
                      {c.linkedin_url&&<a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'#007AFF',textDecoration:'none',fontWeight:600,whiteSpace:'nowrap'}}>LinkedIn ↗</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent News */}
          {(brief.recent_news||[]).length>0&&(
            <div>
              {sHdr('Recent News')}
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {(brief.recent_news||[]).map((n,i)=>(
                  <div key={i}>
                    <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
                      <span style={{fontSize:13,fontWeight:500,color:'#111827',flex:1}}>{n.headline}</span>
                      <span style={{fontSize:12,color:'#9CA3AF',whiteSpace:'nowrap',flexShrink:0}}>{n.date}</span>
                    </div>
                    <div style={{fontSize:13,color:'#6B7280',fontStyle:'italic',marginTop:2,lineHeight:1.5}}>{n.relevance}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Job Postings */}
          {(brief.active_job_postings||[]).length>0&&(
            <div>
              {sHdr('Active Job Postings')}
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {(brief.active_job_postings||[]).map((j,i)=>(
                  <div key={i} style={{padding:'8px 10px',background:'#F9FAFB',borderRadius:7}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3,gap:8}}>
                      <span style={{fontSize:13,fontWeight:500,color:'#111827',flex:1}}>{j.title}</span>
                      <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                        <span style={{fontSize:12,color:'#9CA3AF',whiteSpace:'nowrap'}}>{j.posted_date}</span>
                        {j.source_url&&<a href={j.source_url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:'#007AFF',lineHeight:1}}>↗</a>}
                      </div>
                    </div>
                    <div style={{fontSize:13,color:'#007AFF',lineHeight:1.4}}>{j.guidepoint_signal}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Service Matches */}
          {(brief.guidepoint_service_matches||[]).length>0&&(
            <div>
              {sHdr('GuidePoint Service Matches')}
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {(brief.guidepoint_service_matches||[]).map((m,i)=>(
                  <div key={i}>
                    <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',background:'#F3F4F6',borderRadius:999,marginBottom:3}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:urgDot(m.urgency),flexShrink:0}}/>
                      <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>{m.service_area}</span>
                    </div>
                    <div style={{fontSize:12,color:'#6B7280',paddingLeft:4,lineHeight:1.5}}>{m.signal}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Outreach */}
          {brief.suggested_outreach&&(
            <div style={{marginTop:16}}>
              {sHdr('Suggested Outreach')}
              <div style={{borderLeft:'3px solid #007AFF',border:'1px solid #DBEAFE',borderLeft:'3px solid #007AFF',background:'#ffffff',borderRadius:'0 8px 8px 0',padding:'16px 20px'}}>
                {brief.suggested_outreach.primary_contact&&(
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,color:'#9CA3AF',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Primary Contact</div>
                    <div style={{fontSize:13,fontWeight:600,color:'#111827'}}>{brief.suggested_outreach.primary_contact}</div>
                  </div>
                )}
                {brief.suggested_outreach.opening_angle&&(
                  <div style={{fontSize:14,color:'#374151',lineHeight:1.6,marginBottom:12}}>{brief.suggested_outreach.opening_angle}</div>
                )}
                {brief.suggested_outreach.first_line&&(
                  <div style={{background:'#F9FAFB',borderRadius:6,padding:'10px 12px',display:'flex',alignItems:'flex-start',gap:10}}>
                    <span style={{fontSize:13,color:'#111827',fontWeight:500,fontStyle:'italic',flex:1,lineHeight:1.6}}>{brief.suggested_outreach.first_line}</span>
                    <button onClick={()=>{try{navigator.clipboard?.writeText(brief.suggested_outreach.first_line)}catch{}setCopied(true);setTimeout(()=>setCopied(false),2000)}}
                      style={{fontSize:11,color:copied?'#15803d':'#9CA3AF',background:'none',border:'none',cursor:'pointer',padding:'2px 4px',fontWeight:600,flexShrink:0,whiteSpace:'nowrap'}}>
                      {copied?'Copied!':'Copy'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ExpandedWhitespaceRow({acct, updateAccount, isLight, onRescore, scoringId, effectiveKey}) {
  const [editForm, setEditForm] = useState({name:acct.name||'',hq:acct.hq||'',industry:acct.industry||'',employees:acct.employees||'',revenue:acct.revenue||'',status:acct.status||'Prospect'})
  const [addingNote, setAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  // contact state
  const [addingContact, setAddingContact] = useState(false)
  const [contactForm, setContactForm] = useState({name:'',title:'',notes:''})
  const [editingCId, setEditingCId] = useState(null)
  const [editCForm, setEditCForm] = useState({name:'',title:'',notes:''})
  const [hoveredCId, setHoveredCId] = useState(null)
  const [expandedCNotes, setExpandedCNotes] = useState(new Set())
  // tech state
  const [addingTech, setAddingTech] = useState(false)
  const [techForm, setTechForm] = useState({name:'',status:'Unknown',notes:''})
  const [editingTId, setEditingTId] = useState(null)
  const [editTForm, setEditTForm] = useState({name:'',status:'Unknown',notes:''})
  const [hoveredTId, setHoveredTId] = useState(null)
  const [expandedTNotes, setExpandedTNotes] = useState(new Set())

  useEffect(()=>{setEditForm({name:acct.name||'',hq:acct.hq||'',industry:acct.industry||'',employees:acct.employees||'',revenue:acct.revenue||'',status:acct.status||'Prospect'})},[acct.id])
  const inBg = isLight ? '#ffffff' : 'rgba(255,255,255,0.05)'
  const inBdr = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.1)'
  const allEntries = [
    ...(acct.notes||[]).map(n=>({...n,_src:'note'})),
    ...(acct.intelLog||[]).map(n=>({...n,_src:'intel'}))
  ].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
  const contacts = acct.contacts || []
  const technologies = acct.technologies || []
  const extractedContacts = parseContactsFromEntries(allEntries)
  const extractedTech = parseTechFromEntries(allEntries)
  const TECH_SC = {Customer:{c:'#15803d',bg:'#dcfce7'},Evaluating:{c:'#1d4ed8',bg:'#dbeafe'},Replacing:{c:'#c2410c',bg:'#ffedd5'},Considering:{c:'#7c3aed',bg:'#ede9fe'},Unknown:{c:'#64748b',bg:'#f1f5f9'}}

  const sHdr = (icon,label,count) => (
    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:10}}>
      <span style={{color:'#94a3b8',display:'flex'}}>{icon}</span>
      <span style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}</span>
      {count>0&&<span style={{fontSize:9,fontWeight:700,color:'#2563eb',background:'#dbeafe',borderRadius:999,padding:'1px 6px',marginLeft:2}}>{count}</span>}
    </div>
  )
  const toggleCNote = id => setExpandedCNotes(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s})
  const toggleTNote = id => setExpandedTNotes(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s})
  const startEditC = c => {setEditingCId(c.id);setEditCForm({name:c.name||'',title:c.title||'',notes:c.notes||''});setAddingContact(false)}
  const saveEditC = () => {if(!editCForm.name.trim())return;updateAccount(acct.id,{contacts:contacts.map(c=>c.id===editingCId?{...c,...editCForm}:c)});setEditingCId(null)}
  const deleteC = id => {if(!window.confirm('Remove this contact?'))return;updateAccount(acct.id,{contacts:contacts.filter(c=>c.id!==id)})}
  const startEditT = t => {setEditingTId(t.id);setEditTForm({name:t.name||'',status:t.status||'Unknown',notes:t.notes||''});setAddingTech(false)}
  const saveEditT = () => {if(!editTForm.name.trim())return;updateAccount(acct.id,{technologies:technologies.map(t=>t.id===editingTId?{...t,...editTForm}:t)});setEditingTId(null)}
  const deleteT = id => {if(!window.confirm('Remove this technology?'))return;updateAccount(acct.id,{technologies:technologies.filter(t=>t.id!==id)})}

  const frmBg = '#f0f9ff'; const frmBdr = '#bfdbfe'
  const frmStyle = {background:frmBg,border:`1px solid ${frmBdr}`,borderRadius:8,padding:12,marginBottom:4}
  const inp = {width:'100%',fontSize:12,padding:'5px 8px',background:'#ffffff',border:'1px solid #bfdbfe',borderRadius:5,color:'#0f172a',boxSizing:'border-box',outline:'none'}
  const lbl = {fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',marginBottom:3,display:'block'}

  return (
    <div style={{padding:'16px 24px 20px',background:isLight?'#f0f9ff':'rgba(37,99,235,0.04)',borderTop:`1px solid ${isLight?'#bfdbfe':'rgba(37,99,235,0.2)'}`}}>
      {/* Top row: Account Details + Notes & Intel */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1.8fr',gap:28,marginBottom:16}}>
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em'}}>Account Details</div>
            {onRescore&&<button onClick={()=>onRescore(acct.id)} disabled={scoringId===acct.id} style={{padding:'3px 9px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:'#2563eb',fontSize:11,fontWeight:600,cursor:scoringId===acct.id?'default':'pointer',opacity:scoringId===acct.id?0.6:1}}>{scoringId===acct.id?'Scoring…':'Rescore'}</button>}
          </div>
          {[{label:'Name',key:'name'},{label:'HQ',key:'hq'},{label:'Industry',key:'industry'},{label:'Employees',key:'employees'},{label:'Revenue',key:'revenue'}].map(f=>(
            <div key={f.key} style={{marginBottom:9}}>
              <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',marginBottom:2}}>{f.label}</div>
              <input value={editForm[f.key]||''} onChange={e=>setEditForm(p=>({...p,[f.key]:e.target.value}))} onBlur={e=>updateAccount(acct.id,{[f.key]:e.target.value})}
                style={{width:'100%',fontSize:12,padding:'5px 8px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:5,color:S.txt,boxSizing:'border-box',outline:'none'}}/>
            </div>
          ))}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',marginBottom:2}}>Status</div>
            <select value={editForm.status||'Prospect'} onChange={e=>{setEditForm(p=>({...p,status:e.target.value}));updateAccount(acct.id,{status:e.target.value})}}
              style={{width:'100%',fontSize:12,padding:'5px 8px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:5,color:S.txt}}>
              {['Prospect','Researching','Reached Out','Active Conversation'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.08em'}}>Notes & Intel</div>
            <button onClick={()=>setAddingNote(v=>!v)} style={{fontSize:11,color:'#2563eb',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:5,padding:'2px 8px',cursor:'pointer',fontWeight:600}}>+ Add Note</button>
          </div>
          {addingNote&&(
            <div style={{marginBottom:12}}>
              <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={3} placeholder='Add a note...' autoFocus
                style={{width:'100%',fontSize:12,padding:'7px 9px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:6,color:S.txt,boxSizing:'border-box',resize:'none',fontFamily:'inherit',lineHeight:1.5,outline:'none'}}/>
              <div style={{display:'flex',gap:6,marginTop:6}}>
                <button onClick={()=>{if(!noteText.trim())return;updateAccount(acct.id,{notes:[{id:uid(),text:noteText,date:new Date().toISOString().split('T')[0],addedBy:''},...(acct.notes||[])]});setNoteText('');setAddingNote(false)}} style={{padding:'5px 14px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Save</button>
                <button onClick={()=>{setNoteText('');setAddingNote(false)}} style={{padding:'5px 10px',background:'transparent',border:`1px solid ${inBdr}`,borderRadius:5,color:S.muted,fontSize:12,cursor:'pointer'}}>Cancel</button>
              </div>
            </div>
          )}
          {allEntries.length===0&&!addingNote&&<div style={{fontSize:12,color:S.muted,fontStyle:'italic'}}>No notes yet.</div>}
          <div style={{maxHeight:260,overflowY:'auto',display:'flex',flexDirection:'column',gap:7}}>
            {allEntries.map(n=>(
              <div key={n.id} style={{padding:'8px 10px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:7}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                      <span style={{fontSize:10,color:'#94a3b8'}}>{fmtDate(n.date)}</span>
                      {n._src==='intel'&&<span style={{fontSize:9,fontWeight:700,color:'#7c3aed',background:'#ede9fe',borderRadius:4,padding:'1px 5px',lineHeight:1.4}}>AI</span>}
                    </div>
                    <div style={{fontSize:12,color:S.txt,lineHeight:1.6}}>{n.text}</div>
                  </div>
                  <button onClick={()=>{if(n._src==='intel'){updateAccount(acct.id,{intelLog:(acct.intelLog||[]).filter(x=>x.id!==n.id)})}else{updateAccount(acct.id,{notes:(acct.notes||[]).filter(x=>x.id!==n.id)})}}}
                    style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:13,padding:'0 2px',flexShrink:0,lineHeight:1}}
                    onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom sections stacked */}
      <div style={{borderTop:`1px solid ${isLight?'#bfdbfe':'rgba(37,99,235,0.15)'}`,paddingTop:16,display:'flex',flexDirection:'column',gap:16}}>

        {/* CONTACTS */}
        <div style={{background:isLight?'rgba(37,99,235,0.04)':'rgba(255,255,255,0.02)',border:`1px solid ${isLight?'#dbeafe':'rgba(255,255,255,0.08)'}`,borderRadius:8,padding:'12px 14px'}}>
          {sHdr(<User size={11}/>, 'Contacts Mentioned', contacts.length + extractedContacts.filter(ec=>!contacts.some(c=>c.name.toLowerCase()===ec.name.toLowerCase())).length)}
          {contacts.length===0&&extractedContacts.length===0&&!addingContact&&<div style={{fontSize:12,color:S.muted,marginBottom:8}}>No contacts added yet. Add a contact or process intel to extract mentions.</div>}
          <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:6}}>
            {/* Saved contacts — fully editable */}
            {contacts.map(c=>(
              <div key={c.id}>
                {editingCId===c.id?(
                  <div style={frmStyle}>
                    <div style={{marginBottom:8}}><span style={lbl}>Name *</span><input value={editCForm.name} onChange={e=>setEditCForm(p=>({...p,name:e.target.value}))} autoFocus style={inp}/></div>
                    <div style={{marginBottom:8}}><span style={lbl}>Title</span><input value={editCForm.title} onChange={e=>setEditCForm(p=>({...p,title:e.target.value}))} style={inp}/></div>
                    <div style={{marginBottom:10}}><span style={lbl}>Notes</span><textarea value={editCForm.notes} onChange={e=>setEditCForm(p=>({...p,notes:e.target.value}))} rows={2} style={{...inp,resize:'none',fontFamily:'inherit',lineHeight:1.5}}/></div>
                    <div style={{display:'flex',justifyContent:'flex-end',gap:6}}>
                      <button onClick={()=>setEditingCId(null)} style={{padding:'4px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:'#64748b',fontSize:11,cursor:'pointer'}}>Cancel</button>
                      <button onClick={saveEditC} style={{padding:'4px 12px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
                    </div>
                  </div>
                ):(
                  <div onMouseEnter={()=>setHoveredCId(c.id)} onMouseLeave={()=>setHoveredCId(null)}
                    style={{padding:'7px 9px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:6}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                      <User size={12} style={{color:'#94a3b8',marginTop:2,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginBottom:1}}>
                          <span style={{fontSize:13,fontWeight:600,color:isLight?'#0f172a':S.txt}}>{c.name}</span>
                          {c.addedManually&&<span style={{fontSize:9,fontWeight:700,color:'#64748b',background:'#f1f5f9',borderRadius:4,padding:'1px 5px'}}>Manual</span>}
                        </div>
                        {c.title&&<div style={{fontSize:11,color:S.muted,marginBottom:2}}>{c.title}</div>}
                        {c.notes?(
                          <div style={{fontSize:11,color:S.muted,fontStyle:'italic',lineHeight:1.4}}>
                            {expandedCNotes.has(c.id)?c.notes:c.notes.slice(0,80)}
                            {c.notes.length>80&&<button onClick={e=>{e.stopPropagation();toggleCNote(c.id)}} style={{fontSize:10,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:'0 0 0 4px',fontStyle:'normal'}}>{expandedCNotes.has(c.id)?'less':'more'}</button>}
                          </div>
                        ):<div style={{fontSize:11,color:'#cbd5e1',fontStyle:'italic'}}>No notes</div>}
                      </div>
                      <div style={{display:'flex',gap:3,flexShrink:0,opacity:hoveredCId===c.id?1:0,transition:'opacity 0.15s'}}>
                        <button onClick={()=>startEditC(c)} title='Edit' style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'2px',display:'flex',alignItems:'center'}} onMouseEnter={e=>e.currentTarget.style.color='#2563eb'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}><Pencil size={12}/></button>
                        <button onClick={()=>deleteC(c.id)} title='Delete' style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'2px 2px 2px 0',display:'flex',alignItems:'center',fontSize:14,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>✕</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {/* AI-extracted contacts (read-only, deduped) */}
            {extractedContacts.filter(ec=>!contacts.some(c=>c.name.toLowerCase()===ec.name.toLowerCase())).map((c,ci)=>(
              <div key={'xc'+ci} style={{padding:'7px 9px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:6}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                  <User size={12} style={{color:'#94a3b8',marginTop:2,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginBottom:1}}>
                      <span style={{fontSize:13,fontWeight:600,color:isLight?'#0f172a':S.txt}}>{c.name}</span>
                      <span style={{fontSize:9,color:'#7c3aed',background:'#ede9fe',borderRadius:4,padding:'1px 5px',fontWeight:600}}>AI</span>
                      {c.mentions>1&&<span style={{fontSize:9,color:'#64748b',background:'#f1f5f9',borderRadius:4,padding:'1px 5px',fontWeight:600}}>×{c.mentions}</span>}
                    </div>
                    {c.title&&<div style={{fontSize:11,color:S.muted,marginBottom:1}}>{c.title}</div>}
                    {c.contexts[0]&&<div style={{fontSize:11,color:S.muted,fontStyle:'italic',lineHeight:1.4}}>{c.contexts[0].slice(0,80)}{c.contexts[0].length>80?'…':''}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {addingContact?(
            <div style={frmStyle}>
              <div style={{marginBottom:8}}><span style={lbl}>Name *</span><input value={contactForm.name} onChange={e=>setContactForm(p=>({...p,name:e.target.value}))} autoFocus style={inp}/></div>
              <div style={{marginBottom:8}}><span style={lbl}>Title</span><input value={contactForm.title} onChange={e=>setContactForm(p=>({...p,title:e.target.value}))} style={inp}/></div>
              <div style={{marginBottom:10}}><span style={lbl}>Notes</span><textarea value={contactForm.notes} onChange={e=>setContactForm(p=>({...p,notes:e.target.value}))} rows={2} style={{...inp,resize:'none',fontFamily:'inherit',lineHeight:1.5}}/></div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:6}}>
                <button onClick={()=>{setAddingContact(false);setContactForm({name:'',title:'',notes:''})}} style={{padding:'4px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:'#64748b',fontSize:11,cursor:'pointer'}}>Cancel</button>
                <button onClick={()=>{if(!contactForm.name.trim())return;updateAccount(acct.id,{contacts:[...contacts,{id:uid(),...contactForm,addedManually:true}]});setContactForm({name:'',title:'',notes:''});setAddingContact(false)}} style={{padding:'4px 12px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
              </div>
            </div>
          ):(
            <button onClick={()=>{setAddingContact(true);setEditingCId(null)}} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:0,fontWeight:600}}>+ Add Contact</button>
          )}
        </div>

        {/* TECHNOLOGY */}
        <div style={{background:isLight?'rgba(37,99,235,0.04)':'rgba(255,255,255,0.02)',border:`1px solid ${isLight?'#dbeafe':'rgba(255,255,255,0.08)'}`,borderRadius:8,padding:'12px 14px'}}>
          {sHdr(<Cpu size={11}/>, 'Technology', technologies.length + extractedTech.filter(et=>!technologies.some(t=>t.name.toLowerCase()===et.name.toLowerCase())).length)}
          {technologies.length===0&&extractedTech.length===0&&!addingTech&&<div style={{fontSize:12,color:S.muted,marginBottom:8}}>No technology added yet. Add a vendor or process intel to extract mentions.</div>}
          <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:6}}>
            {/* Saved technologies — fully editable */}
            {technologies.map(t=>{
              const sc=TECH_SC[t.status]||TECH_SC.Unknown
              return (
                <div key={t.id}>
                  {editingTId===t.id?(
                    <div style={frmStyle}>
                      <div style={{marginBottom:8}}><span style={lbl}>Vendor / Technology *</span><input value={editTForm.name} onChange={e=>setEditTForm(p=>({...p,name:e.target.value}))} autoFocus style={inp}/></div>
                      <div style={{marginBottom:8}}><span style={lbl}>Status</span>
                        <select value={editTForm.status} onChange={e=>setEditTForm(p=>({...p,status:e.target.value}))} style={{...inp,padding:'5px 6px'}}>
                          {['Customer','Evaluating','Replacing','Considering','Unknown'].map(s=><option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{marginBottom:10}}><span style={lbl}>Notes</span><textarea value={editTForm.notes} onChange={e=>setEditTForm(p=>({...p,notes:e.target.value}))} rows={2} style={{...inp,resize:'none',fontFamily:'inherit',lineHeight:1.5}}/></div>
                      <div style={{display:'flex',justifyContent:'flex-end',gap:6}}>
                        <button onClick={()=>setEditingTId(null)} style={{padding:'4px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:'#64748b',fontSize:11,cursor:'pointer'}}>Cancel</button>
                        <button onClick={saveEditT} style={{padding:'4px 12px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
                      </div>
                    </div>
                  ):(
                    <div onMouseEnter={()=>setHoveredTId(t.id)} onMouseLeave={()=>setHoveredTId(null)}
                      style={{padding:'7px 9px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:6}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:sc.c,flexShrink:0,marginTop:3}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginBottom:1}}>
                            <span style={{fontSize:13,fontWeight:600,color:isLight?'#0f172a':S.txt}}>{t.name}</span>
                            <span style={{fontSize:9,fontWeight:700,color:sc.c,background:sc.bg,borderRadius:4,padding:'1px 6px'}}>{t.status}</span>
                            {t.addedManually&&<span style={{fontSize:9,fontWeight:700,color:'#64748b',background:'#f1f5f9',borderRadius:4,padding:'1px 5px'}}>Manual</span>}
                          </div>
                          {t.notes?(
                            <div style={{fontSize:11,color:S.muted,fontStyle:'italic',lineHeight:1.4}}>
                              {expandedTNotes.has(t.id)?t.notes:t.notes.slice(0,80)}
                              {t.notes.length>80&&<button onClick={e=>{e.stopPropagation();toggleTNote(t.id)}} style={{fontSize:10,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:'0 0 0 4px',fontStyle:'normal'}}>{expandedTNotes.has(t.id)?'less':'more'}</button>}
                            </div>
                          ):<div style={{fontSize:11,color:'#cbd5e1',fontStyle:'italic'}}>No notes</div>}
                        </div>
                        <div style={{display:'flex',gap:3,flexShrink:0,opacity:hoveredTId===t.id?1:0,transition:'opacity 0.15s'}}>
                          <button onClick={()=>startEditT(t)} title='Edit' style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'2px',display:'flex',alignItems:'center'}} onMouseEnter={e=>e.currentTarget.style.color='#2563eb'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}><Pencil size={12}/></button>
                          <button onClick={()=>deleteT(t.id)} title='Delete' style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'2px 2px 2px 0',display:'flex',alignItems:'center',fontSize:14,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>✕</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {/* AI-extracted tech (read-only, deduped) */}
            {extractedTech.filter(et=>!technologies.some(t=>t.name.toLowerCase()===et.name.toLowerCase())).map((t,ti)=>{
              const sc=TECH_SC[t.status]||TECH_SC.Unknown
              return (
                <div key={'xt'+ti} style={{padding:'7px 9px',background:inBg,border:`1px solid ${inBdr}`,borderRadius:6}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:sc.c,flexShrink:0,marginTop:3}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap',marginBottom:1}}>
                        <span style={{fontSize:13,fontWeight:600,color:isLight?'#0f172a':S.txt}}>{t.name}</span>
                        <span style={{fontSize:9,fontWeight:700,color:sc.c,background:sc.bg,borderRadius:4,padding:'1px 6px'}}>{t.status}</span>
                        <span style={{fontSize:9,color:'#7c3aed',background:'#ede9fe',borderRadius:4,padding:'1px 5px',fontWeight:600}}>AI</span>
                        {t.mentions>1&&<span style={{fontSize:9,color:'#64748b',background:'#f1f5f9',borderRadius:4,padding:'1px 5px',fontWeight:600}}>×{t.mentions}</span>}
                      </div>
                      {t.contexts[0]&&<div style={{fontSize:11,color:S.muted,fontStyle:'italic',lineHeight:1.4}}>{t.contexts[0].slice(0,80)}{t.contexts[0].length>80?'…':''}</div>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {addingTech?(
            <div style={frmStyle}>
              <div style={{marginBottom:8}}><span style={lbl}>Vendor / Technology *</span><input value={techForm.name} onChange={e=>setTechForm(p=>({...p,name:e.target.value}))} autoFocus style={inp}/></div>
              <div style={{marginBottom:8}}><span style={lbl}>Status</span>
                <select value={techForm.status} onChange={e=>setTechForm(p=>({...p,status:e.target.value}))} style={{...inp,padding:'5px 6px'}}>
                  {['Customer','Evaluating','Replacing','Considering','Unknown'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{marginBottom:10}}><span style={lbl}>Notes</span><textarea value={techForm.notes} onChange={e=>setTechForm(p=>({...p,notes:e.target.value}))} rows={2} style={{...inp,resize:'none',fontFamily:'inherit',lineHeight:1.5}}/></div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:6}}>
                <button onClick={()=>{setAddingTech(false);setTechForm({name:'',status:'Unknown',notes:''})}} style={{padding:'4px 10px',background:'transparent',border:'1px solid #bfdbfe',borderRadius:5,color:'#64748b',fontSize:11,cursor:'pointer'}}>Cancel</button>
                <button onClick={()=>{if(!techForm.name.trim())return;updateAccount(acct.id,{technologies:[...technologies,{id:uid(),...techForm,addedManually:true}]});setTechForm({name:'',status:'Unknown',notes:''});setAddingTech(false)}} style={{padding:'4px 12px',background:'#2563eb',border:'none',borderRadius:5,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
              </div>
            </div>
          ):(
            <button onClick={()=>{setAddingTech(true);setEditingTId(null)}} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:0,fontWeight:600}}>+ Add Technology</button>
          )}
        </div>
      </div>
      <ProspectBriefPanel acct={acct} updateAccount={updateAccount} effectiveKey={effectiveKey} isLight={isLight}/>
    </div>
  )
}

const fuzzyMatchAccount = (name1, name2) => {
  if (!name1 || !name2) return false
  const clean = s => s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|co|the|and|or|of|go to|goto)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const a = clean(name1)
  const b = clean(name2)
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const bigrams = s => { const bg=new Set(); for(let i=0;i<s.length-1;i++) bg.add(s.slice(i,i+2)); return bg }
  const bg1=bigrams(a), bg2=bigrams(b)
  let matches=0; bg2.forEach(bg=>{if(bg1.has(bg))matches++})
  const similarity = (2*matches)/(bg1.size+bg2.size)
  if (similarity > 0.7) return true
  const words1=a.split(' ').filter(w=>w.length>2)
  const words2=b.split(' ').filter(w=>w.length>2)
  const sharedWords=words1.filter(w=>words2.includes(w))
  if (sharedWords.length>0 && (sharedWords.length/Math.min(words1.length||1,words2.length||1))>0.6) return true
  return false
}

const fuzzyBigramScore = (name1, name2) => {
  if (!name1 || !name2) return 0
  const clean = s => s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(inc|llc|ltd|corp|co|the|and|or|of|go to|goto)\b/g,'').replace(/\s+/g,' ').trim()
  const a=clean(name1), b=clean(name2)
  if (a===b) return 1
  if (a.includes(b)||b.includes(a)) return 0.85
  const bigrams = s => { const bg=new Set(); for(let i=0;i<s.length-1;i++) bg.add(s.slice(i,i+2)); return bg }
  const bg1=bigrams(a), bg2=bigrams(b)
  if (!bg1.size&&!bg2.size) return 0
  let matches=0; bg2.forEach(bg=>{if(bg1.has(bg))matches++})
  return (2*matches)/(bg1.size+bg2.size)
}

export default function WhitespacePage({data, setData, theme, setTheme, onBack}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('Recently Added')
  const [statusFilter, setStatusFilter] = useState('All')
  const [expandedId, setExpandedId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({name:'',hq:'',industry:'',employees:'',revenue:'',status:'Prospect',notes:''})
  const [hoveredId, setHoveredId] = useState(null)
  const [bannerOpen, setBannerOpen] = useState(false)
  const [showIntel, setShowIntel] = useState(false)
  const [intelText, setIntelText] = useState('')
  const [intelDate, setIntelDate] = useState('')
  const [intelLoading, setIntelLoading] = useState(false)
  const [intelError, setIntelError] = useState('')
  const [intelStatus, setIntelStatus] = useState('')
  const [pendingIntel, setPendingIntel] = useState(null)
  const [selectedIntel, setSelectedIntel] = useState(new Set())
  const [editingNameIdx, setEditingNameIdx] = useState(null)
  const [editingNameDraft, setEditingNameDraft] = useState('')
  const [pendingNames, setPendingNames] = useState({})

  // File upload state for Add Intelligence modal
  const [wsUploadedFile, setWsUploadedFile] = useState(null)
  const [wsFileLoading, setWsFileLoading] = useState(false)
  const [wsFileError, setWsFileError] = useState('')
  const [wsFileStatus, setWsFileStatus] = useState('')
  const [wsDragOver, setWsDragOver] = useState(false)
  const wsFileInputRef = useRef(null)
  const wsIdsNormalized = useRef(false)
  const [wsPendingFile, setWsPendingFile] = useState(null)
  const [wsSpreadsheetRows, setWsSpreadsheetRows] = useState(null)
  const [wsFileIsDirectType, setWsFileIsDirectType] = useState(false)
  const [wsShowDate, setWsShowDate] = useState(false)
  const [wsCustomDate, setWsCustomDate] = useState('')
  const [wsPendingDate, setWsPendingDate] = useState('')
  const [wsRetryStatus, setWsRetryStatus] = useState('')
  const [wsLargeDocWarning, setWsLargeDocWarning] = useState(false)
  const [wsFileCharCount, setWsFileCharCount] = useState(0)
  const [wsDateModalIsFile, setWsDateModalIsFile] = useState(false)

  // Merge & dedup state
  const [showMerge, setShowMerge] = useState(false)
  const [mergeStep, setMergeStep] = useState(1)
  const [mergeSelected, setMergeSelected] = useState(new Set())
  const [mergePrimary, setMergePrimary] = useState(null)
  const [mergeSearch, setMergeSearch] = useState('')
  const [showDupeReview, setShowDupeReview] = useState(false)
  const [dupeDismissed, setDupeDismissed] = useState(false)
  const [addDupeWarning, setAddDupeWarning] = useState(null)
  const [mergeToast, setMergeToast] = useState('')
  const [showAutoFillModal, setShowAutoFillModal] = useState(false)
  const [showCleanNotesModal, setShowCleanNotesModal] = useState(false)
  const [aiOpRunning, setAiOpRunning] = useState(false)
  const [aiOpProgress, setAiOpProgress] = useState('')
  const [aiOpSummary, setAiOpSummary] = useState('')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef(null)
  const [recOpen, setRecOpen] = useState(false)
  const [recLoading, setRecLoading] = useState(false)
  const [recError, setRecError] = useState('')
  const [wsToast, setWsToast] = useState('')
  const [scoringAll, setScoringAll] = useState(false)
  const [scoringId, setScoringId] = useState(null)
  const [scoreProgress, setScoreProgress] = useState('')
  const mob = typeof window !== 'undefined' && window.innerWidth < 768
  const [mobFilterOpen, setMobFilterOpen] = useState(false)
  const [selectedForExport, setSelectedForExport] = useState(new Set())
  const [segmentFilter, setSegmentFilter] = useState('All')
  const [showPromoteModal, setShowPromoteModal] = useState(false)
  const [promoteTarget, setPromoteTarget] = useState(null)
  const [promoteDuplicate, setPromoteDuplicate] = useState(null)

  const ws = data.whitespaceAccounts || []
  // The single selected WS account used for promote / export brief actions
  const selectedWsAcct = selectedForExport.size === 1 ? ws.find(a => selectedForExport.has(a.id)) || null : null
  const isLight = S.isLight
  const effectiveKey = data.apiKey || ''

  // Detect duplicate pairs among existing accounts
  const dupePairs = []
  for (let i=0;i<ws.length;i++) for (let j=i+1;j<ws.length;j++) if (fuzzyMatchAccount(ws[i].name,ws[j].name)) dupePairs.push([ws[i],ws[j]])
  const STATUS_ORDER = {'Active Conversation':0,'Reached Out':1,'Researching':2,'Prospect':3}
  const STATUS_COLORS = {Prospect:'#64748b',Researching:'#2563eb','Reached Out':'#ea580c','Active Conversation':'#0ebc5f'}
  const SORT_OPTS = ['Recently Added','Recently Updated','Name A-Z','Name Z-A','Status','Industry','Employees','Revenue','Intel','Sort by Opportunity','Hot','Sort by Time Sensitive']
  const STATUS_OPTS = ['All','Prospect','Researching','Reached Out','Active Conversation']

  const parseNum = s => {if(!s)return 0;const n=String(s).replace(/[$,\s]/g,'').toLowerCase();if(n.endsWith('k'))return parseFloat(n)*1000||0;if(n.endsWith('m'))return parseFloat(n)*1000000||0;if(n.endsWith('b'))return parseFloat(n)*1000000000||0;return parseFloat(n)||0}

  // Parse employee count from strings like "2,500", "2500 employees", "1000-5000", "~3,000"
  const parseEmployeeCount = s => {
    if (!s) return null
    const str = String(s).replace(/[~≈$,\s]/g,'').toLowerCase()
    const rangeMatch = str.match(/^(\d+)-(\d+)/)
    if (rangeMatch) return parseInt(rangeMatch[2], 10)
    const numMatch = str.match(/^([\d.]+)([kmb]?)/)
    if (!numMatch) return null
    const v = parseFloat(numMatch[1])
    if (isNaN(v)) return null
    if (numMatch[2]==='k') return Math.round(v*1000)
    if (numMatch[2]==='m') return Math.round(v*1000000)
    if (numMatch[2]==='b') return Math.round(v*1000000000)
    return Math.round(v)
  }
  // SMB: 0–2498 | Mid-Enterprise: 2499–6000 | Enterprise: 6001+
  const getSegment = empCount => {
    if (empCount === null || empCount === undefined) return null
    if (empCount <= 2498) return 'SMB'
    if (empCount <= 6000) return 'Mid-Enterprise'
    return 'Enterprise'
  }
  const segmentCounts = {SMB:0,'Mid-Enterprise':0,Enterprise:0,unknown:0}
  ws.forEach(a => {
    const seg = getSegment(parseEmployeeCount(a.employees))
    if (seg) segmentCounts[seg]++
    else segmentCounts.unknown++
  })

  const fmtRel = iso => {if(!iso)return '';const d=Math.floor((new Date()-new Date(iso))/86400000);if(d===0)return 'Today';if(d===1)return 'Yesterday';if(d<7)return `${d}d ago`;if(d<30)return `${Math.floor(d/7)}w ago`;return `${Math.floor(d/30)}mo ago`}

  const filtered = ws.filter(a=>{
    if(statusFilter!=='All'&&a.status!==statusFilter)return false
    if(search.trim()){const q=search.toLowerCase();if(!`${a.name} ${a.hq} ${a.industry}`.toLowerCase().includes(q))return false}
    if(segmentFilter!=='All'){const seg=getSegment(parseEmployeeCount(a.employees));if(seg!==segmentFilter)return false}
    return true
  })
  const sorted = [...filtered].sort((a,b)=>{
    switch(sort){
      case 'Name A-Z':return(a.name||'').localeCompare(b.name||'')
      case 'Name Z-A':return(b.name||'').localeCompare(a.name||'')
      case 'Status':return(STATUS_ORDER[a.status]||3)-(STATUS_ORDER[b.status]||3)
      case 'Industry':return(a.industry||'').localeCompare(b.industry||'')
      case 'Employees':return parseNum(b.employees)-parseNum(a.employees)
      case 'Revenue':return parseNum(b.revenue)-parseNum(a.revenue)
      case 'Recently Updated':return(b.updatedAt||'').localeCompare(a.updatedAt||'')
      case 'Intel':return((b.intelLog||[]).length+(b.notes||[]).length)-((a.intelLog||[]).length+(a.notes||[]).length)
      case 'Sort by Opportunity':return(b.ai_opportunity_score||0)-(a.ai_opportunity_score||0)
      case 'Hot':return(isHot(b)?1:0)-(isHot(a)?1:0)
      case 'Sort by Time Sensitive':return(b.is_time_sensitive?1:0)-(a.is_time_sensitive?1:0)||(b.addedAt||'').localeCompare(a.addedAt||'')
      default:return(b.addedAt||'').localeCompare(a.addedAt||'')
    }
  })

  const flameThreshold = (()=>{
    const scores = ws.filter(a=>a.ai_opportunity_score!=null).map(a=>a.ai_opportunity_score).sort((a,b)=>a-b)
    console.log('[FlameScore] scored:', scores.length, '/', ws.length, '— scores:', scores)
    if (scores.length === 0) return Infinity
    if (scores.length < 4) {
      // not enough accounts for percentile — use absolute cutoff of 75
      const threshold = 75
      console.log('[FlameScore] <4 scored, using absolute threshold:', threshold)
      return threshold
    }
    const p75 = scores[Math.floor(scores.length*0.75)]
    const p80 = scores[Math.min(Math.floor(scores.length*0.80),scores.length-1)]
    const threshold = (p75+p80)/2
    console.log('[FlameScore] p75=', p75, 'p80=', p80, 'threshold=', threshold)
    return threshold
  })()

  const isHot = (a) => {
    if (a.ai_opportunity_score != null) return a.ai_opportunity_score >= flameThreshold
    const signals = [
      ((a.intelLog||[]).length + (a.notes||[]).length) >= 3,
      a.status === 'Active Conversation',
      a.status === 'Reached Out',
      (a.contacts||[]).length >= 1,
      (a.technologies||[]).length >= 1,
      a.employees && parseInt(a.employees.replace(/\D/g,'')) >= 1000,
    ]
    return signals.filter(Boolean).length >= 2
  }

  const updateAccount = (id, changes) => {
    const now = new Date().toISOString()
    if (changes.status === 'Active Conversation') {
      const wsAcct = (data.whitespaceAccounts||[]).find(a => a.id === id)
      if (wsAcct && wsAcct.status !== 'Active Conversation') {
        const accountName = wsAcct.name || ''
        const existingAccount = (data.accounts||[]).find(a =>
          a.name.toLowerCase() === accountName.toLowerCase()
        )
        if (!existingAccount) {
          const newAcct = {
            id: uid(),
            name: wsAcct.name,
            short: wsAcct.name.slice(0,6).toUpperCase(),
            industry: wsAcct.industry || '',
            hq: wsAcct.hq || '',
            employees: wsAcct.employees || '',
            revenue: wsAcct.revenue || '',
            status: 'Prospect',
            health: 50,
            lastContact: '',
            notes: '',
            endpoints: '',
            cloud: '',
            users: '',
            relationship: '',
            contacts: [],
            followUps: [],
            projects: [],
            techStack: [],
            interactions: [],
            intelLog: wsAcct.intelLog || [],
            files: [],
            savedLinks: [],
            adminData: {},
            upcomingDates: [],
            unknownMentions: [],
            relSuggestions: [],
            contactSuggestions: [],
            dismissedAlerts: [],
            snoozedAlerts: [],
            healthScoreOverrides: {},
            healthScoreHistory: [],
            aiHistory: [],
            logoImage: '',
            orgChart: {nodes: []},
            createdAt: new Date().toISOString(),
            createdFromWhitespace: true
          }
          setData(prev => ({
            ...prev,
            whitespaceAccounts: (prev.whitespaceAccounts||[]).map(a => a.id===id ? {...a,...changes,updatedAt:now} : a),
            accounts: [...(prev.accounts||[]), newAcct]
          }))
          setWsToast(`${accountName} moved to Active Conversation — added to your accounts dashboard`)
          setTimeout(() => setWsToast(''), 4000)
          return
        }
      }
    }
    setData(prev=>({...prev,whitespaceAccounts:(prev.whitespaceAccounts||[]).map(a=>a.id===id?{...a,...changes,updatedAt:now}:a)}))
  }
  const deleteAccount = (id, accountName, accountIndex) => {
    if(!window.confirm(`Delete "${accountName}" from whitespace tracker?`))return
    if (import.meta.env.DEV) console.log('Deleting whitespace account', { id, name: accountName, index: accountIndex })
    // Set _lastDirectSave so the focus-triggered safeLoadData in App.jsx does not reload stale
    // data from Supabase and overwrite the delete before the auto-save fires (2s debounce).
    window._lastDirectSave = Date.now()
    if (id) {
      setData(prev=>({...prev,whitespaceAccounts:(prev.whitespaceAccounts||[]).filter(a=>a.id!==id)}))
      if(expandedId===id)setExpandedId(null)
    } else {
      // Fallback for legacy accounts with no id: remove first exact name match only
      let removed = false
      setData(prev=>({
        ...prev,
        whitespaceAccounts:(prev.whitespaceAccounts||[]).filter(a=>{
          if(!removed && a.name===accountName && !a.id){removed=true;return false}
          return true
        })
      }))
      setExpandedId(null)
    }
  }
  const addAccount = () => {
    if(!addForm.name.trim())return
    if (!addDupeWarning) {
      const match = (data.whitespaceAccounts||[]).find(a=>fuzzyMatchAccount(addForm.name, a.name))
      if (match) { setAddDupeWarning({match}); return }
    }
    const now = new Date().toISOString()
    const newA = {id:uid(),name:addForm.name,hq:addForm.hq,industry:addForm.industry,employees:addForm.employees,revenue:addForm.revenue,status:addForm.status,contacts:[],technologies:[],notes:addForm.notes?[{id:uid(),text:addForm.notes,date:new Date().toISOString().split('T')[0],addedBy:''}]:[],intelLog:[],addedAt:now,updatedAt:now}
    setData(prev=>({...prev,whitespaceAccounts:[...(prev.whitespaceAccounts||[]),newA]}))
    setAddForm({name:'',hq:'',industry:'',employees:'',revenue:'',status:'Prospect',notes:''})
    setShowAdd(false)
    setAddDupeWarning(null)
  }

  const escapeCSV = val => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (/[,"\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"'
    return str
  }

  const exportSummaryCSV = () => {
    const headers = ['Account Name','HQ','Industry','Employees','Revenue']
    const rows = ws.map(a => [escapeCSV(a.name),escapeCSV(a.hq),escapeCSV(a.industry),escapeCSV(a.employees),escapeCSV(a.revenue)].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], {type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'whitespace-summary.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const exportSelectedFullDetailsCSV = () => {
    const sel = ws.filter(a => selectedForExport.has(a.id))
    if (sel.length === 0) { alert('Select at least one account to export.'); return }
    const headers = ['Account Name','HQ','Industry','Employees','Revenue','Status','Contacts','Technologies','Notes','Intel Log','AI Score','AI Score Reasoning','Added','Updated']
    const rows = sel.map(a => {
      const notes = (a.notes||[]).map(n=>`[${n.date||''}] ${n.text||''}`).join(' | ')
      const intel = (a.intelLog||[]).map(n=>`[${n.date||''}] ${n.summary||n.text||''}`).join(' | ')
      return [
        escapeCSV(a.name), escapeCSV(a.hq), escapeCSV(a.industry),
        escapeCSV(a.employees), escapeCSV(a.revenue), escapeCSV(a.status),
        escapeCSV((a.contacts||[]).map(c=>c.name||c).join('; ')),
        escapeCSV((a.technologies||[]).join('; ')),
        escapeCSV(notes), escapeCSV(intel),
        escapeCSV(a.ai_opportunity_score!=null?String(a.ai_opportunity_score):''),
        escapeCSV(a.ai_score_reasoning||''),
        escapeCSV(a.addedAt||''), escapeCSV(a.updatedAt||''),
      ].join(',')
    })
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], {type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'whitespace-selected-full-details.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const handleAutoFill = async () => {
    if (aiOpRunning) return
    if (!effectiveKey) { alert('Add your Anthropic API key in Settings first.'); return }
    const missing = ws.filter(a => !a.employees || !a.revenue)
    if (missing.length === 0) { alert('All accounts already have employee and revenue data!'); return }
    setShowAutoFillModal(false)
    setAiOpRunning(true); setAiOpSummary(''); setAiOpProgress('')
    let updatedCount = 0
    for (let i = 0; i < missing.length; i++) {
      const account = missing[i]
      setAiOpProgress(`Processing ${i+1} of ${missing.length}: ${account.name}…`)
      const _autoFillStart = Date.now()
      try {
        const _autoFillPrompt = `Research the employee count and annual revenue for ${account.name}${account.hq?' headquartered in '+account.hq:''}${account.industry?' in the '+account.industry+' industry':''}`
        const resp = await fetch('/api/ai', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 600,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{role:'user',content:`Research the employee count and annual revenue for ${account.name}${account.hq?' headquartered in '+account.hq:''}${account.industry?' in the '+account.industry+' industry':''}. Search up to 3 trusted sources (company website, LinkedIn, Crunchbase, Pitchbook, public filings, press releases). Rules: (1) employees must be a single rounded integer — never a range, never use ~, never write "approximately" — if you find multiple estimates average them and round to the nearest 100 or 1000 as appropriate; (2) revenue must be a clean short string like $500M or $1.2B — no ~, no approximation language, no "around"; (3) if you cannot find reliable data for a field return an empty string for that field; (4) do not hallucinate or invent numbers. Return ONLY valid JSON with no other text: {"employees":"single integer as string e.g. 5000","revenue":"clean string e.g. $500M","source":"brief description of sources used"}`}]
          })
        })
        trackAI({ feature: FEATURES.WHITESPACE_TOOLS, operation: 'auto-fill-firmographic', model: 'claude-sonnet-4-6', inputChars: _autoFillPrompt.length, maxTokensOut: 600, durationMs: Date.now() - _autoFillStart, success: resp.ok, notes: account.name })
        const result = await resp.json()
        let parsed = null
        for (const block of (result.content || [])) {
          if (block.type === 'text') {
            try { parsed = JSON.parse(block.text) } catch {
              const m = block.text.match(/\{[\s\S]*?\}/)
              if (m) try { parsed = JSON.parse(m[0]) } catch {}
            }
            if (parsed) break
          }
        }
        if (parsed) {
          const changes = {}
          const empRaw = parsed.employees ? String(parsed.employees).replace(/[~≈,\s]/g,'').trim() : ''
          const revRaw = parsed.revenue ? String(parsed.revenue).replace(/[~≈]/g,'').trim() : ''
          const empClean = empRaw && !empRaw.includes('-') && empRaw !== 'Notfound' ? empRaw : ''
          const revClean = revRaw && revRaw !== 'Notfound' ? revRaw : ''
          if (!account.employees && empClean) changes.employees = empClean
          if (!account.revenue && revClean) changes.revenue = revClean
          if (parsed.source && (changes.employees || changes.revenue)) changes.employeeSource = String(parsed.source)
          if (Object.keys(changes).length > 0) { updateAccount(account.id, changes); updatedCount++ }
        }
      } catch (err) { console.error(`Auto-fill failed for ${account.name}:`, err) }
    }
    setAiOpRunning(false); setAiOpProgress('')
    setAiOpSummary(`Updated ${updatedCount} of ${missing.length} accounts with employee and revenue data`)
  }

  const handleCleanNotes = async () => {
    if (aiOpRunning) return
    if (!effectiveKey) { alert('Add your Anthropic API key in Settings first.'); return }
    const accts = ws.filter(a => ((a.intelLog||[]).length + (a.notes||[]).length) > 2)
    if (accts.length === 0) { alert('No accounts with more than 2 notes entries found.'); return }
    setShowCleanNotesModal(false)
    setAiOpRunning(true); setAiOpSummary(''); setAiOpProgress('')
    let updatedCount = 0
    for (let i = 0; i < accts.length; i++) {
      const account = accts[i]
      setAiOpProgress(`Cleaning notes for ${i+1} of ${accts.length}: ${account.name}…`)
      const allNotesText = [
        ...(account.notes||[]).map(n => `[${n.date||''}] ${n.text||''}`),
        ...(account.intelLog||[]).map(n => `[${n.date||''}] ${n.summary||n.text||''}`)
      ].join('\n\n')
      const _cleanInput = `You are cleaning up sales intelligence notes for ${account.name}. Here are all the notes and intel entries:\n\n${allNotesText}\n\nConsolidate these into clean, non-redundant notes.`
      const _cleanStart = Date.now()
      try {
        const resp = await fetch('/api/ai', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            messages: [{role:'user',content:`You are cleaning up sales intelligence notes for ${account.name}. Here are all the notes and intel entries:\n\n${allNotesText}\n\nConsolidate these into clean, non-redundant notes. Rules: (1) Keep ALL unique facts, details, contacts, and intel — do not lose any real information. (2) Remove duplicate sentences and repetitive summaries. (3) Combine similar points into single clear statements. (4) Keep chronological context where relevant. (5) Return ONLY the cleaned notes as plain text, no headers, no JSON. Maximum 500 words.`}]
          })
        })
        trackAI({ feature: FEATURES.WHITESPACE_TOOLS, operation: 'clean-notes', model: 'claude-sonnet-4-6', inputChars: _cleanInput.length, maxTokensOut: 2000, durationMs: Date.now() - _cleanStart, success: resp.ok, notes: account.name })
        const result = await resp.json()
        const text = (result.content||[]).find(b=>b.type==='text')?.text
        if (text) {
          const today = new Date().toISOString().split('T')[0]
          const cleanedEntry = { id: uid(), text: text.trim(), date: today, addedBy: 'AI Dedup' }
          updateAccount(account.id, {
            notes: [cleanedEntry],
            intelLog: [],
            intelArchive: [...(account.intelLog||[]), ...(account.notes||[])]
          })
          updatedCount++
        }
      } catch (err) { console.error(`Note clean failed for ${account.name}:`, err) }
    }
    setAiOpRunning(false); setAiOpProgress('')
    setAiOpSummary(`Cleaned and consolidated notes for ${updatedCount} of ${accts.length} accounts`)
  }

  useEffect(()=>{
    if(!showMoreMenu)return
    const h=e=>{if(moreMenuRef.current&&!moreMenuRef.current.contains(e.target))setShowMoreMenu(false)}
    document.addEventListener('mousedown',h)
    return()=>document.removeEventListener('mousedown',h)
  },[showMoreMenu])

  // Normalize legacy whitespace accounts that are missing ids (run once when accounts first load)
  useEffect(()=>{
    if (wsIdsNormalized.current) return
    const wsList = data?.whitespaceAccounts
    if (!wsList?.length) return
    wsIdsNormalized.current = true
    if (wsList.every(a => a.id)) return
    setData(prev=>({
      ...prev,
      whitespaceAccounts: (prev.whitespaceAccounts||[]).map(a => a.id ? a : {...a, id: uid()})
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data?.whitespaceAccounts?.length])

  const fetchRecommendations = async () => {
    if (recLoading) return
    if (!effectiveKey) { setRecError('Add your Anthropic API key in Settings first.'); return }
    setRecLoading(true); setRecError('')
    const dismissed = data.dismissedWhitespaceSuggestions || []
    const context = {
      whitespaceAccounts: ws.map(a => ({
        name: a.name, status: a.status, employees: a.employees, revenue: a.revenue,
        industry: a.industry, hq: a.hq,
        intelCount: ((a.intelLog||[]).length + (a.notes||[]).length),
        lastIntel: ([...(a.intelLog||[]),...(a.notes||[])].sort((x,y)=>(y.date||'').localeCompare(x.date||''))[0]?.date)||'',
        contacts: (a.contacts||[]).map(c=>c.name),
        technologies: (a.technologies||[]).map(t=>t.vendor),
        notes: [...(a.intelLog||[]),...(a.notes||[])].slice(0,2).map(n=>n.summary||n.text||'').join(' ').slice(0,300)
      })),
      myAccounts: (data.accounts||[]).map(a=>({name:a.name, contacts:(a.contacts||[]).map(c=>c.name)}))
    }
    const dismissedNote = dismissed.length > 0 ? `\n\nDo NOT include these previously dismissed accounts: ${dismissed.join(', ')}` : ''
    const _recBody = JSON.stringify(context)
    const _recStart = Date.now()
    try {
      const resp = await fetch('/api/ai', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-6',
          max_tokens:2000,
          system:'You are a cybersecurity sales advisor helping an Enterprise Client Manager at GuidePoint Security prioritize whitespace accounts to pursue. Analyze the accounts and identify the top 10 highest priority targets.',
          messages:[{role:'user',content:`Here is my whitespace account data and my existing named accounts:\n${JSON.stringify(context,null,2)}${dismissedNote}\n\nIdentify the TOP 10 whitespace accounts to prioritize RIGHT NOW. For each account return:\n- name: exact account name from the data\n- priority: "Hot" | "Warm" | "Watch"\n- reasons: array of exactly 3 short bullet points explaining why (mention specific signals like known contacts, intel activity, direct contracts, vendor relationships, industry urgency, employee size, revenue)\n\nReturn ONLY valid JSON:\n{"recommendations":[{"name":"...","priority":"Hot","reasons":["...","...","..."]}]}`}]
        })
      })
      trackAI({ feature: FEATURES.WHITESPACE_TOOLS, operation: 'whitespace-recommendations', model: 'claude-sonnet-4-6', inputChars: _recBody.length, maxTokensOut: 2000, durationMs: Date.now() - _recStart, success: resp.ok })
      const result = await resp.json()
      if (result.error) throw new Error(result.error.message)
      const text = (result.content||[]).find(b=>b.type==='text')?.text||''
      const parsed = extractJSON(text)
      const recs = parsed?.recommendations || []
      setData(prev=>({...prev, whitespaceRecommendations: recs}))
    } catch(err) {
      console.error('Recommendations error:', err)
      setRecError('Failed to get recommendations. Check your API key.')
    } finally {
      setRecLoading(false)
    }
  }

  const scoreOneAccount = async (acct) => {
    const empN = parseNum(acct.employees||'')
    const empTier = empN<=1000?'Under 1,000 (lowest weight)':empN<=3500?'1,001–3,500 (low-medium weight)':empN<=6000?'3,501–6,000 (medium weight)':empN<=15000?'6,001–15,000 (medium-high weight)':empN<=40000?'15,001–40,000 (high weight)':'40,001+ (highest weight)'
    const allNotes = [...(acct.intelLog||[]).map(n=>n.summary||n.text||''),...(acct.notes||[]).map(n=>n.text||'')].filter(Boolean)
    const lastIntelDate = [...(acct.intelLog||[]),...(acct.notes||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0]?.date||''
    const ctx = {name:acct.name,hq:acct.hq||'',employees:acct.employees||'',employeeTier:empTier,revenue:acct.revenue||'',status:acct.status||'',industry:acct.industry||'',vendors:(acct.technologies||[]).map(t=>({name:t.name,status:t.status})),contacts:(acct.contacts||[]).map(c=>c.name),notes:allNotes.slice(0,8),lastIntelDate,intelCount:allNotes.length}
    const prompt = `You are a cybersecurity sales scoring engine for GuidePoint Security. Score this whitespace prospect's AI opportunity score from 1-100.\n\nAccount:\n${JSON.stringify(ctx,null,2)}\n\nWeighting:\n- Employee count tier: ${empTier}\n  Exact tiers: Under 1,000=lowest weight | 1,001-3,500=low-medium weight | 3,501-6,000=medium weight | 6,001-15,000=medium-high weight | 15,001-40,000=high weight | 40,001+=highest weight\n- Revenue: higher revenue scores higher\n- Notes/intel: active evaluations, renewals, vendor dissatisfaction, budget cycles, known gaps score higher\n- Displacement opportunity: incumbent vendors GuidePoint could displace score higher\n- Whitespace coverage: fewer known vendors = more opportunity = higher score\n- Intel recency: recent notes score higher than stale or empty\n\nReturn ONLY valid JSON, no preamble or markdown:\n{"score":<integer 1-100>,"reasoning":"<1-2 sentences on the top factors>"}`
    const _scoreStart = Date.now()
    const {data:result} = await callClaudeWithRetry({model:'claude-sonnet-4-6',max_tokens:300,messages:[{role:'user',content:prompt}]},effectiveKey)
    trackAI({ feature: FEATURES.WHITESPACE_TOOLS, operation: 'score-account', model: 'claude-sonnet-4-6', inputChars: prompt.length, maxTokensOut: 300, durationMs: Date.now() - _scoreStart, notes: acct.name })
    if (result.error) throw new Error(result.error.message)
    const text = (result.content||[]).find(b=>b.type==='text')?.text||''
    const parsed = extractJSON(text)
    if (!parsed?.score) throw new Error('Invalid score response')
    return {score:parsed.score,reasoning:parsed.reasoning||''}
  }

  const scoreAllAccounts = async () => {
    if (scoringAll) return
    if (!effectiveKey) {alert('Add your Anthropic API key in Settings first.');return}
    const unscored = ws.filter(a=>a.ai_opportunity_score==null)
    if (!unscored.length) {alert('All accounts are already scored. Use Rescore on individual accounts to refresh.');return}
    setScoringAll(true)
    let scored = 0, enrichedCount = 0, skipped = 0

    for (let i = 0; i < unscored.length; i++) {
      const acct = unscored[i]
      setScoreProgress(`Scoring ${i+1} of ${unscored.length}: ${acct.name}…`)

      // ── Step 1: Enrich missing firmographic fields via web search ──────────
      let acctForScoring = acct
      const needsEnrich = !acct.hq || !acct.industry || !acct.employees || !acct.revenue
      if (needsEnrich) {
        try {
          const knowns = [
            acct.hq       && `HQ: ${acct.hq}`,
            acct.industry && `Industry: ${acct.industry}`,
            acct.employees && `Employees: ${acct.employees}`,
            acct.revenue  && `Revenue: ${acct.revenue}`,
          ].filter(Boolean).join(', ')
          const enrichPrompt = `Research the company "${acct.name}"${knowns ? ` (known: ${knowns})` : ''} using trusted public sources (company website, LinkedIn, Crunchbase, Wikipedia, Bloomberg, public filings). Return ONLY valid JSON. No markdown. No code fences. No commentary:\n{"hq":"city, state or country or empty string","industry":"primary industry vertical or empty string","employees":"headcount as rounded integer string e.g. 5000 or empty string","revenue":"annual revenue as short clean string e.g. $500M or empty string","website":"primary domain e.g. acme.com or empty string","confidence":"High|Medium|Low","sourcesSummary":"brief note on sources used"}`
          const _enrichStart = Date.now()
          const enrichResp = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 600,
              tools: [{ type: 'web_search_20250305', name: 'web_search' }],
              messages: [{ role: 'user', content: enrichPrompt }]
            })
          })
          trackAI({ feature: FEATURES.WHITESPACE_TOOLS, operation: 'enrich-firmographic', model: 'claude-sonnet-4-6', inputChars: enrichPrompt.length, maxTokensOut: 600, durationMs: Date.now() - _enrichStart, success: enrichResp.ok, notes: acct.name })
          if (enrichResp.ok) {
            const enrichResult = await enrichResp.json()
            let enrichData = null
            for (const block of (enrichResult.content || [])) {
              if (block.type === 'text') { enrichData = extractStructuredAIResponse(block.text); if (enrichData) break }
            }
            if (enrichData) {
              const clean = v => { const s = v != null ? String(v).trim() : ''; return s && !/^(unknown|n\/a|none|null|-)$/i.test(s) ? s : '' }
              const changes = {}
              if (!acct.hq && clean(enrichData.hq)) changes.hq = clean(enrichData.hq)
              if (!acct.industry && clean(enrichData.industry)) changes.industry = clean(enrichData.industry)
              if (!acct.employees) {
                const emp = clean(enrichData.employees).replace(/[~≈,\s]/g,'')
                if (emp && !emp.includes('-') && !/[a-df-wyz]/i.test(emp)) changes.employees = emp
              }
              if (!acct.revenue) {
                const rev = clean(enrichData.revenue).replace(/[~≈]/g,'')
                if (rev && !/^(notfound|n\/a|unknown)$/i.test(rev)) changes.revenue = rev
              }
              if (!acct.website && clean(enrichData.website)) changes.website = clean(enrichData.website)
              if (Object.keys(changes).length > 0) {
                acctForScoring = {...acct, ...changes}
                setData(prev=>({...prev, whitespaceAccounts:(prev.whitespaceAccounts||[]).map(a=>a.id===acct.id?{...a,...changes}:a)}))
                enrichedCount++
              }
            }
          }
        } catch(enrichErr) { console.error(`[ScoreAll] Enrich failed for ${acct.name}:`, enrichErr) }
      }

      // ── Step 2: Score (using enriched data if available) ───────────────────
      try {
        const {score,reasoning} = await scoreOneAccount(acctForScoring)
        console.log(`[Score] ✓ ${acct.name}: score=${score}, reasoning="${reasoning}"`)
        setData(prev=>({...prev, whitespaceAccounts:(prev.whitespaceAccounts||[]).map(a=>a.id===acct.id?{...a,ai_opportunity_score:score,ai_score_reasoning:reasoning,ai_score_updated_at:new Date().toISOString()}:a)}))
        scored++
      } catch(scoreErr) { console.error(`[ScoreAll] Score failed for ${acct.name}:`, scoreErr); skipped++ }
    }

    setScoringAll(false); setScoreProgress('')
    const summary = `Scored and enriched ${scored} account${scored!==1?'s':''}${enrichedCount>0?` (${enrichedCount} enriched)`:''}${skipped>0?`. ${skipped} skipped.`:'. '}`
    setWsToast(summary); setTimeout(()=>setWsToast(''), 6000)
  }

  const rescoreAccount = async (acctId) => {
    if (scoringId) return
    if (!effectiveKey) {alert('Add your Anthropic API key in Settings first.');return}
    const acct = ws.find(a=>a.id===acctId); if(!acct)return
    setScoringId(acctId)
    try {
      const {score,reasoning} = await scoreOneAccount(acct)
      console.log(`[Rescore] ✓ ${acct.name}: score=${score}, reasoning="${reasoning}"`)
      setData(prev=>({...prev,whitespaceAccounts:(prev.whitespaceAccounts||[]).map(a=>a.id===acctId?{...a,ai_opportunity_score:score,ai_score_reasoning:reasoning,ai_score_updated_at:new Date().toISOString()}:a)}))
    } catch(err){console.error(`Rescore failed for ${acct.name}:`,err)}
    finally{setScoringId(null)}
  }

  const executeMerge = async () => {
    if (mergeSelected.size < 2 || !mergePrimary) return
    const selectedIds = [...mergeSelected]
    console.log('Merge clicked, selected:', selectedIds, 'primary:', mergePrimary)
    const primary = ws.find(a=>a.id===mergePrimary)
    if (!primary) { console.warn('Primary account not found:', mergePrimary); return }
    const others = ws.filter(a=>mergeSelected.has(a.id)&&a.id!==mergePrimary)
    const allIntelLog = [...(primary.intelLog||[]),...others.flatMap(a=>a.intelLog||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
    const allNotes = [...(primary.notes||[]),...others.flatMap(a=>a.notes||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
    const contactMap = new Map()
    ;[...(primary.contacts||[]),...others.flatMap(a=>a.contacts||[])].forEach(c=>{const k=((c.email||'').toLowerCase().trim()||(c.name||'').toLowerCase().trim());if(!contactMap.has(k))contactMap.set(k,c)})
    const techMap = new Map()
    ;[...(primary.technologies||[]),...others.flatMap(a=>a.technologies||[])].forEach(t=>{const k=(t.vendor||'').toLowerCase().trim();if(!techMap.has(k))techMap.set(k,t)})
    const histMap = new Map()
    ;[...(primary.aiHistory||[]),...others.flatMap(a=>a.aiHistory||[])].forEach(h=>{if(!histMap.has(h.id))histMap.set(h.id,h)})
    const fuMap = new Map()
    ;[...(primary.followUps||[]),...others.flatMap(a=>a.followUps||[])].forEach(fu=>{if(!fuMap.has(fu.id))fuMap.set(fu.id,fu)})
    const projMap = new Map()
    ;[...(primary.projects||[]),...others.flatMap(a=>a.projects||[])].forEach(proj=>{if(!projMap.has(proj.id))projMap.set(proj.id,proj)})
    const mergedAccount = {
      ...primary,
      notes: allNotes,
      intelLog: allIntelLog,
      contacts: [...contactMap.values()],
      technologies: [...techMap.values()],
      aiHistory: [...histMap.values()],
      followUps: [...fuMap.values()],
      projects: [...projMap.values()],
      updatedAt: new Date().toISOString()
    }
    const allSelectedIds = [...mergeSelected]
    const newWhitespaceAccounts = [...(ws.filter(a=>!allSelectedIds.includes(a.id))), mergedAccount]
    const mergedData = {...data, whitespaceAccounts: newWhitespaceAccounts}
    setData(prev=>({...prev, whitespaceAccounts: newWhitespaceAccounts}))
    window._lastDirectSave = Date.now()
    try {
      await saveData(mergedData)
    } catch(e) {
      console.error('Merge save failed:', e)
      setMergeToast('Merge failed to save — please try again')
      setTimeout(()=>setMergeToast(''),4000)
      return
    }
    const msg = `${mergeSelected.size} accounts merged into "${primary.name}"`
    setMergeToast(msg); setTimeout(()=>setMergeToast(''),4000)
    setShowMerge(false); setMergeSelected(new Set()); setMergePrimary(null); setMergeStep(1); setMergeSearch('')
  }

  const handleDupeAction = (action, pairA, pairB) => {
    if (action==='keepA') {
      setData(prev=>({...prev,whitespaceAccounts:prev.whitespaceAccounts.filter(a=>a.id!==pairB.id)}))
    } else if (action==='keepB') {
      setData(prev=>({...prev,whitespaceAccounts:prev.whitespaceAccounts.filter(a=>a.id!==pairA.id)}))
    } else if (action==='merge') {
      const allNotes=[...(pairA.notes||[]),...(pairB.notes||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
      const allIntelLog=[...(pairA.intelLog||[]),...(pairB.intelLog||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
      const contactMap=new Map(); [...(pairA.contacts||[]),...(pairB.contacts||[])].forEach(c=>{const k=(c.name||'').toLowerCase();if(!contactMap.has(k))contactMap.set(k,c)})
      const techMap=new Map(); [...(pairA.technologies||[]),...(pairB.technologies||[])].forEach(t=>{const k=(t.vendor||'').toLowerCase();if(!techMap.has(k))techMap.set(k,t)})
      const merged={...pairA,notes:allNotes,intelLog:allIntelLog,contacts:[...contactMap.values()],technologies:[...techMap.values()],updatedAt:new Date().toISOString()}
      setData(prev=>({...prev,whitespaceAccounts:prev.whitespaceAccounts.filter(a=>a.id!==pairB.id).map(a=>a.id===pairA.id?merged:a)}))
    }
  }

  const WS_FILE_CHAR_LIMIT = 100000
  const WS_IMAGE_EXTS = ['png','jpg','jpeg','webp']
  const WS_TEXT_EXTS = ['txt','pdf','doc','docx','md']
  const WS_SS_EXTS   = ['xlsx','xls','csv']
  // Strip /, _, -, . from headers then collapse whitespace so "state/province" → "state province"
  const normalizeHdr = h => h.toLowerCase().replace(/[/_\-\.]+/g, ' ').replace(/\s+/g, ' ').trim()

  const WS_SS_COL_MAP = {
    name:      ['account name','account','company','company name','name','organization','org name','client','client name','customer name','customer','contact name','lead name'],
    hq:        ['hq','headquarters','location','city','state','state province','province','region','state region','territory','office location','city state'],
    industry:  ['industry','vertical','sector','business type','market','market segment'],
    employees: ['employees','employee count','headcount','company size','size','team size','num employees','number of employees','staff','staff count','employee size'],
    revenue:   ['revenue','annual revenue','arr','mrr','total revenue','yearly revenue'],
    notes:     ['notes','ai notes','description','comments','comment','details','additional info','intel'],
    owner:     ['account owner','owner','rep','sales rep','assigned to','assigned rep','territory owner','ae','se'],
    type:      ['customer type','account type','type','prospect type','lead type','classification','segment'],
    website:   ['website','domain','url','web','website url','homepage'],
  }

  const loadMammothWS = () => new Promise((resolve, reject) => {
    if (window.mammoth) { resolve(window.mammoth); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
    script.onload = () => resolve(window.mammoth)
    script.onerror = () => reject(new Error('Failed to load mammoth.js'))
    document.head.appendChild(script)
  })

  const loadPdfJsWS = () => new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; resolve(window.pdfjsLib) }
    script.onerror = () => reject(new Error('Failed to load PDF.js'))
    document.head.appendChild(script)
  })

  const resetWsFileState = () => {
    setWsUploadedFile(null); setWsPendingFile(null); setWsFileIsDirectType(false)
    setWsFileError(''); setWsFileStatus(''); setWsFileCharCount(0); setWsLargeDocWarning(false)
    setWsCustomDate(''); setWsPendingDate(''); setWsSpreadsheetRows(null)
  }

  const wsHandleFile = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!WS_IMAGE_EXTS.includes(ext) && !WS_TEXT_EXTS.includes(ext) && !WS_SS_EXTS.includes(ext)) {
      setWsFileError('Unsupported file type. Use PDF, DOCX, TXT, MD, PNG, JPG, WEBP, XLSX, XLS, or CSV.')
      return
    }
    setWsFileError(''); setWsFileStatus('')

    if (ext === 'pdf') {
      if (file.size > 32 * 1024 * 1024) { setWsFileError(`PDF too large (${(file.size/1024/1024).toFixed(1)}MB). Maximum size is 32MB.`); return }
      if (file.size > 20 * 1024 * 1024) setWsFileStatus(`Large PDF detected (${(file.size/1024/1024).toFixed(1)}MB). Analysis may take longer.`)
      setWsUploadedFile({name:file.name, size:file.size})
      setWsFileIsDirectType(true)
      setWsPendingFile(file)
      try {
        const headerText = await new Promise(resolve => { const r=new FileReader(); r.onload=e=>resolve(e.target.result||''); r.onerror=()=>resolve(''); r.readAsText(file.slice(0,1000)) })
        setWsCustomDate(detectDate(headerText)||'')
      } catch { setWsCustomDate('') }
      setWsDateModalIsFile(true)
      setWsShowDate(true)
    } else if (WS_IMAGE_EXTS.includes(ext)) {
      if (file.size > 32 * 1024 * 1024) { setWsFileError('File too large. Maximum size is 32MB.'); return }
      if (!effectiveKey) { setWsFileError('Add your Anthropic API key in Settings to process images.'); return }
      setWsUploadedFile({name:file.name, size:file.size})
      setWsFileIsDirectType(true)
      setWsPendingFile(file)
      setWsCustomDate('')
      setWsDateModalIsFile(true)
      setWsShowDate(true)
    } else if (ext==='docx'||ext==='doc') {
      if (file.size > 32 * 1024 * 1024) { setWsFileError('File too large. Maximum size is 32MB.'); return }
      setWsFileLoading(true); setWsFileIsDirectType(false)
      setWsUploadedFile({name:file.name, size:file.size})
      try {
        const mammoth = await loadMammothWS()
        const ab = await file.arrayBuffer()
        const result = await mammoth.extractRawText({arrayBuffer:ab})
        let extracted = result.value
        setWsFileCharCount(extracted.length)
        if (extracted.length > WS_FILE_CHAR_LIMIT) { extracted='[Note: This document was truncated to 100,000 characters for processing.]\n\n'+extracted.slice(0,WS_FILE_CHAR_LIMIT); setWsLargeDocWarning(true) }
        setIntelText(extracted)
        setWsCustomDate(detectDate(extracted)||'')
        setWsDateModalIsFile(false)
        setWsShowDate(true)
      } catch(e) { setWsFileError('DOCX extraction failed. Try a different format or copy-paste the content.'); setWsUploadedFile(null) }
      finally { setWsFileLoading(false) }
    } else if (ext==='txt'||ext==='md') {
      if (file.size > 32 * 1024 * 1024) { setWsFileError('File too large. Maximum size is 32MB.'); return }
      setWsFileLoading(true); setWsFileIsDirectType(false)
      setWsUploadedFile({name:file.name, size:file.size})
      try {
        let extracted = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=e=>resolve(e.target.result);r.onerror=reject;r.readAsText(file)})
        setWsFileCharCount(extracted.length)
        if (extracted.length > WS_FILE_CHAR_LIMIT) { extracted='[Note: This document was truncated to 100,000 characters for processing.]\n\n'+extracted.slice(0,WS_FILE_CHAR_LIMIT); setWsLargeDocWarning(true) }
        setIntelText(extracted)
        setWsCustomDate(detectDate(extracted)||'')
        setWsDateModalIsFile(false)
        setWsShowDate(true)
      } catch(e) { setWsFileError('Could not read file. Try copy-pasting the content.'); setWsUploadedFile(null) }
      finally { setWsFileLoading(false) }
    } else if (WS_SS_EXTS.includes(ext)) {
      if (file.size > 10 * 1024 * 1024) { setWsFileError(`Spreadsheet too large (${(file.size/1024/1024).toFixed(1)}MB). Maximum size is 10MB.`); return }
      setWsFileLoading(true); setWsFileIsDirectType(false)
      setWsUploadedFile({name:file.name, size:file.size})
      try {
        const ab = await file.arrayBuffer()
        const workbook = XLSX.read(ab, {type:'array'})
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) throw new Error('No worksheets found')
        const sheet = workbook.Sheets[sheetName]
        const allRows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:''})
        if (allRows.length < 2) throw new Error('No data rows found')
        const rawHeaders = allRows[0].map(h => String(h).trim())
        const normHeaders = rawHeaders.map(normalizeHdr)
        // Map column indices using normalized headers (strips /, _, - so "state/province" → "state province")
        const colIdx = {}
        for (const [field, aliases] of Object.entries(WS_SS_COL_MAP)) {
          const idx = normHeaders.findIndex(h => aliases.includes(h))
          if (idx !== -1) colIdx[field] = idx
        }
        const dataRows = allRows.slice(1).filter(r => r.some(c => c !== '')).slice(0, 5000)
        if (dataRows.length === 0) throw new Error('No data rows found')
        const getCell = (row, i) => { const v = row[i]; return v !== undefined && v !== null ? String(v).trim() : '' }
        // Build structured row objects for AI and direct-parse fallback
        const structuredRows = dataRows.map(row => {
          const obj = {}
          if (colIdx.name !== undefined)     { const v = getCell(row,colIdx.name);      if (v) obj.accountName  = v }
          if (colIdx.hq !== undefined)        { const v = getCell(row,colIdx.hq);        if (v) obj.location     = v }
          if (colIdx.industry !== undefined)  { const v = getCell(row,colIdx.industry);  if (v) obj.industry     = v }
          if (colIdx.employees !== undefined) { const v = getCell(row,colIdx.employees); if (v) obj.companySize  = v }
          if (colIdx.revenue !== undefined)   { const v = getCell(row,colIdx.revenue);   if (v) obj.revenue      = v }
          if (colIdx.notes !== undefined)     { const v = getCell(row,colIdx.notes);     if (v) obj.notes        = v }
          if (colIdx.owner !== undefined)     { const v = getCell(row,colIdx.owner);     if (v) obj.accountOwner = v }
          if (colIdx.type !== undefined)      { const v = getCell(row,colIdx.type);      if (v) obj.customerType = v }
          if (colIdx.website !== undefined)   { const v = getCell(row,colIdx.website);   if (v) obj.website      = v }
          // Include any unmapped columns as-is
          rawHeaders.forEach((h, i) => {
            if (!Object.values(colIdx).includes(i)) {
              const v = getCell(row, i)
              if (v) {
                const key = normalizeHdr(h).replace(/\s+(.)/g, (_, c) => c.toUpperCase()).replace(/^\s+|\s+$/g,'') || `col${i}`
                obj[key] = v
              }
            }
          })
          return obj
        }).filter(obj => Object.keys(obj).length > 0)
        // Store all rows for direct-parse fallback (used in processIntel if AI returns 0)
        setWsSpreadsheetRows(structuredRows)
        // Format as structured JSON rows with a recognizable import marker
        const markerLine = `[SPREADSHEET_IMPORT: ${file.name} — ${structuredRows.length} rows]`
        const rowLines = structuredRows.map((obj, i) => `Row ${i+1}: ${JSON.stringify(obj)}`)
        let extracted = markerLine + '\n' + rowLines.join('\n')
        setWsFileCharCount(extracted.length)
        if (extracted.length > WS_FILE_CHAR_LIMIT) {
          const truncLines = []
          let len = markerLine.length + 1
          for (const l of rowLines) { if (len + l.length + 1 > WS_FILE_CHAR_LIMIT) break; truncLines.push(l); len += l.length + 1 }
          extracted = `[SPREADSHEET_IMPORT: ${file.name} — showing first ${truncLines.length} of ${structuredRows.length} rows]\n` + truncLines.join('\n')
          setWsLargeDocWarning(true)
        }
        setIntelText(extracted)
        setWsCustomDate('')
        setWsDateModalIsFile(false)
        setWsShowDate(true)
      } catch(e) {
        console.error('[WS Spreadsheet]', e)
        setWsFileError('Could not read spreadsheet. Please try .xlsx, .xls, or .csv.')
        setWsUploadedFile(null)
      }
      finally { setWsFileLoading(false) }
    }
  }

  const processFileIntel = async (date, forceFallback = false) => {
    if (!wsPendingFile) return
    const ext = wsPendingFile.name.split('.').pop().toLowerCase()
    setIntelLoading(true); setIntelError(''); setIntelStatus(''); setWsRetryStatus('')
    setWsPendingDate(date)

    const SYS_WS = 'You are an account intelligence analyst. Extract prospect company names and notes from vendor calls and sales intel documents. Return ONLY valid JSON. Start with { and end with }. No markdown, no code blocks, no text before or after the JSON.'
    const buildPromptWS = txt => `Extract all prospect/whitespace accounts from this input. Return ONLY this JSON structure with no other text:\n{"accounts":[{"name":"Company Name","hq":"city, state or empty string","industry":"industry or empty string","employees":"headcount as string like '5,000' or '5k' or empty string","revenue":"annual revenue as string like '$500M' or '500 million' or empty string","note":"2-3 sentence intel summary","status":"Prospect|Researching|Reached Out|Active Conversation"}]}\n\nRules:\n- Include every company mentioned as a prospect or target\n- Keep notes SHORT — 2-3 sentences max per account\n- Extract the following fields if mentioned anywhere in the input — revenue (annual revenue as a string like '$500M' or '500 million'), employees (headcount as a string like '5,000' or '5k'), hq (city and state), industry (the company's industry). These may appear anywhere in the text — in passing mentions, context, or background information. If revenue is mentioned as a range use the midpoint.\n- Do not include GuidePoint, the vendor you are speaking with, or the user themselves as accounts\n- Return empty accounts array [] if no prospects found\n- CRITICAL: Return valid JSON only, nothing else\n\nInput:\n${txt}`

    const onStatus = msg => { if(msg) setWsRetryStatus(msg); else setWsRetryStatus('') }

    const callTextApiWS = async (inputText) => {
      const {data: resp} = await callClaudeWithRetry({
        model: AI_MODELS.cheap, max_tokens: 2000,
        system:SYS_WS,
        messages:[{role:'user',content:buildPromptWS(inputText)}]
      }, effectiveKey, onStatus)
      if (resp.error) throw new Error(resp.error.message||'API error')
      const raw = resp.content?.[0]?.text||''
      let parsed = extractJSON(raw)
      if (!parsed) {
        try {
          const {data: fix} = await callClaudeWithRetry({model: AI_MODELS.cheap, max_tokens:1000,messages:[{role:'user',content:`Fix this malformed JSON and return ONLY valid JSON:\n${raw}`}]}, effectiveKey, null)
          parsed = extractJSON(fix.content?.[0]?.text||'')
        } catch {}
      }
      return parsed?.accounts || []
    }

    const pdfTextFallbackWS = async () => {
      try {
        const pdfjsLib = await loadPdfJsWS()
        const ab = await wsPendingFile.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({data:ab}).promise
        let fullText = ''
        for (let i=1;i<=pdf.numPages;i++) { const pg=await pdf.getPage(i); const ct=await pg.getTextContent(); fullText+=ct.items.map(it=>it.str).join(' ')+'\n' }
        if (fullText.trim().length > 50) {
          let txt = fullText.length > WS_FILE_CHAR_LIMIT ? '[Truncated]\n\n'+fullText.slice(0,WS_FILE_CHAR_LIMIT) : fullText
          return await callTextApiWS(txt)
        }
      } catch(e2) { console.log('[WS PDF.js fallback]', e2.message) }
      try {
        const pt = await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result||'');r.onerror=rej;r.readAsText(wsPendingFile)})
        if (pt.trim().length > 50) {
          let txt = pt.length > WS_FILE_CHAR_LIMIT ? '[Truncated]\n\n'+pt.slice(0,WS_FILE_CHAR_LIMIT) : pt
          return await callTextApiWS(txt)
        }
      } catch(e3) { console.log('[WS plain text fallback]', e3.message) }
      return null
    }

    try {
      let allAccounts = []
      if (WS_IMAGE_EXTS.includes(ext)) {
        const b64raw = await new Promise(resolve=>{const r=new FileReader();r.onload=e=>resolve(e.target.result);r.readAsDataURL(wsPendingFile)})
        const cleanBase64 = b64raw.includes(',') ? b64raw.split(',')[1] : b64raw
        const {data: imgData} = await callClaudeWithRetry({
          model: AI_MODELS.cheap, max_tokens: 2000,
          messages:[{role:'user',content:[
            {type:'image',source:{type:'base64',media_type:wsPendingFile.type||'image/jpeg',data:cleanBase64}},
            {type:'text',text:buildPromptWS('')}
          ]}]
        }, effectiveKey, onStatus)
        if (imgData.error) throw new Error(`${imgData.error.type}: ${imgData.error.message}`)
        const rawImg = imgData.content?.[0]?.text||''
        let parsed = extractJSON(rawImg)
        if (!parsed) throw new Error('Could not parse AI response.')
        allAccounts = parsed?.accounts || []
      } else if (ext === 'pdf') {
        if (forceFallback) {
          console.log('[WS Diag] PDF forceFallback=true — skipping direct PDF call, going straight to text extraction')
          const accs = await pdfTextFallbackWS()
          if (!accs) throw new Error('All extraction methods failed for this PDF.')
          allAccounts = accs
        } else {
          let directFailed = false
          try {
            const b64raw = await new Promise(resolve=>{const r=new FileReader();r.onload=e=>resolve(e.target.result);r.readAsDataURL(wsPendingFile)})
            const cleanBase64 = b64raw.includes(',') ? b64raw.split(',')[1] : b64raw
            if (cleanBase64.length > 6700000) throw new Error('PDF_TOO_LARGE_FOR_API')
            const {data: pdfData} = await callClaudeWithRetry({
              model: AI_MODELS.cheap, max_tokens: 2000,
              messages:[{role:'user',content:[
                {type:'document',source:{type:'base64',media_type:'application/pdf',data:cleanBase64}},
                {type:'text',text:buildPromptWS('')}
              ]}]
            }, effectiveKey, onStatus)
            if (pdfData.error) {
              directFailed = true
            }
            else {
              const rawPdf = pdfData.content?.[0]?.text||''
              let parsed = extractJSON(rawPdf)
              if (!parsed) {
                directFailed = true
              }
              else allAccounts = parsed?.accounts || []
            }
          } catch(e1) {
            directFailed = true
          }
          if (directFailed) {
            const accs = await pdfTextFallbackWS()
            if (!accs) throw new Error('All extraction methods failed. Try a different PDF or copy-paste the text.')
            allAccounts = accs
          }
        }
      }

      setIntelStatus('')
      if (allAccounts.length === 0) { setIntelError('No prospect companies found in the document.'); setIntelLoading(false); return }
      // Fuzzy dedup within batch
      const dedupedDoc = []
      allAccounts.forEach(a => {
        const existIdx = dedupedDoc.findIndex(b=>fuzzyMatchAccount(a.name,b.name))
        if (existIdx>=0) { if(a.note&&a.note.trim()) dedupedDoc[existIdx]={...dedupedDoc[existIdx],note:[dedupedDoc[existIdx].note,a.note].filter(Boolean).join(' | ')} }
        else dedupedDoc.push(a)
      })
      allAccounts = dedupedDoc
      const sel = new Set()
      allAccounts.forEach((a,i) => {
        const inCRM = (data.accounts||[]).some(ac=>(ac.name||'').toLowerCase().slice(0,8)===(a.name||'').toLowerCase().slice(0,8))
        const blocked = isBlockedAccount(a.name)
        if (!inCRM && !blocked) sel.add(i)
      })
      setPendingIntel({accounts:allAccounts, date})
      setSelectedIntel(sel)
      setShowIntel(false)
      setWsUploadedFile(null); setWsPendingFile(null); setWsFileIsDirectType(false)
    } catch(e) {
      setIntelError(friendlyApiError(e))
    }
    setIntelLoading(false); setWsRetryStatus('')
  }

  const handleWsProcess = () => {
    if (wsFileIsDirectType && wsPendingFile) {
      setWsDateModalIsFile(true)
      setWsShowDate(true)
    } else {
      processIntel()
    }
  }

  const openIntel = () => {
    const detected = detectDate(intelText)
    setIntelDate(detected || new Date().toISOString().split('T')[0])
    setIntelError(''); setIntelStatus('')
    setShowIntel(true)
  }

  const processIntel = async (dateOverride) => {
    if (!effectiveKey) { setIntelError('Add your Anthropic API key in Settings first.'); return }
    if (!intelText.trim()) { setIntelError('Please paste some text first.'); return }
    if (isLocked('processIntel')) { setIntelError('Already processing — please wait.'); return }
    const date = dateOverride || intelDate || new Date().toISOString().split('T')[0]

    // Cache check: if same transcript was already processed, reuse result
    const _textHash = hashStr(intelText.trim())
    const _cacheKey = `wsExtract_${_textHash}`
    const _cached = getAICache(data, _cacheKey)
    if (_cached) {
      console.log('[WS] Cache hit — reusing previous extraction for this transcript')
      const allAccounts = _cached.accounts || []
      const sel = new Set()
      allAccounts.forEach((a,i) => {
        const inCRM = (data.accounts||[]).some(ac=>(ac.name||'').toLowerCase().slice(0,8)===(a.name||'').toLowerCase().slice(0,8))
        if (!inCRM && !isBlockedAccount(a.name)) sel.add(i)
      })
      setPendingIntel({accounts:allAccounts, date})
      setSelectedIntel(sel)
      setShowIntel(false)
      setIntelStatus('Using saved extraction result')
      setTimeout(()=>setIntelStatus(''),3000)
      return
    }

    setIntelLoading(true); setIntelError(''); setIntelStatus('')

    const isSpreadsheet = intelText.trimStart().startsWith('[SPREADSHEET_IMPORT:')

    const SYS = isSpreadsheet
      ? 'You are mapping structured spreadsheet rows into whitespace sales accounts. Return ONLY valid JSON with no markdown or explanation. Start with { and end with }.'
      : 'You are an account intelligence analyst. Extract prospect company names and notes from vendor calls and sales intel documents. Return ONLY valid JSON. Start with { and end with }. No markdown, no code blocks, no text before or after the JSON.'

    const buildPrompt = isSpreadsheet
      ? txt => `These are structured rows from a whitespace account spreadsheet. Map EVERY row into a whitespace account.\n\nReturn ONLY this JSON:\n{"accounts":[{"name":"Account Name","hq":"state or city/state or empty","industry":"industry or empty","employees":"company size or headcount as string or empty","revenue":"revenue or empty","note":"brief note using customerType/accountOwner/other fields","status":"Prospect"}]}\n\nRules:\n- accountName = company name — INCLUDE EVERY ROW that has an accountName, do not skip any\n- location, stateProvince, state, or province = use as hq field\n- companySize, employees, headcount = use as employees field\n- customerType: if "Customer" set status to "Researching", otherwise "Prospect"\n- accountOwner + customerType = include in note field\n- Revenue and industry may be empty — leave as empty string, do not skip the row\n- Return ALL rows as accounts — do not filter or omit any\n- CRITICAL: Return valid JSON only, nothing else\n\nSpreadsheet rows:\n${txt}`
      : txt => `Extract all prospect/whitespace accounts from this input. Return ONLY this JSON structure with no other text:\n{"accounts":[{"name":"Company Name","hq":"city, state or empty string","industry":"industry or empty string","employees":"headcount as string like '5,000' or '5k' or empty string","revenue":"annual revenue as string like '$500M' or '500 million' or empty string","note":"2-3 sentence intel summary","status":"Prospect|Researching|Reached Out|Active Conversation"}]}\n\nRules:\n- Include every company mentioned as a prospect or target\n- Keep notes SHORT — 2-3 sentences max per account\n- Extract the following fields if mentioned anywhere in the input — revenue (annual revenue as a string like '$500M' or '500 million'), employees (headcount as a string like '5,000' or '5k'), hq (city and state), industry (the company's industry). These may appear anywhere in the text — in passing mentions, context, or background information. If revenue is mentioned as a range use the midpoint.\n- Do not include GuidePoint, the vendor you are speaking with, or the user themselves as accounts\n- Return empty accounts array [] if no prospects found\n- CRITICAL: Return valid JSON only, nothing else\n\nInput:\n${txt}`

    const runChunk = async (txt, idx, total) => {
      if (total > 1) setIntelStatus(`Processing chunk ${idx+1} of ${total}…`)
      const {data: resp} = await callClaudeWithRetry({
        model: AI_MODELS.cheap, max_tokens: isSpreadsheet ? 8000 : 2000,
        system:SYS,
        messages:[{role:'user',content:buildPrompt(txt)}]
      }, effectiveKey, null)
      if (resp.error) throw new Error(resp.error.message||'API error')
      const raw = resp.content?.[0]?.text||''
      let parsed = extractJSON(raw)
      if (!parsed) {
        try {
          const {data: fix} = await callClaudeWithRetry({
            model: AI_MODELS.cheap, max_tokens: 1000,
            messages:[{role:'user',content:`This JSON is malformed. Fix it and return ONLY valid JSON, nothing else:\n${raw}`}]
          }, effectiveKey, null)
          parsed = extractJSON(fix.content?.[0]?.text||'')
        } catch {}
      }
      return parsed?.accounts || []
    }

    try {
      // Spreadsheets get larger chunks per call; text uses paragraph-based 6k chunks
      const CHUNK = isSpreadsheet ? 24000 : 6000
      let allAccounts = []

      if (intelText.length <= CHUNK) {
        allAccounts = await runChunk(intelText, 0, 1)
      } else {
        const chunks = []
        if (isSpreadsheet) {
          // Chunk by rows (one JSON object per line) keeping the header marker on each chunk
          const lines = intelText.split('\n')
          const headerLine = lines[0]
          const dataLines = lines.slice(1)
          let cur = headerLine + '\n'
          for (const line of dataLines) {
            if ((cur + line + '\n').length > CHUNK) { if (cur.trim() !== headerLine.trim()) chunks.push(cur.trim()); cur = headerLine + '\n' + line + '\n' }
            else { cur += line + '\n' }
          }
          if (cur.trim() && cur.trim() !== headerLine.trim()) chunks.push(cur.trim())
        } else {
          // Original paragraph-based chunking for pasted text
          let cur = ''
          for (const para of intelText.split(/\n\n+/)) {
            if (cur && (cur + '\n\n' + para).length > CHUNK) { chunks.push(cur.trim()); cur = para }
            else { cur = cur ? cur + '\n\n' + para : para }
          }
          if (cur.trim()) chunks.push(cur.trim())
        }
        for (let i = 0; i < chunks.length; i++) {
          const chunk_accounts = await runChunk(chunks[i], i, chunks.length)
          allAccounts.push(...chunk_accounts)
        }
        // Fuzzy dedup within batch — merge notes for similar names
        const deduped = []
        allAccounts.forEach(a => {
          const existIdx = deduped.findIndex(b=>fuzzyMatchAccount(a.name,b.name))
          if (existIdx>=0) { if(a.note&&a.note.trim()) deduped[existIdx]={...deduped[existIdx],note:[deduped[existIdx].note,a.note].filter(Boolean).join(' | ')} }
          else deduped.push(a)
        })
        allAccounts = deduped
      }

      // Spreadsheet fallback: if AI returned nothing, parse rows directly without AI
      if (allAccounts.length === 0 && isSpreadsheet && wsSpreadsheetRows?.length > 0) {
        console.log('[WS] Spreadsheet AI returned 0 — falling back to direct row import')
        allAccounts = wsSpreadsheetRows
          .filter(r => r.accountName)
          .map(r => ({
            name: r.accountName,
            hq: r.location || r.hq || '',
            industry: r.industry || '',
            employees: r.companySize || r.employees || '',
            revenue: r.revenue || '',
            note: [r.customerType && `Type: ${r.customerType}`, r.accountOwner && `Owner: ${r.accountOwner}`, r.notes && r.notes, 'Imported from spreadsheet.'].filter(Boolean).join(' '),
            status: 'Prospect',
          }))
      }

      setIntelStatus('')
      if (allAccounts.length === 0) {
        setIntelError(isSpreadsheet
          ? 'No account names found in the spreadsheet. Make sure there is a column named "Account Name", "Company", or "Name".'
          : 'No prospect companies found in the text.')
        setIntelLoading(false); return
      }
      const sel = new Set()
      allAccounts.forEach((a,i) => {
        const inCRM = (data.accounts||[]).some(ac=>(ac.name||'').toLowerCase().slice(0,8)===(a.name||'').toLowerCase().slice(0,8))
        const blocked = isBlockedAccount(a.name)
        if (!inCRM && !blocked) sel.add(i)
      })
      // Cache successful extraction result by transcript hash (7-day TTL)
      setAICache(setData, _cacheKey, { accounts: allAccounts }, 7 * 24 * 3600 * 1000)
      setPendingIntel({accounts:allAccounts, date})
      setSelectedIntel(sel)
      setShowIntel(false)
    } catch(e) {
      setIntelStatus('')
      setIntelError(friendlyApiError(e))
    }
    setIntelLoading(false)
  }

  const saveIntel = () => {
    if (!pendingIntel) return
    const {accounts, date} = pendingIntel
    const now = new Date().toISOString()
    setData(prev=>{
      let wsList = [...(prev.whitespaceAccounts||[])]
      accounts.forEach((a,i)=>{
        if (!selectedIntel.has(i)) return
        const finalName = (pendingNames[i]||'').trim() || a.name
        const noteEntry = {id:uid(), text:a.note, date, addedBy:'ai'}
        const existIdx = wsList.findIndex(w=>fuzzyMatchAccount(finalName, w.name))
        if (existIdx>=0) {
          const ex = {...wsList[existIdx]}
          if (!ex.hq && a.hq) ex.hq = a.hq
          if (!ex.industry && a.industry) ex.industry = a.industry
          if (!ex.employees && a.employees) ex.employees = a.employees
          if (!ex.revenue && a.revenue) ex.revenue = a.revenue
          ex.intelLog = [noteEntry, ...(ex.intelLog||[])]
          ex.updatedAt = now
          wsList[existIdx] = ex
        } else {
          wsList.push({id:uid(),name:finalName,hq:a.hq||'',industry:a.industry||'',employees:a.employees||'',revenue:a.revenue||'',status:a.status||'Prospect',contacts:[],technologies:[],notes:[],intelLog:[noteEntry],addedAt:now,updatedAt:now})
        }
      })
      return {...prev, whitespaceAccounts:wsList}
    })
    setPendingIntel(null); setSelectedIntel(new Set()); setIntelText(''); setIntelDate(''); setPendingNames({}); setEditingNameIdx(null); setEditingNameDraft('')
  }

  const closeIntelModal = () => { setPendingIntel(null); setPendingNames({}); setEditingNameIdx(null); setEditingNameDraft('') }

  // ── Prospect Brief HTML export ────────────────────────────────────────────────
  const generateBriefHTML = (wsAcct) => {
    const brief = wsAcct.prospect_brief || null
    const today = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})
    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const confC = c => c==='high'?'#D1FAE5;color:#065F46':c==='medium'?'#FEF3C7;color:#92400E':'#F1F5F9;color:#64748B'
    const urgC = u => u==='high'?'#dc2626':u==='medium'?'#f59e0b':'#3b82f6'
    const firm = [
      wsAcct.hq&&`<div class="fi"><div class="fl">HQ</div><div class="fv">${esc(wsAcct.hq)}</div></div>`,
      wsAcct.industry&&`<div class="fi"><div class="fl">Industry</div><div class="fv">${esc(wsAcct.industry)}</div></div>`,
      wsAcct.employees&&`<div class="fi"><div class="fl">Employees</div><div class="fv">${esc(wsAcct.employees)}</div></div>`,
      wsAcct.revenue&&`<div class="fi"><div class="fl">Revenue</div><div class="fv">${esc(wsAcct.revenue)}</div></div>`,
      wsAcct.website&&`<div class="fi"><div class="fl">Website</div><div class="fv"><a href="https://${esc(wsAcct.website)}">${esc(wsAcct.website)}</a></div></div>`,
    ].filter(Boolean).join('')
    const contacts = brief ? (brief.security_contacts||[]).filter(c=>c.name&&c.name!=='null').map(c=>`
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:10px 12px;margin-bottom:8px">
        <span style="font-weight:600;font-size:14px">${esc(c.name)}</span>
        <span style="display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;background:${confC(c.confidence)}" title="${esc(c.confidence_reason||'')}">${esc(c.confidence||'low').charAt(0).toUpperCase()+esc(c.confidence||'low').slice(1)}</span>
        ${c.title?`<div style="color:#6B7280;font-size:12px;margin-top:2px">${esc(c.title)}</div>`:''}
        ${c.linkedin_url?`<div style="margin-top:4px"><a href="${esc(c.linkedin_url)}" style="color:#007AFF;font-size:11px;font-weight:600">LinkedIn ↗</a></div>`:''}
      </div>`).join('') : ''
    const news = brief ? (brief.recent_news||[]).map(n=>`
      <div style="margin-bottom:12px;border-bottom:1px solid #F3F4F6;padding-bottom:12px">
        <div style="font-weight:500;font-size:13px">${esc(n.headline)}</div>
        <div style="color:#9CA3AF;font-size:11px;margin-top:2px">${esc(n.date)}</div>
        <div style="color:#6B7280;font-size:12px;font-style:italic;margin-top:4px">${esc(n.relevance)}</div>
      </div>`).join('') : ''
    const jobs = brief ? (brief.active_job_postings||[]).map(j=>`
      <div style="background:#F9FAFB;border-radius:6px;padding:10px 12px;margin-bottom:8px">
        <div style="font-weight:500;font-size:13px">${esc(j.title)} <span style="color:#9CA3AF;font-size:11px">${esc(j.posted_date||'')}</span>${j.source_url?` <a href="${esc(j.source_url)}" style="color:#007AFF;font-size:11px">↗</a>`:''}</div>
        <div style="color:#007AFF;font-size:12px;margin-top:3px">${esc(j.guidepoint_signal)}</div>
      </div>`).join('') : ''
    const svcs = brief ? (brief.guidepoint_service_matches||[]).map(m=>`
      <div style="margin-bottom:8px">
        <span style="display:inline-flex;align-items:center;gap:6px;background:#F3F4F6;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600">
          <span style="width:7px;height:7px;border-radius:50%;background:${urgC(m.urgency)};display:inline-block"></span>${esc(m.service_area)}
        </span>
        <div style="font-size:12px;color:#6B7280;padding-left:4px;margin-top:2px">${esc(m.signal)}</div>
      </div>`).join('') : ''
    const outreach = brief?.suggested_outreach ? `
      <div style="border-left:3px solid #007AFF;border:1px solid #DBEAFE;border-left:3px solid #007AFF;border-radius:0 8px 8px 0;padding:16px 20px">
        ${brief.suggested_outreach.primary_contact?`<div style="font-size:11px;color:#9CA3AF;font-weight:600;text-transform:uppercase;margin-bottom:3px">Primary Contact</div><div style="font-size:13px;font-weight:600;margin-bottom:10px">${esc(brief.suggested_outreach.primary_contact)}</div>`:''}
        ${brief.suggested_outreach.opening_angle?`<div style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:12px">${esc(brief.suggested_outreach.opening_angle)}</div>`:''}
        ${brief.suggested_outreach.first_line?`<div style="background:#F9FAFB;border-radius:6px;padding:10px 12px;font-size:13px;font-style:italic">${esc(brief.suggested_outreach.first_line)}</div>`:''}
      </div>` : ''
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Prospect Brief – ${esc(wsAcct.name)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:860px;margin:0 auto;padding:40px 24px;color:#111827}h1{font-size:24px;margin:0 0 4px}a{color:#007AFF}.meta{color:#6B7280;font-size:13px;margin-bottom:28px}h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9CA3AF;margin:24px 0 10px}.firm{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin-bottom:24px}.fi{}.fl{font-size:11px;color:#9CA3AF;font-weight:600;text-transform:uppercase}.fv{font-size:13px;font-weight:500;margin-top:2px}.alert{background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;gap:8px;align-items:flex-start}@media print{body{padding:20px}}</style>
</head><body>
<h1>${esc(wsAcct.name)}</h1>
<div class="meta">Prospect Intelligence Brief · Generated ${today}</div>
${firm?`<div class="firm">${firm}</div>`:''}
${brief?.timing_signal?.is_time_sensitive?`<div class="alert"><span>⚡</span><div><strong>Time Sensitive:</strong> ${esc(brief.timing_signal.reason||'')}</div></div>`:''}
${contacts?`<h2>Security Contacts</h2>${contacts}`:''}
${news?`<h2>Recent News</h2>${news}`:''}
${jobs?`<h2>Active Job Postings</h2>${jobs}`:''}
${svcs?`<h2>GuidePoint Service Matches</h2><div style="margin-bottom:16px">${svcs}</div>`:''}
${outreach?`<h2>Suggested Outreach</h2>${outreach}`:''}
${!brief?'<p style="color:#9CA3AF;font-style:italic">No Prospect Brief generated yet.</p>':''}
<div style="margin-top:40px;padding-top:16px;border-top:1px solid #E5E7EB;font-size:11px;color:#9CA3AF">Generated by Ledgr · ${new Date().toISOString()}</div>
</body></html>`
  }

  const exportBrief = (wsAcct) => {
    const html = generateBriefHTML(wsAcct)
    const today = new Date().toISOString().split('T')[0]
    const fname = `Prospect Brief - ${wsAcct.name} - ${today}.html`
    const blob = new Blob([html],{type:'text/html'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=fname; a.click()
    URL.revokeObjectURL(url)
  }

  const initiatePromote = (wsAcct) => {
    const existing = (data.accounts||[]).find(a => a.name.toLowerCase().trim() === (wsAcct.name||'').toLowerCase().trim())
    if (existing) { setPromoteDuplicate(existing); setPromoteTarget(wsAcct); setShowPromoteModal(true) }
    else { doPromote(wsAcct, null) }
  }

  const doPromote = (wsAcct, existingAcct) => {
    const now = new Date().toISOString()
    const today = now.split('T')[0]
    const html = wsAcct.prospect_brief ? generateBriefHTML(wsAcct) : null
    const briefFile = html ? {
      id: uid(), name:`Prospect Brief - ${wsAcct.name} - ${today}.html`,
      type:'text/html', size:html.length, uploadedAt:now,
      category:'Prospect Brief', notes:'Generated from Whitespace Tracker',
      path:'', isInline:true, content:html
    } : null
    if (existingAcct) {
      const merged = {...existingAcct}
      if (!merged.hq && wsAcct.hq) merged.hq = wsAcct.hq
      if (!merged.industry && wsAcct.industry) merged.industry = wsAcct.industry
      if (!merged.employees && wsAcct.employees) merged.employees = wsAcct.employees
      if (!merged.revenue && wsAcct.revenue) merged.revenue = wsAcct.revenue
      if (!merged.website && wsAcct.website) merged.website = wsAcct.website
      if (!merged.prospect_brief && wsAcct.prospect_brief) merged.prospect_brief = wsAcct.prospect_brief
      if (!merged.prospect_brief_generated_at && wsAcct.prospect_brief_generated_at) merged.prospect_brief_generated_at = wsAcct.prospect_brief_generated_at
      const existingIntelIds = new Set((merged.intelLog||[]).map(e=>e.id))
      const newIntel = (wsAcct.intelLog||[]).filter(e=>!existingIntelIds.has(e.id))
      if (newIntel.length) merged.intelLog = [...(merged.intelLog||[]),...newIntel]
      if (briefFile && !(merged.files||[]).some(f=>f.category==='Prospect Brief')) merged.files = [...(merged.files||[]),briefFile]
      setData(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===existingAcct.id?merged:a)}))
      setWsToast(`${wsAcct.name} merged into existing account.`)
    } else {
      const newContacts = (wsAcct.contacts||[]).map(c=>({
        id:uid(), name:c.name, title:c.title||'', email:'', cell:'',
        linkedin:c.linkedin||'', notes:c.notes||'', addedManually:false, addedFrom:'whitespace'
      }))
      const allNoteText = (wsAcct.notes||[]).map(n=>n.text).filter(Boolean).join('\n')
      const newAcct = {
        id:uid(), name:wsAcct.name, short:(wsAcct.name||'').slice(0,6).toUpperCase(),
        industry:wsAcct.industry||'', hq:wsAcct.hq||'', employees:wsAcct.employees||'',
        revenue:wsAcct.revenue||'', website:wsAcct.website||'', status:'Prospect', health:50,
        lastContact:'', notes:allNoteText, endpoints:'', cloud:'', users:'', relationship:'',
        contacts:newContacts, followUps:[], projects:[], techStack:[], interactions:[],
        intelLog:wsAcct.intelLog||[], files:briefFile?[briefFile]:[], savedLinks:[],
        adminData:{}, upcomingDates:[], unknownMentions:[], relSuggestions:[],
        contactSuggestions:[], dismissedAlerts:[], snoozedAlerts:[],
        healthScoreOverrides:{}, healthScoreHistory:[], aiHistory:[], logoImage:'',
        orgChart:{nodes:[]}, createdAt:now, createdFromWhitespace:true,
        prospect_brief:wsAcct.prospect_brief||null,
        prospect_brief_generated_at:wsAcct.prospect_brief_generated_at||null,
        is_time_sensitive:wsAcct.is_time_sensitive||false,
        ai_opportunity_score:wsAcct.ai_opportunity_score||null,
        ai_score_reasoning:wsAcct.ai_score_reasoning||null,
      }
      setData(prev=>({...prev,accounts:[...prev.accounts,newAcct]}))
      setWsToast(`${wsAcct.name} added to Accounts.`)
    }
    setTimeout(()=>setWsToast(''),5000)
    setShowPromoteModal(false); setPromoteTarget(null); setPromoteDuplicate(null)
    setSelectedForExport(new Set())
  }

  const SM = S.sideMuted; const ST = S.sideTxt; const SB = S.sideBdr

  return (
    <div style={{display:'flex',flexDirection:mob?'column':'row',height:mob?'auto':'100vh',minHeight:mob?'100vh':undefined,overflow:mob?'visible':'hidden',background:isLight?'#f1f5f9':S.bg}}>
      {/* SIDEBAR — desktop only */}
      {!mob&&<div style={{width:240,flexShrink:0,background:'#FFFFFF',display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',borderRight:'1px solid #EEEFF2'}}>
        <div style={{padding:'12px 16px 12px',flexShrink:0,borderBottom:'1px solid #EEEFF2'}}>
          <div style={{display:'flex',justifyContent:'center',alignItems:'center'}}>
            <img src="/Ledgr-full-logo.png" alt="Ledgr." style={{height:'72px',width:'auto',maxWidth:'187px',objectFit:'contain',display:'block'}}/>
          </div>
        </div>
        <div style={{padding:'12px 12px 4px',flexShrink:0}}>
          <button onClick={onBack}
            style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'8px 12px',background:'transparent',border:'1px solid #EEEFF2',borderRadius:8,color:SM,fontSize:12,cursor:'pointer',transition:'all 0.15s'}}
            onMouseEnter={e=>{e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.color=ST}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=SM}}>
            ← Back to Accounts
          </button>
        </div>
        <div style={{padding:'8px 12px 4px',flexShrink:0}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search...'
            style={{width:'100%',fontSize:11,padding:'7px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:ST,boxSizing:'border-box',outline:'none'}}/>
        </div>
        <div style={{padding:'4px 12px 8px',flexShrink:0}}>
          <select value={sort} onChange={e=>setSort(e.target.value)}
            style={{width:'100%',fontSize:11,padding:'6px 8px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:ST,boxSizing:'border-box'}}>
            {SORT_OPTS.map(o=><option key={o}>{o}</option>)}
          </select>
        </div>
        <div style={{padding:'4px 12px 8px',flexShrink:0}}>
          <div style={{fontSize:9,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:5}}>Status Filter</div>
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {STATUS_OPTS.map(s=>(
              <button key={s} onClick={()=>setStatusFilter(s)}
                style={{textAlign:'left',padding:'5px 8px',borderRadius:6,border:'none',background:statusFilter===s?'#EBF4FF':'transparent',color:statusFilter===s?'#007AFF':SM,fontSize:11,cursor:'pointer',fontWeight:statusFilter===s?700:400}}
                onMouseEnter={e=>{if(statusFilter!==s)e.currentTarget.style.background='#F9FAFB'}}
                onMouseLeave={e=>{if(statusFilter!==s)e.currentTarget.style.background='transparent'}}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{padding:'2px 12px 6px',flexShrink:0}}>
          <div style={{fontSize:10,color:'#9CA3AF'}}>{sorted.length} account{sorted.length!==1?'s':''}</div>
        </div>
        <div style={{marginTop:'auto',padding:'12px',flexShrink:0}}>
          <div style={{height:1,background:SB,marginBottom:12}}/>
          <button onClick={()=>setShowAdd(true)}
            style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',padding:'9px 12px',background:'#007AFF',border:'none',borderRadius:8,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            + Add Account
          </button>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}>
            <span style={{fontSize:10,color:'#9CA3AF'}}>Theme</span>
            <div style={{display:'flex',gap:1,background:'#F3F4F6',borderRadius:6,padding:2}}>
              <button onClick={()=>setTheme('light')} style={{padding:'3px 8px',borderRadius:4,border:'none',background:theme==='light'?'#FFFFFF':'transparent',color:theme==='light'?'#007AFF':SM,fontSize:12,cursor:'pointer',lineHeight:1.4}}>☀</button>
              <button onClick={()=>setTheme('dark')} style={{padding:'3px 8px',borderRadius:4,border:'none',background:theme==='dark'?'#FFFFFF':'transparent',color:theme==='dark'?'#007AFF':SM,fontSize:12,cursor:'pointer',lineHeight:1.4}}>☾</button>
            </div>
          </div>
        </div>
      </div>}

      {/* ── Mobile filter drawer ── */}
      {mob&&mobFilterOpen&&<>
        <div onClick={()=>setMobFilterOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:300}}/>
        <div style={{position:'fixed',left:0,top:0,height:'100vh',width:280,zIndex:310,background:'#FFFFFF',boxShadow:'4px 0 24px rgba(0,0,0,0.12)',display:'flex',flexDirection:'column',overflowY:'auto'}}>
          <div style={{padding:'18px 16px 14px',borderBottom:'1px solid #EEEFF2',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <span style={{fontSize:15,fontWeight:700,color:'#111827'}}>Filters</span>
            <button onClick={()=>setMobFilterOpen(false)} style={{background:'transparent',border:'none',color:'#9CA3AF',cursor:'pointer',fontSize:24,lineHeight:1,padding:'0 4px'}}>×</button>
          </div>
          <div style={{padding:'14px 16px',flex:1}}>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Search</div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search accounts…'
                style={{width:'100%',fontSize:13,padding:'8px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:'#111827',boxSizing:'border-box',outline:'none'}}/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Sort By</div>
              <select value={sort} onChange={e=>setSort(e.target.value)}
                style={{width:'100%',fontSize:13,padding:'8px 10px',background:'#F9FAFB',border:'1px solid #EEEFF2',borderRadius:8,color:'#111827',boxSizing:'border-box'}}>
                {SORT_OPTS.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Status</div>
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {STATUS_OPTS.map(s=>(
                  <button key={s} onClick={()=>setStatusFilter(s)}
                    style={{textAlign:'left',padding:'9px 10px',borderRadius:7,border:'none',background:statusFilter===s?'#EBF4FF':'transparent',color:statusFilter===s?'#007AFF':'#374151',fontSize:13,cursor:'pointer',fontWeight:statusFilter===s?700:400}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Segment</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {(['All','SMB','Mid-Enterprise','Enterprise']).map(seg=>{
                  const cnt = seg==='All' ? ws.length : segmentCounts[seg]
                  const active = segmentFilter===seg
                  return (
                    <button key={seg} onClick={()=>setSegmentFilter(seg)}
                      style={{padding:'6px 12px',borderRadius:20,border:active?'none':'1px solid #E5E7EB',background:active?'#2563eb':'transparent',color:active?'#fff':'#374151',fontSize:12,fontWeight:active?700:400,cursor:'pointer',flexShrink:0}}>
                      {seg} ({cnt})
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{fontSize:11,color:'#9CA3AF',marginTop:4}}>{sorted.length} account{sorted.length!==1?'s':''}</div>
          </div>
          <div style={{padding:'12px 16px',borderTop:'1px solid #EEEFF2',flexShrink:0}}>
            <button onClick={()=>setShowAdd(true)}
              style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',padding:'11px 12px',background:'#007AFF',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>
              + Add Account
            </button>
          </div>
        </div>
      </>}

      {/* MAIN */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:mob?'visible':'hidden',minWidth:0}}>
        <div style={{padding:mob?'12px 14px':'16px 24px 14px',background:isLight?'#ffffff':S.headerBg,borderBottom:`1px solid ${isLight?'#e2e8f0':S.bdr}`,flexShrink:0,boxShadow:isLight?'0 1px 3px rgba(0,0,0,0.06)':'none',position:mob?'sticky':'relative',top:0,zIndex:mob?100:'auto'}}>
          {/* ── Mobile top bar ── */}
          {mob?(
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <button onClick={onBack} style={{display:'inline-flex',alignItems:'center',gap:4,background:'transparent',border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:7,color:'#2563eb',cursor:'pointer',fontSize:12,fontWeight:600,padding:'6px 10px',flexShrink:0,whiteSpace:'nowrap'}}>
                <ArrowLeft size={12}/>Back
              </button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:16,fontWeight:800,color:isLight?'#0f172a':S.txt,whiteSpace:'nowrap'}}>Whitespace</span>
                  <span style={{fontSize:11,fontWeight:700,color:'#2563eb',background:'#dbeafe',borderRadius:999,padding:'2px 7px',flexShrink:0}}>{ws.length}</span>
                </div>
              </div>
              <button onClick={()=>setMobFilterOpen(true)}
                style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 12px',background:isLight?'#f1f5f9':'rgba(255,255,255,0.08)',border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:7,color:S.txt,fontSize:12,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                ⚙ Filters{(search||statusFilter!=='All'||segmentFilter!=='All')?<span style={{width:6,height:6,borderRadius:'50%',background:'#2563eb',display:'inline-block',flexShrink:0}}/>:null}
              </button>
              <button onClick={()=>{setIntelText('');setIntelDate('');setIntelError('');setIntelStatus('');resetWsFileState();setShowIntel(true)}}
                style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:34,height:34,background:'linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%)',border:'none',borderRadius:7,color:'#fff',cursor:'pointer',flexShrink:0}}
                title="Add Intelligence"><Zap size={14}/></button>
              <div ref={moreMenuRef} style={{position:'relative',flexShrink:0}}>
                <button onClick={()=>setShowMoreMenu(v=>!v)}
                  style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:34,height:34,background:isLight?'#f8fafc':S.surf2,border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:7,color:S.muted,fontSize:18,fontWeight:700,cursor:'pointer',lineHeight:1}}
                  title="More actions">⋯</button>
                {showMoreMenu&&(
                  <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.15)',overflow:'hidden',minWidth:210,zIndex:200}}>
                    {[
                      {label:'+ Add Account', action:()=>{setShowAdd(true);setShowMoreMenu(false)}},
                      {label:selectedWsAcct?`Add to Accounts: ${selectedWsAcct.name.slice(0,20)}`:'Add to Accounts (select 1)',dim:!selectedWsAcct, action:()=>{if(!selectedWsAcct)return;setShowMoreMenu(false);initiatePromote(selectedWsAcct)}},
                      {label:selectedWsAcct?.prospect_brief?'Export Prospect Brief':'Export Brief (generate first)',dim:!selectedWsAcct?.prospect_brief, action:()=>{if(!selectedWsAcct?.prospect_brief)return;setShowMoreMenu(false);exportBrief(selectedWsAcct)}},
                      {label:'Score All Accounts', action:()=>{setShowMoreMenu(false);scoreAllAccounts()}},
                      {label:'Merge Accounts', action:()=>{setShowMerge(true);setMergeStep(1);setMergeSelected(new Set());setMergePrimary(null);setMergeSearch('');setShowMoreMenu(false)}},
                      {label:'Auto-fill Missing Data', action:()=>{const missing=ws.filter(a=>!a.employees||!a.revenue);if(missing.length===0){alert('All accounts already have employee and revenue data!');setShowMoreMenu(false);return}setAiOpSummary('');setShowAutoFillModal(true);setShowMoreMenu(false)}},
                      {label:'Clean Duplicate Notes', action:()=>{const accts=ws.filter(a=>((a.intelLog||[]).length+(a.notes||[]).length)>2);if(accts.length===0){alert('No accounts with more than 2 notes entries found.');setShowMoreMenu(false);return}setAiOpSummary('');setShowCleanNotesModal(true);setShowMoreMenu(false)}},
                      {label:'Export Summary CSV', action:()=>{exportSummaryCSV();setShowMoreMenu(false)}},
                      {label:'Export Selected Full Details', action:()=>{exportSelectedFullDetailsCSV();setShowMoreMenu(false)}},
                    ].map((item,i,arr)=>(
                      <button key={item.label} onClick={item.action} disabled={item.dim}
                        style={{display:'block',width:'100%',padding:'12px 16px',background:'transparent',border:'none',borderBottom:i<arr.length-1?`1px solid ${S.bdr}`:'none',color:item.dim?S.muted:S.txt,fontSize:13,cursor:item.dim?'default':'pointer',textAlign:'left',opacity:item.dim?0.5:1}}
                        onMouseEnter={e=>{if(!item.dim)e.currentTarget.style.background=S.surf2}}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ):(
            /* ── Desktop top bar (unchanged) ── */
            <>
              <button onClick={onBack} style={{display:'inline-flex',alignItems:'center',gap:6,background:'transparent',border:'none',color:'#2563eb',cursor:'pointer',fontSize:12,fontWeight:600,padding:'0 0 10px',lineHeight:1}}>
                <ArrowLeft size={13}/>Back to Accounts
              </button>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                    <div style={{fontSize:22,fontWeight:900,color:isLight?'#0f172a':S.txt,letterSpacing:'-0.02em'}}>Whitespace</div>
                    <span style={{fontSize:11,fontWeight:700,color:'#2563eb',background:'#dbeafe',borderRadius:999,padding:'2px 9px'}}>{ws.length}</span>
                  </div>
                  <div style={{fontSize:12,color:'#64748b'}}>Prospect accounts you're tracking for future opportunities</div>
                </div>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search accounts…'
                  style={{width:200,fontSize:12,padding:'7px 10px',background:isLight?'#f8fafc':S.surf2,border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:7,color:S.txt,outline:'none',flexShrink:0}}/>
                <button onClick={()=>{setIntelText('');setIntelDate('');setIntelError('');setIntelStatus('');resetWsFileState();setShowIntel(true)}}
                  style={{display:'inline-flex',alignItems:'center',gap:6,padding:'9px 16px',background:'linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%)',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',boxShadow:'0 2px 8px rgba(37,99,235,0.3)',flexShrink:0}}>
                  <Zap size={14}/>Add Intelligence
                </button>
                <button onClick={scoreAllAccounts} disabled={scoringAll||!effectiveKey}
                  title={!effectiveKey?'Add your Anthropic API key in Settings first':'Score all unscored accounts with AI opportunity scores'}
                  style={{display:'inline-flex',alignItems:'center',gap:6,padding:'9px 14px',background:scoringAll?'#f59e0b':'linear-gradient(135deg,#d97706 0%,#f59e0b 100%)',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:scoringAll||!effectiveKey?'default':'pointer',boxShadow:'0 2px 8px rgba(245,158,11,0.3)',flexShrink:0,opacity:!effectiveKey?0.5:1}}>
                  <span style={{fontSize:14}}>🔥</span>{scoringAll?'Scoring…':'Score All'}
                </button>
                <div ref={moreMenuRef} style={{position:'relative',flexShrink:0}}>
                  <button onClick={()=>setShowMoreMenu(v=>!v)}
                    style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:36,height:36,background:isLight?'#f8fafc':S.surf2,border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:8,color:S.muted,fontSize:18,fontWeight:700,cursor:'pointer',lineHeight:1}}
                    title="More actions">⋯</button>
                  {showMoreMenu&&(
                    <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.15)',overflow:'hidden',minWidth:210,zIndex:100}}>
                      {[
                        {label:'+ Add Account', action:()=>{setShowAdd(true);setShowMoreMenu(false)}},
                        {label:selectedWsAcct?`Add to Accounts: ${selectedWsAcct.name.slice(0,22)}`:'Add to Accounts (select 1)',dim:!selectedWsAcct, action:()=>{if(!selectedWsAcct)return;setShowMoreMenu(false);initiatePromote(selectedWsAcct)}},
                        {label:selectedWsAcct?.prospect_brief?'Export Prospect Brief':'Export Brief (generate first)',dim:!selectedWsAcct?.prospect_brief, action:()=>{if(!selectedWsAcct?.prospect_brief)return;setShowMoreMenu(false);exportBrief(selectedWsAcct)}},
                        {label:'Merge Accounts', action:()=>{setShowMerge(true);setMergeStep(1);setMergeSelected(new Set());setMergePrimary(null);setMergeSearch('');setShowMoreMenu(false)}},
                        {label:'Auto-fill Missing Data', action:()=>{const missing=ws.filter(a=>!a.employees||!a.revenue);if(missing.length===0){alert('All accounts already have employee and revenue data!');setShowMoreMenu(false);return}setAiOpSummary('');setShowAutoFillModal(true);setShowMoreMenu(false)}},
                        {label:'Clean Duplicate Notes', action:()=>{const accts=ws.filter(a=>((a.intelLog||[]).length+(a.notes||[]).length)>2);if(accts.length===0){alert('No accounts with more than 2 notes entries found.');setShowMoreMenu(false);return}setAiOpSummary('');setShowCleanNotesModal(true);setShowMoreMenu(false)}},
                        {label:'Score All Accounts', action:()=>{setShowMoreMenu(false);scoreAllAccounts()}},
                        {label:'Export Summary CSV', action:()=>{exportSummaryCSV();setShowMoreMenu(false)}},
                        {label:'Export Selected Full Details', action:()=>{exportSelectedFullDetailsCSV();setShowMoreMenu(false)}},
                      ].map((item,i,arr)=>(
                        <button key={item.label} onClick={item.action} disabled={item.dim}
                          style={{display:'block',width:'100%',padding:'10px 16px',background:'transparent',border:'none',borderBottom:i<arr.length-1?`1px solid ${S.bdr}`:'none',color:item.dim?S.muted:S.txt,fontSize:13,cursor:item.dim?'default':'pointer',textAlign:'left',opacity:item.dim?0.5:1}}
                          onMouseEnter={e=>{if(!item.dim)e.currentTarget.style.background=S.surf2}}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        {/* Named accounts banner */}
        <div style={{background:isLight?'#eff6ff':'rgba(37,99,235,0.08)',borderBottom:`1px solid ${isLight?'#bfdbfe':'rgba(37,99,235,0.2)'}`,flexShrink:0}}>
          <button onClick={()=>setBannerOpen(v=>!v)} style={{display:'flex',alignItems:'center',gap:6,width:'100%',padding:'7px 20px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
            <svg width="12" height="12" viewBox="0 0 12 12" style={{flexShrink:0,transform:bannerOpen?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.15s',color:'#64748b'}}><polyline points="3,2 9,6 3,10" fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{fontSize:12,color:isLight?'#1d4ed8':'#93c5fd',fontWeight:500}}>Referencing 1,829 named accounts</span>
            <span style={{fontSize:12,color:S.muted}}>·</span>
            <span style={{fontSize:12,color:S.muted}}>1,234 blocked</span>
            <span style={{fontSize:12,color:S.muted}}>·</span>
            <span style={{fontSize:12,color:'#0ebc5f'}}>595 open (Pete Ballas &amp; Carl Morris)</span>
            <span style={{fontSize:12,color:S.muted}}>·</span>
            <span style={{fontSize:12,color:S.muted}}>Unknown accounts always available</span>
          </button>
          {bannerOpen&&(
            <div style={{padding:'4px 20px 10px 38px',fontSize:12,color:S.muted,lineHeight:1.7}}>
              <div>Blocked accounts are named by another rep — you can still track them but cannot pursue them without clearing conflict.</div>
              <div>Open accounts (Pete Ballas &amp; Carl Morris) are available for pursuit — they show as available in the tracker.</div>
              <div>Any company not on the named accounts list is always fully available.</div>
            </div>
          )}
        </div>
        {mergeToast&&(
          <div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'#f0fdf4',padding:'10px 22px',borderRadius:10,fontSize:13,fontWeight:600,zIndex:2000,boxShadow:'0 4px 20px rgba(0,0,0,0.4)',display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'#4ade80'}}>✓</span>{mergeToast}
          </div>
        )}
        {scoreProgress&&(
          <div style={{position:'fixed',bottom:60,left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'#f0fdf4',padding:'10px 22px',borderRadius:10,fontSize:13,fontWeight:600,zIndex:2002,boxShadow:'0 4px 20px rgba(0,0,0,0.5)',display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap'}}>
            <span style={{fontSize:14}}>⚡</span>{scoreProgress}
          </div>
        )}
        {wsToast&&(
          <div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'#0f172a',color:'#f0fdf4',padding:'10px 22px',borderRadius:10,fontSize:13,fontWeight:600,zIndex:2001,boxShadow:'0 4px 20px rgba(0,0,0,0.5)',display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'#4ade80'}}>✓</span>{wsToast}
          </div>
        )}
        {!dupeDismissed&&dupePairs.length>0&&(
          <div style={{background:isLight?'#fffbeb':'rgba(234,179,8,0.08)',borderBottom:`1px solid ${isLight?'#fde68a':'rgba(234,179,8,0.25)'}`,padding:'8px 20px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <span style={{fontSize:13,color:'#92400e',fontWeight:600}}>⚠ {dupePairs.length} possible duplicate{dupePairs.length!==1?'s':''} found</span>
            <button onClick={()=>setShowDupeReview(true)} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Review →</button>
            <button onClick={()=>setDupeDismissed(true)} style={{fontSize:12,color:S.muted,background:'none',border:'none',cursor:'pointer',padding:0,marginLeft:'auto'}}>Dismiss</button>
          </div>
        )}
        {/* ── Segment toggle ── */}
        {ws.length>0&&(
          <div style={{padding:'10px 20px',background:isLight?'#f8fafc':S.headerBg,borderBottom:`1px solid ${isLight?'#e2e8f0':S.bdr}`,flexShrink:0,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            {(['All','SMB','Mid-Enterprise','Enterprise']).map(seg=>{
              const cnt = seg==='All' ? ws.length : segmentCounts[seg]
              const active = segmentFilter===seg
              return (
                <button key={seg} onClick={()=>setSegmentFilter(seg)}
                  style={{padding:'5px 13px',borderRadius:20,border:active?'none':`1px solid ${isLight?'#e2e8f0':S.bdr}`,background:active?'#2563eb':'transparent',color:active?'#fff':S.muted,fontSize:12,fontWeight:active?700:500,cursor:'pointer',transition:'all 0.15s',flexShrink:0,lineHeight:1.4}}>
                  {seg} <span style={{opacity:0.75}}>({cnt})</span>
                </button>
              )
            })}
            {segmentCounts.unknown>0&&segmentFilter==='All'&&(
              <span style={{fontSize:11,color:'#94a3b8',marginLeft:4}}>&middot; {segmentCounts.unknown} unknown size</span>
            )}
          </div>
        )}
        <div style={{flex:1,overflowY:'auto'}}>
          {/* AI RECOMMENDATIONS */}
          {ws.length>0&&(
            <div style={{borderBottom:`1px solid ${isLight?'#e2e8f0':S.bdr}`,flexShrink:0}}>
              <button onClick={()=>{setRecOpen(v=>!v);if(!recOpen&&!(data.whitespaceRecommendations||[]).length)fetchRecommendations()}}
                style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 20px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
                <span style={{fontSize:15}}>✦</span>
                <span style={{fontSize:13,fontWeight:700,color:'#2563eb'}}>AI Recommendations</span>
                <span style={{fontSize:12,color:S.muted}}>{(data.whitespaceRecommendations||[]).filter(r=>!(data.dismissedWhitespaceSuggestions||[]).includes(r.name)).length>0?`${(data.whitespaceRecommendations||[]).filter(r=>!(data.dismissedWhitespaceSuggestions||[]).includes(r.name)).length} accounts to prioritize`:'Click to generate'}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" style={{marginLeft:'auto',flexShrink:0,transform:recOpen?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.15s'}}><polyline points="3,2 9,6 3,10" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {recOpen&&<button onClick={e=>{e.stopPropagation();fetchRecommendations()}}
                  style={{padding:'4px 10px',background:isLight?'#eff6ff':'rgba(37,99,235,0.12)',border:`1px solid ${isLight?'#bfdbfe':'rgba(37,99,235,0.25)'}`,borderRadius:6,color:'#2563eb',fontSize:11,fontWeight:600,cursor:'pointer',flexShrink:0}}>
                  {recLoading?'Loading…':'Refresh'}
                </button>}
              {recOpen&&(data.dismissedWhitespaceSuggestions||[]).length>0&&<button onClick={e=>{e.stopPropagation();setData(prev=>({...prev,dismissedWhitespaceSuggestions:[]}))}}
                  style={{padding:'4px 10px',background:'transparent',border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,borderRadius:6,color:S.muted,fontSize:11,cursor:'pointer',flexShrink:0}}>
                  Reset dismissed
                </button>}
              </button>
              {recOpen&&(
                <div style={{padding:'0 20px 16px'}}>
                  {recError&&<div style={{fontSize:12,color:'#dc2626',marginBottom:8}}>{recError}</div>}
                  {recLoading&&!(data.whitespaceRecommendations||[]).length&&(
                    <div style={{fontSize:13,color:S.muted,padding:'12px 0'}}>Analyzing your whitespace accounts…</div>
                  )}
                  {(()=>{
                    const dismissed=data.dismissedWhitespaceSuggestions||[]
                    const visibleRecs=(data.whitespaceRecommendations||[]).filter(r=>!dismissed.includes(r.name)).sort((a,b)=>{const aS=ws.find(w=>w.name===a.name)?.ai_opportunity_score??-1;const bS=ws.find(w=>w.name===b.name)?.ai_opportunity_score??-1;if(aS>=0&&bS>=0)return bS-aS;return 0}).slice(0,3)
                    const dismissRec=(name)=>setData(prev=>({...prev,dismissedWhitespaceSuggestions:[...(prev.dismissedWhitespaceSuggestions||[]),name]}))
                    return visibleRecs.length>0?(
                      <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,1fr)',gap:12}}>
                        {visibleRecs.map((rec,i)=>{
                          const pc=rec.priority==='Hot'?'#dc2626':rec.priority==='Warm'?'#f59e0b':'#2563eb'
                          const pb=rec.priority==='Hot'?'#fef2f2':rec.priority==='Warm'?'#fffbeb':'#eff6ff'
                          return (
                            <div key={i} style={{background:isLight?'#ffffff':S.surf,borderRadius:12,border:`1px solid ${isLight?'#e2e8f0':S.bdr}`,padding:14,boxShadow:isLight?'0 1px 3px rgba(0,0,0,0.06)':'none',position:'relative'}}>
                              <button onClick={()=>dismissRec(rec.name)}
                                title="Dismiss"
                                style={{position:'absolute',top:8,right:8,background:'transparent',border:'none',cursor:'pointer',color:S.muted,fontSize:14,lineHeight:1,padding:'2px 4px',borderRadius:4}}
                                onMouseEnter={e=>e.currentTarget.style.color=isLight?'#0f172a':S.txt}
                                onMouseLeave={e=>e.currentTarget.style.color=S.muted}>×</button>
                              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:8,paddingRight:20}}>
                                <div style={{fontSize:15,fontWeight:700,color:isLight?'#0f172a':S.txt,lineHeight:1.3}}>{rec.name}</div>
                                <span style={{fontSize:10,fontWeight:700,color:pc,background:pb,borderRadius:999,padding:'2px 8px',whiteSpace:'nowrap',flexShrink:0}}>{rec.priority}</span>
                              </div>
                              <ul style={{margin:0,padding:'0 0 0 14px',listStyle:'disc'}}>
                                {(rec.reasons||[]).map((r,j)=>(
                                  <li key={j} style={{fontSize:12,color:S.muted,lineHeight:1.5,marginBottom:2}}>{r}</li>
                                ))}
                              </ul>
                              {ws.find(a=>a.name===rec.name)&&(
                                <button onClick={()=>setExpandedId(ws.find(a=>a.name===rec.name)?.id||null)}
                                  style={{marginTop:10,fontSize:11,fontWeight:600,color:'#2563eb',background:'transparent',border:'none',cursor:'pointer',padding:0}}>
                                  View Account →
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ):null
                  })()}
                  {!recLoading&&!(data.whitespaceRecommendations||[]).filter(r=>!(data.dismissedWhitespaceSuggestions||[]).includes(r.name)).length&&!recError&&(
                    <div style={{fontSize:12,color:S.muted}}>Click Refresh to generate AI recommendations.</div>
                  )}
                </div>
              )}
            </div>
          )}
          {ws.length===0?(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:16,padding:40}}>
              <svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="#94a3b8" strokeWidth="2"/><circle cx="24" cy="24" r="10" fill="none" stroke="#94a3b8" strokeWidth="1.5"/><circle cx="24" cy="24" r="2" fill="#94a3b8"/><line x1="24" y1="4" x2="24" y2="8" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/><line x1="24" y1="40" x2="24" y2="44" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/><line x1="4" y1="24" x2="8" y2="24" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/><line x1="40" y1="24" x2="44" y2="24" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/></svg>
              <div style={{fontSize:20,fontWeight:700,color:S.txt}}>No whitespace accounts yet</div>
              <div style={{fontSize:13,color:S.muted,textAlign:'center',lineHeight:1.7}}>Track prospect accounts you want to pursue. Add accounts manually<br/>or let AI detect them from your intel.</div>
              <button onClick={()=>setShowAdd(true)} style={{padding:'10px 24px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',marginTop:8}}>+ Add Your First Account</button>
            </div>
          ):sorted.length===0?(
            <div style={{padding:40,textAlign:'center',color:S.muted,fontSize:13}}>No accounts match your search or filter.</div>
          ):(
            <div style={mob?{overflowX:'auto',WebkitOverflowScrolling:'touch'}:{}}>
              <div style={{display:'flex',alignItems:'center',padding:'8px 16px',background:isLight?'#f8fafc':'rgba(255,255,255,0.03)',borderBottom:`1px solid ${isLight?'#e2e8f0':S.bdr}`,fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em',position:'sticky',top:mob?0:0,zIndex:10,userSelect:'none',minWidth:mob?900:undefined}}>
                <div style={{width:32,flexShrink:0,textAlign:'center'}}>
                  <input type="checkbox" style={{cursor:'pointer',accentColor:'#2563eb'}}
                    checked={sorted.length>0&&sorted.every(a=>selectedForExport.has(a.id))}
                    onChange={e=>{if(e.target.checked)setSelectedForExport(new Set(sorted.map(a=>a.id)));else setSelectedForExport(new Set())}}/>
                </div>
                <div style={{width:28,flexShrink:0}}/>
                <div style={{width:28,flexShrink:0,textAlign:'center'}}>🔥</div>
                <div style={{flex:'0 0 200px',cursor:'pointer'}} onClick={()=>setSort(sort==='Name A-Z'?'Name Z-A':'Name A-Z')}>Name{sort==='Name A-Z'?' ↑':sort==='Name Z-A'?' ↓':''}</div>
                <div style={{flex:'0 0 120px'}}>HQ</div>
                <div style={{flex:'1 1 140px',cursor:'pointer'}} onClick={()=>setSort('Industry')}>Industry{sort==='Industry'?' ↑':''}</div>
                <div style={{flex:'0 0 90px',textAlign:'right',cursor:'pointer'}} onClick={()=>setSort('Employees')}>Employees{sort==='Employees'?' ↓':''}</div>
                <div style={{flex:'0 0 110px',textAlign:'right',paddingRight:16,cursor:'pointer'}} onClick={()=>setSort('Revenue')}>Revenue{sort==='Revenue'?' ↓':''}</div>
                <div style={{flex:'0 0 70px',textAlign:'center',cursor:'pointer'}} onClick={()=>setSort('Intel')}>Intel{sort==='Intel'?' ↓':''}</div>
                <div style={{flex:'0 0 90px',textAlign:'right',cursor:'pointer'}} onClick={()=>setSort('Recently Updated')}>Updated{sort==='Recently Updated'?' ↓':''}</div>
                <div style={{flex:'0 0 130px',textAlign:'right',cursor:'pointer'}} onClick={()=>setSort('Status')}>Status{sort==='Status'?' ↑':''}</div>
                <div style={{width:44,flexShrink:0}}/>
              </div>
              {sorted.map((acct,i)=>{
                const isExp = expandedId===acct.id
                const sc = STATUS_COLORS[acct.status]||'#64748b'
                const isHov = hoveredId===acct.id
                const intelCount = (acct.notes||[]).length + (acct.intelLog||[]).length
                return (
                  <div key={acct.id} style={{borderBottom:`1px solid ${isLight?'#f1f5f9':'rgba(255,255,255,0.05)'}`,background:isExp?(isLight?'#f0f9ff':'rgba(37,99,235,0.05)'):i%2===0?(isLight?'#ffffff':'transparent'):(isLight?'#f8fafc':'rgba(255,255,255,0.015)')}}>
                    <div style={{display:'flex',alignItems:'center',padding:'12px 16px',cursor:'pointer',minWidth:mob?900:undefined}}
                      onClick={()=>setExpandedId(isExp?null:acct.id)}
                      onMouseEnter={()=>setHoveredId(acct.id)}
                      onMouseLeave={()=>setHoveredId(null)}>
                      <div style={{width:32,flexShrink:0,textAlign:'center'}} onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" style={{cursor:'pointer',accentColor:'#2563eb'}}
                          checked={selectedForExport.has(acct.id)}
                          onChange={e=>{setSelectedForExport(prev=>{const s=new Set(prev);if(e.target.checked)s.add(acct.id);else s.delete(acct.id);return s})}}/>
                      </div>
                      <div style={{width:28,flexShrink:0,color:'#94a3b8',fontSize:11}}>{isExp?'▼':'▶'}</div>
                      <div style={{width:28,flexShrink:0,textAlign:'center',fontSize:14}}>
                        {isHot(acct)?<span title='Hot account'>🔥</span>:null}
                      </div>
                      <div style={{flex:'0 0 200px',display:'flex',alignItems:'center',paddingRight:12,minWidth:0,gap:4}}>
                        <span style={{fontWeight:700,fontSize:14,color:isLight?'#0f172a':S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{acct.name}</span>
                        {acct.is_time_sensitive&&<span title='Time sensitive' style={{fontSize:11,flexShrink:0}}>⚡</span>}
                        {acct.prospect_brief&&!acct.is_time_sensitive&&<span title='Prospect brief available' style={{fontSize:10,color:'#007AFF',fontWeight:700,flexShrink:0}}>✓</span>}
                      </div>
                      <div style={{flex:'0 0 120px',fontSize:12,color:'#64748b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:12}}>{acct.hq||''}</div>
                      <div style={{flex:'1 1 140px',fontSize:12,color:'#64748b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:12}}>{acct.industry||''}</div>
                      <div style={{flex:'0 0 90px',textAlign:'right',fontSize:12,color:'#64748b'}}>{acct.employees||''}</div>
                      <div style={{flex:'0 0 110px',textAlign:'right',fontSize:12,color:'#64748b',paddingRight:16}}>{acct.revenue||''}</div>
                      <div style={{flex:'0 0 70px',textAlign:'center'}}>
                        {intelCount>0&&<span style={{fontSize:11,fontWeight:600,color:'#7c3aed',background:'#ede9fe',borderRadius:999,padding:'2px 7px'}}>{intelCount}</span>}
                      </div>
                      <div style={{flex:'0 0 90px',textAlign:'right',fontSize:11,color:'#94a3b8'}}>{fmtRel(acct.updatedAt||acct.addedAt)}</div>
                      <div style={{flex:'0 0 130px',textAlign:'right'}}>
                        <span style={{fontSize:11,fontWeight:700,color:'#fff',background:sc,borderRadius:999,padding:'3px 10px',whiteSpace:'nowrap'}}>{acct.status}</span>
                      </div>
                      <div style={{width:44,flexShrink:0,display:'flex',justifyContent:'flex-end'}} onClick={e=>e.stopPropagation()}>
                        <button onClick={e=>{e.stopPropagation();deleteAccount(acct.id,acct.name,i)}} style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:10,padding:'2px 4px',display:'flex',alignItems:'center'}}
                          onMouseEnter={e=>e.currentTarget.style.color='#dc2626'} onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}><Trash2 size={12}/></button>
                      </div>
                    </div>
                    {isExp&&<ExpandedWhitespaceRow key={acct.id+'-exp'} acct={acct} updateAccount={updateAccount} isLight={isLight} onRescore={rescoreAccount} scoringId={scoringId} effectiveKey={effectiveKey}/>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ADD ACCOUNT MODAL */}
      {showAdd&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={()=>setShowAdd(false)}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:28,width:'100%',maxWidth:480,boxShadow:'0 20px 60px rgba(0,0,0,0.4)',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:S.txt,marginBottom:18}}>Add Whitespace Account</div>
            {[{label:'Account Name *',key:'name'},{label:'HQ / Location',key:'hq'},{label:'Industry',key:'industry'},{label:'Employees',key:'employees',placeholder:'e.g. 5,000'},{label:'Revenue',key:'revenue',placeholder:'e.g. $500M'}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{f.label}</div>
                <input value={addForm[f.key]||''} onChange={e=>setAddForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder||''}
                  style={{width:'100%',fontSize:13,padding:'8px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,boxSizing:'border-box',outline:'none'}}/>
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Status</div>
              <select value={addForm.status} onChange={e=>setAddForm(p=>({...p,status:e.target.value}))}
                style={{width:'100%',fontSize:13,padding:'8px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt}}>
                {['Prospect','Researching','Reached Out','Active Conversation'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Initial Notes</div>
              <textarea value={addForm.notes||''} onChange={e=>setAddForm(p=>({...p,notes:e.target.value}))} rows={3} placeholder='What do you know about this account so far?'
                style={{width:'100%',fontSize:13,padding:'8px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,boxSizing:'border-box',resize:'vertical',fontFamily:'inherit',lineHeight:1.5}}/>
            </div>
            {addDupeWarning&&(
              <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'12px 14px',marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:600,color:'#92400e',marginBottom:8}}>⚠ Similar account already exists: <strong>{addDupeWarning.match.name}</strong></div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{setShowAdd(false);setAddDupeWarning(null);setExpandedId(addDupeWarning.match.id)}} style={{flex:1,padding:'8px',background:'#2563eb',border:'none',borderRadius:7,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>Update Existing</button>
                  <button onClick={addAccount} style={{flex:1,padding:'8px',background:'transparent',border:'1px solid #fde68a',borderRadius:7,color:'#92400e',fontSize:12,fontWeight:600,cursor:'pointer'}}>Create Anyway</button>
                </div>
              </div>
            )}
            <div style={{display:'flex',gap:10}}>
              <button onClick={addAccount} style={{flex:1,padding:'11px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Add Account</button>
              <button onClick={()=>{setShowAdd(false);setAddForm({name:'',hq:'',industry:'',employees:'',revenue:'',status:'Prospect',notes:''});setAddDupeWarning(null)}} style={{padding:'11px 16px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD INTELLIGENCE MODAL */}
      {showIntel&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={()=>{resetWsFileState();setShowIntel(false)}}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,width:'65vw',maxWidth:900,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{padding:'20px 24px 14px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:17,fontWeight:700,color:S.txt,marginBottom:4}}>Add Whitespace Intelligence</div>
                  <div style={{fontSize:12,color:S.muted,lineHeight:1.5}}>Paste a transcript or upload a file. AI extracts prospect accounts and maps them to your whitespace tracker.</div>
                </div>
                <button onClick={()=>{resetWsFileState();setShowIntel(false)}} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px',marginTop:-2}}>×</button>
              </div>
            </div>
            {/* Scrollable content */}
            <div style={{flex:1,padding:'16px 24px',display:'flex',flexDirection:'column',gap:12,overflowY:'auto',minHeight:0}}>
              {/* Textarea — hidden when PDF or image is loaded */}
              {!wsFileIsDirectType&&(
                <div style={{position:'relative'}}>
                  <textarea
                    value={intelText}
                    onChange={e=>setIntelText(e.target.value)}
                    placeholder={`Paste a vendor call or quick note here...\n\nExample: 'On a call with CrowdStrike today. They mentioned Waters Corporation is actively evaluating EDR — no incumbent, budget confirmed Q3. Also Watts Water is looking at SIEM. Sarah Chen is the IT contact at Waters.'`}
                    rows={7}
                    style={{width:'100%',fontSize:13,padding:'12px 14px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:8,color:S.txt,boxSizing:'border-box',resize:'vertical',fontFamily:'inherit',lineHeight:1.6,outline:'none',display:'block'}}
                  />
                  <div style={{textAlign:'right',fontSize:11,color:S.muted,marginTop:3}}>{intelText.length.toLocaleString()} / 40,000</div>
                </div>
              )}
              {/* PDF / image file preview card */}
              {wsFileIsDirectType&&wsUploadedFile&&(
                <div style={{background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',gap:14}}>
                  <div style={{fontSize:32,flexShrink:0,lineHeight:1}}>{wsUploadedFile.name.endsWith('.pdf')?'📄':'🖼️'}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#1e40af',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{wsUploadedFile.name}</div>
                    <div style={{fontSize:11,color:'#3b82f6',marginTop:2}}>{(wsUploadedFile.size/1024).toFixed(0)} KB · Ready to analyze with AI</div>
                    <div style={{fontSize:11,color:'#64748b',marginTop:3}}>{wsUploadedFile.name.endsWith('.pdf')?'PDF will be analyzed directly by AI':'Image will be analyzed directly by AI'}</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();resetWsFileState()}} style={{background:'none',border:'none',color:'#60a5fa',cursor:'pointer',fontSize:18,lineHeight:1,padding:0,flexShrink:0}}>×</button>
                </div>
              )}
              {/* File upload zone — visible when no file loaded */}
              {!wsUploadedFile&&(
                <div
                  onDragOver={e=>{e.preventDefault();setWsDragOver(true)}}
                  onDragLeave={()=>setWsDragOver(false)}
                  onDrop={e=>{e.preventDefault();setWsDragOver(false);const f=e.dataTransfer.files[0];if(f)wsHandleFile(f)}}
                  onClick={()=>!wsFileLoading&&wsFileInputRef.current?.click()}
                  style={{border:`2px dashed ${wsDragOver?'#2563eb':'#cbd5e1'}`,borderRadius:8,padding:20,textAlign:'center',background:wsDragOver?'#eff6ff':S.surf2,cursor:wsFileLoading?'default':'pointer',transition:'all 0.15s'}}>
                  <input ref={wsFileInputRef} type='file' accept='.txt,.pdf,.doc,.docx,.md,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv' style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)wsHandleFile(f);e.target.value=''}}/>
                  {wsFileLoading?(
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:13,color:S.muted}}>
                      <span style={{display:'inline-block',width:14,height:14,border:'2px solid #cbd5e1',borderTop:'2px solid #2563eb',borderRadius:'50%',animation:'ilSpin 0.75s linear infinite',flexShrink:0}}/>
                      Reading file...
                    </div>
                  ):(
                    <>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{margin:'0 auto 6px',display:'block'}}><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <div style={{fontSize:13,color:S.muted,marginBottom:2}}>Drop a file here or click to upload</div>
                      <div style={{fontSize:11,color:'#94a3b8'}}>Supports PDF, DOCX, TXT, MD, PNG, JPG, WEBP, XLSX, XLS, CSV</div>
                    </>
                  )}
                </div>
              )}
              {/* DOCX / TXT / Spreadsheet file pill */}
              {!wsFileIsDirectType&&wsUploadedFile&&(()=>{
                const isSs = wsSpreadsheetRows != null
                const rowCount = wsSpreadsheetRows?.length || 0
                return (
                  <div>
                    <div style={{display:'inline-flex',alignItems:'center',gap:6,background:isSs?'#f0fdf4':'#eff6ff',border:`1px solid ${isSs?'#bbf7d0':'#bfdbfe'}`,borderRadius:999,padding:'4px 10px',fontSize:12,color:isSs?'#15803d':'#1d4ed8'}}>
                      <span>{isSs?'📊':'📄'} {wsUploadedFile.name} · {(wsUploadedFile.size/1024).toFixed(0)} KB</span>
                      <button onClick={e=>{e.stopPropagation();resetWsFileState()}} style={{background:'none',border:'none',color:isSs?'#4ade80':'#60a5fa',cursor:'pointer',fontSize:16,lineHeight:1,padding:0,display:'flex',alignItems:'center'}}>×</button>
                    </div>
                    {isSs
                      ? <div style={{fontSize:11,color:'#15803d',marginTop:3,paddingLeft:2}}>Spreadsheet parsed — {rowCount} rows mapped for AI review{wsSpreadsheetRows?.length>0&&!wsSpreadsheetRows[0].accountName?' (no Account Name column detected — AI will attempt mapping)':''}</div>
                      : wsFileCharCount>0&&<div style={{fontSize:11,color:S.muted,marginTop:3,paddingLeft:2}}>Extracted: {wsFileCharCount.toLocaleString()} characters{wsFileCharCount>WS_FILE_CHAR_LIMIT?` (processing first ${WS_FILE_CHAR_LIMIT.toLocaleString()})`:''}</div>
                    }
                  </div>
                )
              })()}
              {wsLargeDocWarning&&(
                <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#92400e',display:'flex',alignItems:'flex-start',gap:6}}>
                  <span style={{flexShrink:0,fontSize:14}}>⚠</span>
                  <span>Large document — processing first 100,000 characters. Upload remaining pages separately if needed.</span>
                </div>
              )}
              {wsFileStatus&&!intelLoading&&(
                <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#0369a1',display:'flex',alignItems:'center',gap:6}}>
                  <span style={{display:'inline-block',width:12,height:12,border:'2px solid #bae6fd',borderTop:'2px solid #0369a1',borderRadius:'50%',animation:'ilSpin 0.75s linear infinite',flexShrink:0}}/>
                  {wsFileStatus}
                </div>
              )}
              {wsFileError&&(
                <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#dc2626'}}>{wsFileError}</div>
              )}
              {intelError&&wsFileIsDirectType&&wsPendingFile&&wsPendingFile.name.endsWith('.pdf')&&(
                <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#dc2626',display:'flex',alignItems:'flex-start',gap:8}}>
                  <div style={{flex:1}}>{intelError}</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',flexShrink:0}}>
                    <button onClick={()=>{setIntelError('');processFileIntel(wsPendingDate,true)}} style={{fontSize:12,color:'#1d4ed8',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'3px 10px',cursor:'pointer',fontWeight:600}}>Try Again (text extraction)</button>
                    <button onClick={()=>{resetWsFileState();setIntelError('')}} style={{fontSize:12,color:'#64748b',background:'transparent',border:'1px solid #e2e8f0',borderRadius:6,padding:'3px 8px',cursor:'pointer'}}>Clear file</button>
                  </div>
                </div>
              )}
            </div>
            {/* Fixed footer */}
            <div style={{padding:'12px 24px 16px',borderTop:`1px solid ${S.bdr}`,flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
              {!wsFileIsDirectType&&(
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:12,color:S.muted,fontWeight:500}}>Date:</span>
                  <input type='date' value={intelDate} onChange={e=>setIntelDate(e.target.value)}
                    style={{fontSize:12,padding:'5px 8px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:6,color:S.txt,outline:'none'}}/>
                </div>
              )}
              {intelError&&!wsFileIsDirectType&&<div style={{fontSize:12,color:S.red,flex:1}}>{intelError}</div>}
              {!intelError&&(wsRetryStatus||intelStatus)&&<div style={{fontSize:12,color:S.muted,flex:1}}>{wsRetryStatus||intelStatus}</div>}
              <button onClick={handleWsProcess} disabled={intelLoading||(wsFileIsDirectType?!wsPendingFile:!intelText.trim())}
                style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:7,padding:'10px 24px',background:intelLoading||(wsFileIsDirectType?!wsPendingFile:!intelText.trim())?'#94a3b8':'linear-gradient(135deg,#1d4ed8,#2563eb)',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:intelLoading||(wsFileIsDirectType?!wsPendingFile:!intelText.trim())?'not-allowed':'pointer',minWidth:180,justifyContent:'center',whiteSpace:'nowrap'}}>
                {intelLoading?<><span style={{display:'inline-block',width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'ilSpin 0.7s linear infinite'}}/>Processing…</>:wsFileIsDirectType?<><Zap size={14}/>Analyze Document with AI</>:<><Zap size={14}/>Process with AI</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DATE CONFIRMATION MODAL for whitespace file uploads */}
      {wsShowDate&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1100,padding:20}} onClick={()=>setWsShowDate(false)}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:24,width:'100%',maxWidth:380,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:15,fontWeight:700,color:S.txt,marginBottom:6}}>{wsDateModalIsFile?'When did this document originate?':wsSpreadsheetRows?'Set import date for this spreadsheet':'Confirm document date'}</div>
            <p style={{fontSize:13,color:S.muted,marginBottom:12,lineHeight:1.6}}>{wsDateModalIsFile?'When was this document created or the event it describes occurred?':wsSpreadsheetRows?'Choose a date to associate with these imported accounts (defaults to today).':'Is the date in this document correct?'}</p>
            {wsCustomDate&&<div style={{fontSize:12,color:'#15803d',padding:'6px 10px',background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:5,marginBottom:12}}>Date detected: <strong>{fmtDate(wsCustomDate)}</strong></div>}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:S.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Custom date (leave blank for today)</div>
              <input type='date' value={wsCustomDate} onChange={e=>setWsCustomDate(e.target.value)}
                style={{width:'100%',boxSizing:'border-box',fontSize:13,padding:'8px 10px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,outline:'none'}}/>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{const d=new Date().toISOString().split('T')[0];setWsShowDate(false);wsDateModalIsFile?processFileIntel(d):processIntel(d)}}
                style={{flex:1,padding:'9px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Use Today</button>
              <button onClick={()=>{if(wsCustomDate){setWsShowDate(false);wsDateModalIsFile?processFileIntel(wsCustomDate):processIntel(wsCustomDate)}}}
                style={{flex:1,padding:'9px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.txt,fontSize:13,cursor:'pointer',opacity:wsCustomDate?1:0.4}}>
                {wsCustomDate?`Use ${fmtDate(wsCustomDate)}`:'Use Custom Date'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MERGE ACCOUNTS MODAL */}
      {showMerge&&(()=>{
        const mergeFiltered = ws.filter(a=>!mergeSearch.trim()||(a.name||'').toLowerCase().includes(mergeSearch.toLowerCase()))
        const mergeSelectedAccts = ws.filter(a=>mergeSelected.has(a.id))
        const primaryAcct = ws.find(a=>a.id===mergePrimary)
        // Preview counts for step 2
        const previewNotes = mergeSelectedAccts.reduce((sum,a)=>sum+(a.notes||[]).length,0)
        const previewIntel = mergeSelectedAccts.reduce((sum,a)=>sum+(a.intelLog||[]).length,0)
        const contactNames = new Set(); mergeSelectedAccts.forEach(a=>(a.contacts||[]).forEach(c=>contactNames.add((c.name||'').toLowerCase())))
        const techNames = new Set(); mergeSelectedAccts.forEach(a=>(a.technologies||[]).forEach(t=>techNames.add((t.vendor||'').toLowerCase())))
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={()=>setShowMerge(false)}>
            <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,width:'65vw',maxWidth:860,maxHeight:'75vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
              {/* Header */}
              <div style={{padding:'20px 24px 14px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:17,fontWeight:700,color:S.txt,marginBottom:3}}>{mergeStep===1?'Merge Accounts':'Configure Merge'}</div>
                  <div style={{fontSize:12,color:S.muted}}>{mergeStep===1?'Select 2 or more accounts to merge into one':'Choose the primary account to keep as the base'}</div>
                </div>
                <button onClick={()=>setShowMerge(false)} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>
              </div>
              {/* Step 1: Select accounts */}
              {mergeStep===1&&(
                <>
                  <div style={{padding:'12px 24px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
                    <input value={mergeSearch} onChange={e=>setMergeSearch(e.target.value)} placeholder='Search accounts…'
                      style={{width:'100%',boxSizing:'border-box',fontSize:13,padding:'8px 12px',background:S.surf2,border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,outline:'none'}}/>
                  </div>
                  <div style={{flex:1,overflowY:'auto'}}>
                    {mergeFiltered.map(a=>{
                      const checked = mergeSelected.has(a.id)
                      const intelCnt = (a.notes||[]).length+(a.intelLog||[]).length
                      return (
                        <div key={a.id} onClick={()=>{setMergeSelected(prev=>{const ns=new Set(prev);if(ns.has(a.id))ns.delete(a.id);else ns.add(a.id);return ns})}}
                          style={{display:'flex',alignItems:'center',gap:12,padding:'11px 24px',borderBottom:`1px solid ${S.bdr}`,cursor:'pointer',background:checked?(isLight?'#f0f9ff':'rgba(37,99,235,0.05)'):'transparent'}}
                          onMouseEnter={e=>{if(!checked)e.currentTarget.style.background=S.surf2}}
                          onMouseLeave={e=>{e.currentTarget.style.background=checked?(isLight?'#f0f9ff':'rgba(37,99,235,0.05)'):'transparent'}}>
                          <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${checked?'#2563eb':S.bdr}`,background:checked?'#2563eb':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                            {checked&&<svg width="10" height="8" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:14,fontWeight:700,color:S.txt,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                            {(a.hq||a.industry)&&<div style={{fontSize:11,color:S.muted}}>{[a.hq,a.industry].filter(Boolean).join(' · ')}</div>}
                          </div>
                          <div style={{display:'flex',gap:8,flexShrink:0,fontSize:11,color:S.muted}}>
                            {intelCnt>0&&<span style={{color:'#7c3aed',fontWeight:600}}>{intelCnt} intel</span>}
                            {(a.contacts||[]).length>0&&<span>{(a.contacts||[]).length} contacts</span>}
                            {(a.technologies||[]).length>0&&<span>{(a.technologies||[]).length} tech</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{padding:'14px 24px',borderTop:`1px solid ${S.bdr}`,display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
                    <span style={{fontSize:12,color:S.muted}}>{mergeSelected.size} account{mergeSelected.size!==1?'s':''} selected</span>
                    <button onClick={()=>{if(mergeSelected.size>=2){const ids=[...mergeSelected];setMergePrimary(ids[0]);setMergeStep(2)}}} disabled={mergeSelected.size<2}
                      style={{marginLeft:'auto',padding:'10px 24px',background:mergeSelected.size<2?'#94a3b8':'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:mergeSelected.size<2?'not-allowed':'pointer'}}>
                      Next →
                    </button>
                  </div>
                </>
              )}
              {/* Step 2: Configure merge */}
              {mergeStep===2&&(
                <>
                  <div style={{flex:1,overflowY:'auto',padding:'16px 24px',display:'flex',flexDirection:'column',gap:16}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Primary Account (keep this name &amp; details)</div>
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {mergeSelectedAccts.map(a=>(
                          <label key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:mergePrimary===a.id?(isLight?'#eff6ff':'rgba(37,99,235,0.1)'):S.surf2,border:`2px solid ${mergePrimary===a.id?'#2563eb':S.bdr}`,borderRadius:8,cursor:'pointer',transition:'all 0.12s'}}>
                            <input type='radio' checked={mergePrimary===a.id} onChange={()=>setMergePrimary(a.id)} style={{accentColor:'#2563eb',width:16,height:16,flexShrink:0}}/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:14,fontWeight:700,color:S.txt}}>{a.name}</div>
                              {(a.hq||a.industry)&&<div style={{fontSize:11,color:S.muted}}>{[a.hq,a.industry].filter(Boolean).join(' · ')}</div>}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div style={{background:S.surf2,borderRadius:10,padding:'14px 16px'}}>
                      <div style={{fontSize:12,fontWeight:700,color:S.muted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Merge Preview</div>
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {[
                          {label:'Notes',value:previewNotes},
                          {label:'Intel entries',value:previewIntel},
                          {label:'Contacts',value:contactNames.size,suffix:' (duplicates removed)'},
                          {label:'Technologies',value:techNames.size,suffix:' (duplicates removed)'},
                        ].map(r=>(
                          <div key={r.label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:13}}>
                            <span style={{color:S.muted}}>{r.label}</span>
                            <span style={{fontWeight:700,color:S.txt}}>{r.value}{r.suffix||''}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:10,fontSize:12,color:S.muted,lineHeight:1.5}}>
                        Primary account name, HQ, industry, employees, revenue, and status will be kept. All intel, contacts, and technologies from all selected accounts will be combined.
                      </div>
                    </div>
                  </div>
                  <div style={{padding:'14px 24px',borderTop:`1px solid ${S.bdr}`,display:'flex',gap:10,flexShrink:0}}>
                    <button onClick={()=>setMergeStep(1)} style={{padding:'10px 18px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>← Back</button>
                    <button onClick={executeMerge} disabled={!mergePrimary}
                      style={{flex:1,padding:'10px',background:!mergePrimary?'#94a3b8':'linear-gradient(135deg,#1d4ed8,#2563eb)',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:!mergePrimary?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
                      <GitMerge size={14}/>Merge Accounts
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* DUPLICATE REVIEW MODAL */}
      {showDupeReview&&(()=>{
        // Filter to only pairs still present (after merges/deletes)
        const livePairs = dupePairs.filter(([a,b])=>ws.some(w=>w.id===a.id)&&ws.some(w=>w.id===b.id))
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={()=>setShowDupeReview(false)}>
            <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,width:'70vw',maxWidth:900,maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
              <div style={{padding:'20px 24px 14px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:17,fontWeight:700,color:S.txt,marginBottom:3}}>Review Possible Duplicates</div>
                  <div style={{fontSize:12,color:S.muted}}>{livePairs.length} pair{livePairs.length!==1?'s':''} detected. Review each and choose how to handle them.</div>
                </div>
                <button onClick={()=>setShowDupeReview(false)} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
                {livePairs.length===0?(
                  <div style={{padding:'40px',textAlign:'center',color:S.muted,fontSize:13}}>No duplicates remaining. All good!</div>
                ):livePairs.map(([a,b],pi)=>{
                  const aIntel=(a.notes||[]).length+(a.intelLog||[]).length
                  const bIntel=(b.notes||[]).length+(b.intelLog||[]).length
                  return (
                    <div key={pi} style={{padding:'16px 24px',borderBottom:`1px solid ${S.bdr}`}}>
                      <div style={{display:'flex',gap:16,marginBottom:12}}>
                        {[{acct:a,intel:aIntel},{acct:b,intel:bIntel}].map(({acct,intel},si)=>(
                          <div key={si} style={{flex:1,background:S.surf2,borderRadius:8,padding:'12px 14px'}}>
                            <div style={{fontSize:14,fontWeight:700,color:S.txt,marginBottom:3}}>{acct.name}</div>
                            {(acct.hq||acct.industry)&&<div style={{fontSize:11,color:S.muted,marginBottom:5}}>{[acct.hq,acct.industry].filter(Boolean).join(' · ')}</div>}
                            <div style={{display:'flex',gap:10,fontSize:11,color:S.muted,flexWrap:'wrap'}}>
                              {intel>0&&<span style={{color:'#7c3aed',fontWeight:600}}>{intel} intel</span>}
                              {(acct.contacts||[]).length>0&&<span>{(acct.contacts||[]).length} contacts</span>}
                              {(acct.technologies||[]).length>0&&<span>{(acct.technologies||[]).length} tech</span>}
                              <span style={{fontSize:10,color:'#64748b',background:S.bdr,borderRadius:4,padding:'1px 6px'}}>{acct.status||'Prospect'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>handleDupeAction('keepA',a,b)} style={{flex:1,padding:'8px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,fontSize:12,fontWeight:600,cursor:'pointer'}}>Keep "{a.name.slice(0,22)}{a.name.length>22?'…':''}"</button>
                        <button onClick={()=>{handleDupeAction('merge',a,b);if(livePairs.length<=1)setShowDupeReview(false)}} style={{flex:1,padding:'8px',background:'#2563eb',border:'none',borderRadius:7,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}><GitMerge size={12}/>Merge</button>
                        <button onClick={()=>handleDupeAction('keepB',a,b)} style={{flex:1,padding:'8px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:7,color:S.txt,fontSize:12,fontWeight:600,cursor:'pointer'}}>Keep "{b.name.slice(0,22)}{b.name.length>22?'…':''}"</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{padding:'14px 24px',borderTop:`1px solid ${S.bdr}`,display:'flex',justifyContent:'flex-end',flexShrink:0}}>
                <button onClick={()=>{setShowDupeReview(false);setDupeDismissed(true)}} style={{padding:'10px 20px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Done</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* CONFIRMATION MODAL */}
      {pendingIntel&&(()=>{
        const totalFound = pendingIntel.accounts.length
        const blockedCount = pendingIntel.accounts.filter(a=>isBlockedAccount(a.name)).length
        const availableCount = totalFound - blockedCount
        const allBlocked = blockedCount === totalFound
        const confirmName = i => { if((editingNameDraft||'').trim())setPendingNames(p=>({...p,[i]:editingNameDraft.trim()})); setEditingNameIdx(null); setEditingNameDraft('') }
        const cancelName = () => { setEditingNameIdx(null); setEditingNameDraft('') }
        return (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:20}} onClick={closeIntelModal}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,width:'60vw',maxWidth:780,maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'20px 24px 14px',borderBottom:`1px solid ${S.bdr}`,flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:17,fontWeight:700,color:S.txt,marginBottom:3}}>Review Extracted Accounts</div>
                  <div style={{fontSize:12,color:S.muted}}>Select accounts to add or update in your whitespace tracker. Click the pencil to correct a name.</div>
                </div>
                <button onClick={closeIntelModal} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:22,lineHeight:1,padding:'0 4px'}}>×</button>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginTop:10,flexWrap:'wrap'}}>
                <span style={{fontSize:12,color:S.muted}}>{totalFound} found</span>
                {blockedCount>0&&<><span style={{fontSize:12,color:S.muted}}>·</span><span style={{fontSize:12,color:'#dc2626',fontWeight:600}}>{blockedCount} blocked</span></>}
                {availableCount>0&&<><span style={{fontSize:12,color:S.muted}}>·</span><span style={{fontSize:12,color:'#0ebc5f',fontWeight:600}}>{availableCount} available</span></>}
                <span style={{flex:1}}/>
                <button onClick={()=>setSelectedIntel(new Set(pendingIntel.accounts.map((_,i)=>i).filter(i=>!isBlockedAccount(pendingIntel.accounts[i].name))))} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer',padding:0,fontWeight:600}}>Select Available</button>
                <span style={{fontSize:12,color:S.muted}}>·</span>
                <button onClick={()=>setSelectedIntel(new Set())} style={{fontSize:12,color:S.muted,background:'none',border:'none',cursor:'pointer',padding:0}}>Deselect All</button>
                <span style={{fontSize:12,color:S.muted}}>{selectedIntel.size} of {totalFound} selected</span>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
              {allBlocked?(
                <div style={{padding:'32px 24px',textAlign:'center'}}>
                  <div style={{fontSize:15,fontWeight:700,color:S.txt,marginBottom:8}}>All accounts mentioned are already in the named accounts list.</div>
                  <div style={{fontSize:13,color:S.muted,lineHeight:1.6}}>These accounts are covered by other reps. You can still add them to your whitespace tracker for monitoring, but you cannot actively pursue them without clearing the conflict.</div>
                </div>
              ):(
                pendingIntel.accounts.map((a,i)=>{
                  const displayName = pendingNames[i] || a.name
                  const inWS = (data.whitespaceAccounts||[]).find(w=>fuzzyMatchAccount(displayName, w.name))
                  const possibleWS = !inWS && (data.whitespaceAccounts||[]).find(w=>{ const s=fuzzyBigramScore(displayName,w.name); return s>=0.5&&s<0.7 })
                  const inCRM = (data.accounts||[]).some(ac=>(ac.name||'').toLowerCase().slice(0,8)===(displayName||'').toLowerCase().slice(0,8))
                  const blocked = isBlockedAccount(displayName)
                  const openNamed = !blocked && isOpenNamedAccount(displayName)
                  const owner = getAccountOwner(displayName)
                  const isChecked = selectedIntel.has(i)
                  const dimmed = inCRM
                  const isEditingThis = editingNameIdx === i
                  return (
                    <div key={i} onClick={()=>{if(dimmed||isEditingThis)return;setSelectedIntel(prev=>{const ns=new Set(prev);if(ns.has(i))ns.delete(i);else ns.add(i);return ns})}}
                      style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 24px',borderBottom:`1px solid ${S.bdr}`,cursor:dimmed||isEditingThis?'default':'pointer',opacity:dimmed?0.45:1,background:isChecked&&!dimmed?(S.isLight?'#f0f9ff':'rgba(37,99,235,0.05)'):'transparent'}}
                      onMouseEnter={e=>{if(!dimmed&&!isEditingThis)e.currentTarget.style.background=S.surf2}}
                      onMouseLeave={e=>{e.currentTarget.style.background=isChecked&&!dimmed?(S.isLight?'#f0f9ff':'rgba(37,99,235,0.05)'):'transparent'}}>
                      <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${isChecked&&!dimmed?'#2563eb':S.bdr}`,background:isChecked&&!dimmed?'#2563eb':'transparent',flexShrink:0,marginTop:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {isChecked&&!dimmed&&<svg width="10" height="8" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3,flexWrap:'wrap'}}>
                          {isEditingThis ? (
                            <div style={{display:'flex',alignItems:'center',gap:5}} onClick={e=>e.stopPropagation()}>
                              <input
                                autoFocus
                                value={editingNameDraft}
                                onChange={e=>setEditingNameDraft(e.target.value)}
                                onKeyDown={e=>{if(e.key==='Enter')confirmName(i);else if(e.key==='Escape')cancelName()}}
                                style={{fontSize:13,fontWeight:600,padding:'3px 8px',background:'#ffffff',border:'1px solid #2563eb',borderRadius:4,color:'#0f172a',outline:'none',minWidth:180}}
                              />
                              <button onClick={()=>confirmName(i)} title='Save' style={{background:'transparent',border:'none',cursor:'pointer',color:'#16a34a',padding:'2px',display:'flex',alignItems:'center'}}>
                                <svg width="14" height="14" viewBox="0 0 14 14"><polyline points="2,7 6,11 12,3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </button>
                              <button onClick={cancelName} title='Cancel' style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'2px',display:'flex',alignItems:'center',fontSize:15,lineHeight:1}}>×</button>
                            </div>
                          ) : (
                            <>
                              <span style={{fontSize:14,fontWeight:700,color:S.txt}}>{displayName}</span>
                              <button onClick={e=>{e.stopPropagation();setEditingNameIdx(i);setEditingNameDraft(displayName)}} title='Edit name'
                                style={{background:'transparent',border:'none',cursor:'pointer',color:'#94a3b8',padding:'1px 2px',display:'flex',alignItems:'center',lineHeight:1,marginLeft:2}}
                                onMouseEnter={e=>e.currentTarget.style.color='#2563eb'}
                                onMouseLeave={e=>e.currentTarget.style.color='#94a3b8'}>
                                <Pencil size={12}/>
                              </button>
                            </>
                          )}
                          {blocked&&<span style={{fontSize:10,fontWeight:700,color:'#dc2626',background:'#fee2e2',borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap'}}>Named — {owner||'Other rep'}</span>}
                          {openNamed&&<span style={{fontSize:10,fontWeight:700,color:'#1d4ed8',background:'#dbeafe',borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap'}}>Open ({owner})</span>}
                          {!blocked&&!openNamed&&!inCRM&&!inWS&&!possibleWS&&<span style={{fontSize:10,fontWeight:700,color:'#15803d',background:'#dcfce7',borderRadius:4,padding:'1px 7px'}}>New</span>}
                          {inWS&&<span style={{fontSize:10,fontWeight:700,color:'#a16207',background:'#fef9c3',borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis'}}>Update existing{inWS.name.toLowerCase()!==displayName.toLowerCase()?` · Matches: ${inWS.name}`:''}</span>}
                          {possibleWS&&<span style={{fontSize:10,fontWeight:700,color:'#d97706',background:'#fef3c7',borderRadius:4,padding:'1px 7px',whiteSpace:'nowrap'}}>Possible match? · {possibleWS.name}</span>}
                          {inCRM&&<span style={{fontSize:10,fontWeight:700,color:'#64748b',background:S.surf2,borderRadius:4,padding:'1px 7px',border:`1px solid ${S.bdr}`}}>In CRM</span>}
                        </div>
                        {(a.hq||a.industry||a.employees||a.revenue)&&(
                          <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:5}}>
                            {a.hq&&<span style={{fontSize:10,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:12,padding:'1px 8px',whiteSpace:'nowrap'}}>HQ: {a.hq}</span>}
                            {a.employees&&<span style={{fontSize:10,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:12,padding:'1px 8px',whiteSpace:'nowrap'}}>Employees: {a.employees}</span>}
                            {a.revenue&&<span style={{fontSize:10,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:12,padding:'1px 8px',whiteSpace:'nowrap'}}>Revenue: {a.revenue}</span>}
                            {a.industry&&<span style={{fontSize:10,color:'#64748b',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:12,padding:'1px 8px',whiteSpace:'nowrap'}}>Industry: {a.industry}</span>}
                          </div>
                        )}
                        {a.note&&<div style={{fontSize:12,color:S.muted,fontStyle:'italic',lineHeight:1.5}}>{a.note.slice(0,120)}{a.note.length>120?'…':''}</div>}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div style={{padding:'14px 24px',borderTop:`1px solid ${S.bdr}`,display:'flex',gap:10,flexShrink:0}}>
              <button onClick={saveIntel} disabled={selectedIntel.size===0}
                style={{flex:1,padding:'11px',background:selectedIntel.size===0?'#94a3b8':'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:selectedIntel.size===0?'not-allowed':'pointer'}}>
                Add Selected ({selectedIntel.size})
              </button>
              <button onClick={closeIntelModal} style={{padding:'11px 20px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* AUTO-FILL CONFIRMATION MODAL */}
      {showAutoFillModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:20}} onClick={()=>setShowAutoFillModal(false)}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:28,width:'100%',maxWidth:440,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:S.txt,marginBottom:10}}>Auto-fill Missing Data</div>
            <div style={{fontSize:13,color:S.muted,lineHeight:1.6,marginBottom:20}}>
              AI will search for employee count and revenue for <strong style={{color:S.txt}}>{ws.filter(a=>!a.employees||!a.revenue).length} accounts</strong> with missing data. This uses your API key.
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={handleAutoFill} style={{flex:1,padding:'10px',background:'#15803d',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Continue</button>
              <button onClick={()=>setShowAutoFillModal(false)} style={{padding:'10px 20px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAN NOTES CONFIRMATION MODAL */}
      {showCleanNotesModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000,padding:20}} onClick={()=>setShowCleanNotesModal(false)}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:28,width:'100%',maxWidth:480,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:S.txt,marginBottom:10}}>Clean Duplicate Notes</div>
            <div style={{fontSize:13,color:S.muted,lineHeight:1.6,marginBottom:20}}>
              AI will clean up redundant notes for <strong style={{color:S.txt}}>{ws.filter(a=>((a.intelLog||[]).length+(a.notes||[]).length)>2).length} accounts</strong>. Duplicate and repetitive information will be consolidated. Original entries are archived and not lost.
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={handleCleanNotes} style={{flex:1,padding:'10px',background:'#1d4ed8',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Continue</button>
              <button onClick={()=>setShowCleanNotesModal(false)} style={{padding:'10px 20px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* AI OPERATION PROGRESS OVERLAY */}
      {aiOpRunning&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2100,padding:20}}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:32,width:'100%',maxWidth:440,boxShadow:'0 20px 60px rgba(0,0,0,0.5)',textAlign:'center'}}>
            <div style={{fontSize:28,marginBottom:12}}>⏳</div>
            <div style={{fontSize:15,fontWeight:700,color:S.txt,marginBottom:8}}>AI Working…</div>
            <div style={{fontSize:13,color:S.muted,lineHeight:1.6}}>{aiOpProgress}</div>
          </div>
        </div>
      )}

      {/* PROMOTE TO ACCOUNT — DUPLICATE CONFIRM MODAL */}
      {showPromoteModal&&promoteTarget&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2200,padding:20}} onClick={()=>{setShowPromoteModal(false);setPromoteTarget(null);setPromoteDuplicate(null)}}>
          <div style={{background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:12,padding:28,width:'100%',maxWidth:460,boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:S.txt,marginBottom:10}}>Account Already Exists</div>
            <div style={{fontSize:13,color:S.muted,lineHeight:1.6,marginBottom:20}}>
              <strong style={{color:S.txt}}>{promoteTarget.name}</strong> already exists in your Accounts. Update the existing account with whitespace data?<br/><br/>
              Only blank fields will be filled. Existing data will not be overwritten.
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>doPromote(promoteTarget,promoteDuplicate)} style={{flex:1,padding:'10px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Update Existing</button>
              <button onClick={()=>{setShowPromoteModal(false);setPromoteTarget(null);setPromoteDuplicate(null)}} style={{padding:'10px 20px',background:'transparent',border:`1px solid ${S.bdr}`,borderRadius:8,color:S.muted,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* AI OPERATION SUMMARY TOAST */}
      {aiOpSummary&&!aiOpRunning&&(
        <div style={{position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'#f0fdf4',padding:'12px 24px',borderRadius:10,fontSize:13,fontWeight:600,zIndex:2000,boxShadow:'0 4px 20px rgba(0,0,0,0.4)',display:'flex',alignItems:'center',gap:10}}>
          <span style={{color:'#4ade80'}}>✓</span>{aiOpSummary}
          <button onClick={()=>setAiOpSummary('')} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:16,lineHeight:1,marginLeft:8}}>×</button>
        </div>
      )}
    </div>
  )
}
