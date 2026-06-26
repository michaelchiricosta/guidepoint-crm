import { useState, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { S, PC } from '../theme.js'
import { uid, fmtDate } from '../utils.js'
import { Btn, Field, Modal } from './UI.jsx'
import { resolveVendorMapping } from '../securityFramework.js'
import { STAGES } from '../constants.js'
import { supabase } from '../supabase.js'
import { callClaudeWithRetry, extractStructuredAIResponse, repairAIResponse } from '../utils/aiHelper.js'

const makeRepairPrompt = (date) =>
  `Convert this content into the exact Intel Log JSON schema. Return only valid JSON. No markdown. No code fences. No commentary.\n\nUse date: ${date}\n\n{"intelEntry":{"date":"${date}","type":"Call|Meeting|Email|Note","participants":"","summary":"","insights":[],"risks":[],"opportunities":[]},"newFollowUps":[],"contactUpdates":[],"techStackSuggestions":[],"techStackUpdates":[],"projectUpdates":[]}`

const createFallbackEntry = (inputText, date) => {
  const snippet = String(inputText || '').trim().replace(/\s+/g, ' ').slice(0, 500)
  return {
    intelEntry: { date, type: 'Note', participants: '', summary: snippet || 'Call transcript notes', insights: [], risks: [], opportunities: [] },
    newFollowUps: [], contactUpdates: [], techStackSuggestions: [], techStackUpdates: [], projectUpdates: []
  }
}

// ── Date helpers (only used in IntelLog) ──
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

export default function IntelLog({acct,setAcct,apiKey,appData,setAppData}) {
  const [text,setText] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [result,setResult] = useState(null)
  const [showDate,setShowDate] = useState(false)
  const [customDate,setCustomDate] = useState('')
  const [search,setSearch] = useState('')
  const [typeFilter,setTypeFilter] = useState('All')
  const [dateFrom,setDateFrom] = useState('')
  const [dateTo,setDateTo] = useState('')
  const [expandedEntry,setExpandedEntry] = useState(null)
  const [uploadedFile,setUploadedFile] = useState(null)
  const [fileLoading,setFileLoading] = useState(false)
  const [fileError2,setFileError2] = useState('')
  const [fileStatus,setFileStatus] = useState('')
  const [dragOver,setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const [pendingParsed, setPendingParsed] = useState(null)
  const [fuSelections, setFuSelections] = useState(new Set())
  const [fileCharCount, setFileCharCount] = useState(0)
  const [largeDocWarning, setLargeDocWarning] = useState(false)
  const [processingLong, setProcessingLong] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [fileIsDirectType, setFileIsDirectType] = useState(false)
  const [dateModalIsFile, setDateModalIsFile] = useState(false)
  const [pdfAnalysisMethod, setPdfAnalysisMethod] = useState('')
  const [pendingDate, setPendingDate] = useState('')
  const [retryStatus, setRetryStatus] = useState('')
  const [detectedCompanies, setDetectedCompanies] = useState([])
  const [generatingActionId, setGeneratingActionId] = useState(null)
  const [pendingActionFromIntel, setPendingActionFromIntel] = useState(null)
  const dismissedCompaniesRef = useRef(new Set())
  const [pendingTechSuggestions, setPendingTechSuggestions] = useState(null)
  const [techSugSelections, setTechSugSelections] = useState(new Set())
  const [pendingTechAiNotes, setPendingTechAiNotes] = useState(null)
  const [techAiNotesSels, setTechAiNotesSels] = useState(new Set())
  const lastIntelEntryIdRef = useRef(null)
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState(null)
  const [deleteCheckedFu, setDeleteCheckedFu] = useState(new Set())
  const [deleteCheckedTs, setDeleteCheckedTs] = useState(new Set())
  const [deleteCheckedCt, setDeleteCheckedCt] = useState(new Set())
  const [deleteCheckedTn, setDeleteCheckedTn] = useState(new Set())
  const [deleteToast, setDeleteToast] = useState('')
  const [pendingProjectUpdates, setPendingProjectUpdates] = useState(null)
  const [projUpdateChecked, setProjUpdateChecked] = useState({})
  const [newProjForms, setNewProjForms] = useState({})
  const [pendingIdentityConfirm, setPendingIdentityConfirm] = useState([])
  const [softWarn, setSoftWarn] = useState('')

  const maybeShowTechSuggestions = (parsed) => {
    const raw = (parsed.techStackSuggestions || []).filter(s =>
      s.confidence !== 'low' && s.vendor &&
      !s.vendor.toLowerCase().includes('guidepoint')
    )
    if (!raw.length) { maybeShowTechAiNotes(parsed); return }
    const withIds = raw.map(s => ({...s, _id: uid()}))
    const defaultSel = new Set()
    withIds.forEach(s => {
      const alreadyExists = (acct.techStack||[]).some(t =>
        t.vendor.toLowerCase().includes(s.vendor.toLowerCase()) ||
        s.vendor.toLowerCase().includes(t.vendor.toLowerCase())
      )
      if (s.confidence === 'high' && !alreadyExists) defaultSel.add(s._id)
    })
    setPendingTechSuggestions({suggestions: withIds, parsed})
    setTechSugSelections(defaultSel)
  }

  const maybeShowTechAiNotes = (parsed) => {
    if (!parsed) return
    const rawUpdates = (parsed.techStackUpdates || []).filter(u => u.vendor && u.aiNotesUpdate)
    if (!rawUpdates.length) { maybeShowProjectUpdates(parsed); return }
    const updates = rawUpdates.map(u => {
      const match = (acct.techStack||[]).find(t =>
        t.vendor.toLowerCase().includes(u.vendor.toLowerCase()) ||
        u.vendor.toLowerCase().includes(t.vendor.toLowerCase())
      )
      return {...u, _id: uid(), matchedEntry: match || null}
    }).filter(u => u.matchedEntry)
    if (!updates.length) { maybeShowProjectUpdates(parsed); return }
    setPendingTechAiNotes({updates, parsed})
    setTechAiNotesSels(new Set(updates.map(u => u._id)))
  }

  const maybeShowProjectUpdates = (parsed) => {
    if (!parsed?.projectUpdates?.length) return
    const activeProjStatuses = ['In Flight', 'In Discussion', 'Not Started', 'Stalled']
    const activeProjects = (acct.projects || []).filter(p => activeProjStatuses.includes(p.status))
    const matchProject = (updateName, updateVendor, projects) => {
      const nameLow = (updateName||'').toLowerCase().trim()
      const vendorLow = (updateVendor||'').toLowerCase().trim()
      if (!nameLow && !vendorLow) return null
      return projects.find(p => {
        const pName = (p.name||'').toLowerCase()
        const pVendor = (p.vendor||'').toLowerCase()
        const nameMatch = nameLow && (pName.includes(nameLow) || nameLow.includes(pName))
        const vendorMatch = vendorLow && pVendor && (pVendor.includes(vendorLow) || vendorLow.includes(pVendor))
        return nameMatch || vendorMatch
      }) || null
    }
    const updates = parsed.projectUpdates.map((u, idx) => ({...u, _idx: idx, matchedProject: matchProject(u.projectName, u.vendorName, activeProjects)}))
    const initChecked = {}
    updates.forEach((u, idx) => {
      initChecked[idx] = {stage:!!(u.suggestedStage), status:!!(u.suggestedStatus), closeDate:!!(u.suggestedCloseDate), revenue:!!(u.suggestedRevenue), waitingOn:!!(u.waitingOn), nextSteps:!!(u.nextSteps)}
    })
    const initForms = {}
    updates.forEach((u, idx) => {
      if (!u.matchedProject) initForms[idx] = {name:u.projectName||'', vendor:u.vendorName||'', status:u.suggestedStatus||'Not Started', category:''}
    })
    setPendingProjectUpdates({updates, parsed})
    setProjUpdateChecked(initChecked)
    setNewProjForms(initForms)
  }

  const detectCompanyMentions = (text) => {
    if (!text || !appData) return []
    const knownNames = new Set()
    ;(appData.accounts||[]).forEach(a=>{knownNames.add(a.name.toLowerCase());if(a.short)knownNames.add(a.short.toLowerCase())})
    ;(appData.whitespaceAccounts||[]).forEach(a=>knownNames.add(a.name.toLowerCase()))
    const skipWords = new Set(['guidepoint','guidepoint security','google','microsoft','amazon','aws','azure','optiv','10x','reliaquest','sailpoint','saviynt','cloudflare','wiz','abnormal','netspy','horizon','mandiant','qualys','anthropic','the company','the client','the account','our team'])
    const found = new Set()
    const re = /\b(?:at|for|covering|prospect(?:ing)?|account|customer|client|deal at|opportunity at|working with|talking to|meeting with|presenting to|demo(?:ing)? (?:to|for)|conversation with)\s+([A-Z][a-zA-Z0-9&](?:[a-zA-Z0-9&\s]{0,38}?))(?=\s+(?:is|was|has|have|will|the|a\b|an\b|to\b|for\b|and\b|but\b|they|their|,|\.|\?))/g
    let m
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim().replace(/\s+/g,' ')
      if (name.length > 3 && !knownNames.has(name.toLowerCase()) && !skipWords.has(name.toLowerCase()) && !dismissedCompaniesRef.current.has(name.toLowerCase())) {
        found.add(name)
      }
    }
    return [...found].slice(0,5)
  }

  const FILE_CHAR_LIMIT = 100000
  const MANUAL_CHAR_LIMIT = 60000

  const IMAGE_EXTS = ['png','jpg','jpeg','gif','webp']
  const TEXT_EXTS = ['txt','pdf','doc','docx','md']

  const loadPdfJs = () => new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; resolve(window.pdfjsLib) }
    script.onerror = () => reject(new Error('Failed to load PDF.js'))
    document.head.appendChild(script)
  })

  const loadMammoth = () => new Promise((resolve, reject) => {
    if (window.mammoth) { resolve(window.mammoth); return }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
    script.onload = () => resolve(window.mammoth)
    script.onerror = () => reject(new Error('Failed to load mammoth.js'))
    document.head.appendChild(script)
  })

  const resetFileState = () => {
    setUploadedFile(null); setPendingFile(null); setFileIsDirectType(false)
    setText(''); setFileError2(''); setFileStatus(''); setFileCharCount(0); setLargeDocWarning(false)
    setPdfAnalysisMethod(''); setPendingDate(''); setSoftWarn('')
  }

  const handleFile = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!IMAGE_EXTS.includes(ext) && !TEXT_EXTS.includes(ext)) {
      setFileError2('Unsupported file type. Use TXT, PDF, DOCX, MD, PNG, JPG, or WEBP.')
      return
    }
    setFileError2(''); setFileStatus('')

    if (ext === 'pdf') {
      if (file.size > 32 * 1024 * 1024) {
        setFileError2(`PDF too large (${(file.size/1024/1024).toFixed(1)}MB). Maximum size is 32MB.`)
        return
      }
      if (file.size > 20 * 1024 * 1024) {
        setFileStatus(`Large PDF detected (${(file.size/1024/1024).toFixed(1)}MB). Analysis may take longer.`)
      }
      setUploadedFile({name:file.name, size:file.size})
      setFileIsDirectType(true)
      setPendingFile(file)
      // Quick date scan from first 1000 bytes
      try {
        const headerText = await new Promise(resolve => {
          const r = new FileReader()
          r.onload = e => resolve(e.target.result||'')
          r.onerror = ()=>resolve('')
          r.readAsText(file.slice(0, 1000))
        })
        setCustomDate(detectDate(headerText)||'')
      } catch { setCustomDate('') }
      setDateModalIsFile(true)
      setShowDate(true)
    } else if (IMAGE_EXTS.includes(ext)) {
      if (file.size > 20 * 1024 * 1024) { setFileError2('File too large. Maximum size is 20MB.'); return }
      setUploadedFile({name:file.name, size:file.size})
      setFileIsDirectType(true)
      setPendingFile(file)
      setCustomDate('')
      setDateModalIsFile(true)
      setShowDate(true)
    } else if (ext==='docx'||ext==='doc') {
      if (file.size > 20 * 1024 * 1024) { setFileError2('File too large. Maximum size is 20MB.'); return }
      setFileLoading(true)
      setFileIsDirectType(false)
      setUploadedFile({name:file.name, size:file.size})
      try {
        const mammoth = await loadMammoth()
        const ab = await file.arrayBuffer()
        const result = await mammoth.extractRawText({arrayBuffer:ab})
        let extracted = result.value
        const rawLen = extracted.length
        setFileCharCount(rawLen)
        if (extracted.length > FILE_CHAR_LIMIT) {
          extracted = '[Note: This document was truncated to 100,000 characters for processing. Upload the remainder separately if needed.]\n\n' + extracted.slice(0, FILE_CHAR_LIMIT)
          setLargeDocWarning(true)
        }
        setText(extracted)
        setCustomDate(detectDate(extracted)||'')
        setDateModalIsFile(true)
        setShowDate(true)
      } catch(e) {
        setFileError2('DOCX extraction failed. Try a different format or copy-paste the content.')
        setUploadedFile(null)
      } finally { setFileLoading(false) }
    } else if (ext==='txt'||ext==='md') {
      if (file.size > 20 * 1024 * 1024) { setFileError2('File too large. Maximum size is 20MB.'); return }
      setFileLoading(true)
      setFileIsDirectType(false)
      setUploadedFile({name:file.name, size:file.size})
      try {
        let extracted = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=e=>resolve(e.target.result);r.onerror=reject;r.readAsText(file)})
        const rawLen = extracted.length
        setFileCharCount(rawLen)
        if (extracted.length > FILE_CHAR_LIMIT) {
          extracted = '[Note: This document was truncated to 100,000 characters for processing. Upload the remainder separately if needed.]\n\n' + extracted.slice(0, FILE_CHAR_LIMIT)
          setLargeDocWarning(true)
        }
        setText(extracted)
        setCustomDate(detectDate(extracted)||'')
        setDateModalIsFile(true)
        setShowDate(true)
      } catch(e) {
        setFileError2('Could not read file. Try copy-pasting the content.')
        setUploadedFile(null)
      } finally { setFileLoading(false) }
    }
  }

  const FILE_INTEL_PROMPT = (date, vendorCtx='') => `Analyze this document and extract intelligence for a cybersecurity sales rep at GuidePoint Security. Extract a MAXIMUM of 3 follow-up tasks. Write each task like a real human to-do list item — short, action-oriented, no corporate speak. The task field should be 3-8 words maximum, starting with a verb. Like: 'Call Rudy about NetSpy demo' or 'Send pricing to Jamie' or 'Schedule ThreatLocker intro call'. Put any extra context, background, or detail in the context field — NOT in the task title. Consolidate related actions into one task. Only include tasks that are genuinely important and time-sensitive. Skip anything vague or aspirational.\n\nReturn ONLY valid JSON. No markdown. No code fences. No commentary.\n{\n  "intelEntry":{"date":"${date}","type":"Call|Meeting|Email|Note|Document","participants":"string","summary":"2-3 sentences","insights":["string"],"risks":["string"],"opportunities":["string"]},\n  "newFollowUps":[{"contact":"first name and last name of most relevant contact","task":"3-8 words max, starts with a verb, reads like a sticky note (e.g. 'Follow up with Rudy on pricing', 'Schedule NetSpy demo', 'Send contract to legal')","priority":"Critical|High|Medium|Low","dueDate":"YYYY-MM-DD or empty","context":"1-2 sentences of background detail and context — this is where the longer explanation goes"}],\n  "contactUpdates":[{"name":"exact contact name","lastInteracted":"${date}","noteToAppend":"brief note about what was discussed — 1-2 sentences","suggestedRole":"new job title only if clearly stated or changed — empty string if no change","suggestedInfluence":"Executive Sponsor|Technical Gatekeeper|Financial Gatekeeper|Final Approval|Stakeholder|Risk Factor|Ally — empty string if no change","context":"one sentence explaining the role/influence change — empty string if no suggestion"}],\n  "techStackSuggestions":[{"vendor":"vendor name","products":"product or solution name if mentioned","category":"Endpoint / EDR|Identity / IAM|Cloud Security|SIEM / SOC|Email Security|Network / SASE|Data Security|GRC|Vulnerability Management|MDR|Pen Test / Red Team|IGA|PAM|Other","status":"Active|Evaluating|Replacing","context":"one sentence about what was said","confidence":"high|medium"}],\n  "techStackUpdates":[{"vendor":"exact vendor name matching tech stack","aiNotesUpdate":"exactly 3 sentences: (1) current state or recent activity with this vendor, (2) any changes concerns or opportunities, (3) next steps or outlook","bullets":["bullet 1","bullet 2","bullet 3"],"date":"${date}"}],\n  "projectUpdates":[{"projectName":"deal or project name if identifiable","vendorName":"vendor or solution name if mentioned","suggestedStage":"Awareness|NDA|Intro Call|Demo|POC|Scoping|Pricing|Legal|Procurement|PO Received|Deployed — most advanced stage clearly implied, or empty string","suggestedStatus":"In Discussion|In Flight|Stalled|Won|Not Started — only if clearly implied, or empty string","suggestedCloseDate":"YYYY-MM-DD only if client gave explicit date, or empty string","suggestedRevenue":"dollar amount if stated, or empty string","waitingOn":"what or who is blocking this deal, if mentioned — or empty string","nextSteps":"specific next actions mentioned for this deal — or empty string","note":"1-2 sentence summary of this project update — always populated","isNewProject":false,"confidence":"high|medium"}]\n}\n\nFor techStackSuggestions: only include vendors explicitly mentioned as used, evaluated, or replaced by THIS account. Do not include GuidePoint or GuidePoint Security. Do not include vendors mentioned only in passing with no account context. Minimum confidence: medium — skip low confidence suggestions.\n\nFor techStackUpdates: for each vendor/technology mentioned that relates to the account's security stack, extract an AI notes update. Only include vendors that have meaningful intel in this document — not just passing mentions. Keep the aiNotesUpdate factual and specific to this account.\n\nFor projectUpdates: extract updates about specific deals, projects, or initiatives. Look for stage progression signals (e.g. 'demo scheduled', 'in legal review', 'PO signed'), timeline mentions, blockers, next steps, and deal size. Set isNewProject:true if this appears to be a new opportunity not previously tracked. Only include if there is meaningful intel — skip vague passing mentions.${vendorCtx?'\n\nEXISTING VENDOR CONTEXT (use as background when writing new summaries so they reflect continuity and change over time):\n'+vendorCtx:''}`

  const runIdentityResolver = async (parsed, date) => {
    const names = (parsed.contactUpdates || []).map(u => u.name).filter(Boolean)
    const contacts = (acct.contacts || []).filter(c => c.name).map(c => ({id: c.id, name: c.name}))
    if (!names.length || !contacts.length) return parsed
    try {
      setRetryStatus('Resolving contacts…')
      const {data: rd} = await callClaudeWithRetry({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: 'You are a contact identity resolver. Given a list of existing contacts and newly extracted names, determine which extracted names refer to the same person as an existing contact. Account for: partial names (Rudy vs Rudy Montoya), nicknames, phonetic equivalents, alternate spellings, and initials. Return JSON only.',
        messages: [{role: 'user', content: `Existing contacts: ${JSON.stringify(contacts)}\nExtracted names: ${JSON.stringify(names)}\n\nFor each extracted name, return one of:\n- MATCH: {"extractedName":"...","matchedContactId":"...","matchedContactName":"...","confidence":"high"|"medium"}\n- NEW: {"extractedName":"...","confidence":"high"}\n\nReturn a JSON array only. No explanation.`}]
      }, null, null)
      setRetryStatus('')
      if (rd.error) return parsed
      const resolutions = extractStructuredAIResponse(rd)
      if (!Array.isArray(resolutions)) return parsed
      const updatedContactUpdates = []
      const newPendingConfirm = []
      for (const cu of (parsed.contactUpdates || [])) {
        const res = resolutions.find(r => r.extractedName === cu.name)
        if (!res) { updatedContactUpdates.push(cu); continue }
        if (res.matchedContactId && res.confidence === 'high') {
          updatedContactUpdates.push({...cu, name: res.matchedContactName})
        } else if (res.matchedContactId && res.confidence === 'medium') {
          newPendingConfirm.push({extractedName: cu.name, matchedContactId: res.matchedContactId, matchedContactName: res.matchedContactName, updateEntry: cu, date})
        } else {
          updatedContactUpdates.push(cu)
        }
      }
      if (newPendingConfirm.length) setPendingIdentityConfirm(prev => [...prev, ...newPendingConfirm])
      return {...parsed, contactUpdates: updatedContactUpdates}
    } catch {
      setRetryStatus('')
      return parsed
    }
  }

  const confirmIdentityYes = (item) => {
    const {matchedContactId, updateEntry, date} = item
    setAcct(prev => ({
      ...prev,
      contacts: (prev.contacts || []).map(c => {
        if (c.id !== matchedContactId) return c
        const note = updateEntry.noteToAppend
          ? (c.notes ? c.notes + ' | [' + date + ']: ' + updateEntry.noteToAppend : '[' + date + ']: ' + updateEntry.noteToAppend)
          : c.notes
        return {...c, lastInteracted: updateEntry.lastInteracted || c.lastInteracted, notes: note}
      })
    }))
    setPendingIdentityConfirm(prev => prev.filter(i => i.extractedName !== item.extractedName))
  }

  const confirmIdentityNo = (item) => {
    const {extractedName, date} = item
    setAcct(prev => {
      const alreadyUnknown = (prev.unknownMentions || []).some(m => m.name.toLowerCase() === extractedName.toLowerCase())
      if (alreadyUnknown) return prev
      return {
        ...prev,
        unknownMentions: [...(prev.unknownMentions || []), {
          id: uid(), name: extractedName, mentionedDate: date, context: '', sourceIntelId: lastIntelEntryIdRef.current
        }]
      }
    })
    setPendingIdentityConfirm(prev => prev.filter(i => i.extractedName !== item.extractedName))
  }

  const processDirectFile = async (date, forceFallback = false) => {
    if (loading) return
    if (!pendingFile) return
    const ext = pendingFile.name.split('.').pop().toLowerCase()
    const vendorCtx = (acct.techStack||[]).filter(t=>t.vendor&&(t.aiNotes||(t.aiNotesHistory||[]).length)).map(t=>{
      const hist=[...(t.aiNotesHistory||[])].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(h=>`[${h.date||'?'}] ${(h.text||h.summary||'').slice(0,300)}`).join('\n')
      const current=t.aiNotes?`[${t.aiNotesUpdatedAt||'current'}] ${t.aiNotes}`:'';
      return `${t.vendor}:\n${[hist,current].filter(Boolean).join('\n')}`
    }).join('\n\n')
    setLoading(true); setError(''); setResult(null); setSoftWarn(''); setProcessingLong(false)
    setPendingDate(date); setPdfAnalysisMethod('')
    const longTimer = setTimeout(()=>setProcessingLong(true), 30000)

    const finalizeResult = async (parsed, method) => {
      setPdfAnalysisMethod(method)
      const rp = await runIdentityResolver(parsed, date)
      if (rp.newFollowUps?.length) {
        const fuWithIds = rp.newFollowUps.map((fu,i)=>({...fu,_tempId:i}))
        setPendingParsed({parsed:{...rp,newFollowUps:fuWithIds},date})
        setFuSelections(new Set(fuWithIds.map(fu=>fu._tempId)))
      } else {
        commitSave(rp,date,new Set())
        setResult({followUps:0,contacts:rp.contactUpdates?.length||0,entry:!!rp.intelEntry,noFollowUps:true,notesUpdated:countNotesUpdated(rp)})
        maybeShowTechSuggestions(rp)
      }
      const _det = detectCompanyMentions(`${rp?.intelEntry?.participants||''} ${rp?.intelEntry?.summary||''}`)
      if (_det.length > 0) setDetectedCompanies(prev=>[...new Set([...prev,..._det])])
      setUploadedFile(null); setPendingFile(null); setFileIsDirectType(false)
    }

    const onStatus = msg => { if(msg) setRetryStatus(msg); else setRetryStatus('') }

    const callTextApi = async (inputText, method) => {
      const {data:d2} = await callClaudeWithRetry({
        model:'claude-sonnet-4-6', max_tokens:3000,
        system:'You are an account intelligence analyst for a cybersecurity sales rep at GuidePoint Security. Extract structured intel from input. Return only valid JSON. No markdown. No code fences. No commentary.',
        messages:[{role:'user',content:`${FILE_INTEL_PROMPT(date,vendorCtx)}\n\nDOCUMENT TEXT:\n${inputText}`}]
      }, null, onStatus)
      console.log(`[${method}] Claude API response:`, JSON.stringify(d2, null, 2))
      if (d2.error) throw new Error(`${d2.error.type}: ${d2.error.message}`)
      let parsed2 = extractStructuredAIResponse(d2)
      if (!parsed2) {
        if (import.meta.env.DEV) {
          console.error('IntelLog file parse failed', { responseShape: typeof d2, preview: String(d2?.content?.[0]?.text || '').slice(0, 500) })
        }
        parsed2 = await repairAIResponse(d2?.content?.[0]?.text || '', makeRepairPrompt(date))
      }
      if (!parsed2) throw new Error('Could not parse document analysis. Try pasting the content instead.')
      return parsed2
    }

    const pdfTextFallback = async () => {
      // Step 2: PDF.js extraction
      try {
        const pdfjsLib = await loadPdfJs()
        const ab = await pendingFile.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({data:ab}).promise
        let fullText = ''
        for (let i=1;i<=pdf.numPages;i++) { const pg=await pdf.getPage(i); const ct=await pg.getTextContent(); fullText+=ct.items.map(it=>it.str).join(' ')+'\n' }
        if (fullText.trim().length > 50) {
          let txt = fullText.length > FILE_CHAR_LIMIT ? '[Truncated]\n\n'+fullText.slice(0,FILE_CHAR_LIMIT) : fullText
          const parsed = await callTextApi(txt, 'PDF.js')
          await finalizeResult(parsed, 'Text extraction (PDF.js)')
          return true
        }
      } catch(e2) { console.log('[PDF.js fallback error]', e2.message) }
      // Step 3: plain text read
      try {
        const pt = await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result||'');r.onerror=rej;r.readAsText(pendingFile)})
        if (pt.trim().length > 50) {
          let txt = pt.length > FILE_CHAR_LIMIT ? '[Truncated]\n\n'+pt.slice(0,FILE_CHAR_LIMIT) : pt
          const parsed = await callTextApi(txt, 'PlainText')
          await finalizeResult(parsed, 'Plain text read')
          return true
        }
      } catch(e3) { console.log('[Plain text fallback error]', e3.message) }
      return false
    }

    try {
      if (ext === 'image' || IMAGE_EXTS.includes(ext)) {
        // Image: direct vision API only
        const b64raw = await new Promise(resolve=>{const r=new FileReader();r.onload=e=>resolve(e.target.result);r.readAsDataURL(pendingFile)})
        const cleanBase64 = b64raw.includes(',') ? b64raw.split(',')[1] : b64raw
        const {data} = await callClaudeWithRetry({
          model:'claude-sonnet-4-6', max_tokens:2500,
          messages:[{role:'user',content:[
            {type:'image',source:{type:'base64',media_type:pendingFile.type||'image/jpeg',data:cleanBase64}},
            {type:'text',text:FILE_INTEL_PROMPT(date,vendorCtx)}
          ]}]
        }, null, onStatus)
        console.log('[Image] Claude API response:', JSON.stringify(data, null, 2))
        console.log('[Image] Error details:', data.error)
        if (data.error) throw new Error(`${data.error.type}: ${data.error.message}`)
        let parsedImg = extractStructuredAIResponse(data)
        if (!parsedImg) {
          if (import.meta.env.DEV) {
            console.error('IntelLog image parse failed', { responseShape: typeof data, preview: String(data?.content?.[0]?.text || '').slice(0, 500) })
          }
          parsedImg = await repairAIResponse(data?.content?.[0]?.text || '', makeRepairPrompt(date))
        }
        if (!parsedImg) throw new Error('Could not parse image analysis. Please try again.')
        await finalizeResult(parsedImg, 'Direct image')
      } else if (ext === 'pdf') {
        if (forceFallback) {
          // Retry: skip direct API, go straight to text extraction
          const ok = await pdfTextFallback()
          if (!ok) throw new Error('All extraction methods failed for this PDF.')
        } else {
          // Step 1: try direct PDF API
          let directFailed = false
          try {
            const b64raw = await new Promise(resolve=>{const r=new FileReader();r.onload=e=>resolve(e.target.result);r.readAsDataURL(pendingFile)})
            const cleanBase64 = b64raw.includes(',') ? b64raw.split(',')[1] : b64raw
            if (cleanBase64.length > 6700000) throw new Error('PDF_TOO_LARGE_FOR_API')
            const {data} = await callClaudeWithRetry({
              model:'claude-sonnet-4-6', max_tokens:3000,
              messages:[{role:'user',content:[
                {type:'document',source:{type:'base64',media_type:'application/pdf',data:cleanBase64}},
                {type:'text',text:FILE_INTEL_PROMPT(date,vendorCtx)}
              ]}]
            }, null, onStatus)
            console.log('[Direct PDF] Claude API response:', JSON.stringify(data, null, 2))
            console.log('[Direct PDF] Error details:', data.error)
            if (data.error) { directFailed = true; console.log('[Direct PDF] Falling back — error:', data.error.type, data.error.message) }
            else {
              let parsedPdf = extractStructuredAIResponse(data)
              if (!parsedPdf) {
                parsedPdf = await repairAIResponse(data?.content?.[0]?.text || '', makeRepairPrompt(date))
              }
              if (!parsedPdf) { directFailed = true; console.log('[Direct PDF] Could not parse response') }
              else await finalizeResult(parsedPdf, 'Direct PDF')
            }
          } catch(e1) { directFailed = true; console.log('[Direct PDF] Falling back — exception:', e1.message) }
          // Fallback chain if direct failed
          if (directFailed) {
            const ok = await pdfTextFallback()
            if (!ok) throw new Error('All extraction methods failed. Try a different PDF or copy-paste the text.')
          }
        }
      }
    } catch(e) {
      const msg = e.message||'Processing failed.'
      if (msg==='OVERLOADED') setError('Anthropic API is busy right now. Please wait 30 seconds and try again.')
      else setError(msg.includes(':') ? `Analysis failed: ${msg}` : `Could not analyze this file. ${msg}`)
    } finally { clearTimeout(longTimer); setProcessingLong(false); setRetryStatus('') }
    setLoading(false)
  }

  const countNotesUpdated = (parsed) => {
    if (!parsed.contactUpdates?.length) return 0
    return parsed.contactUpdates.filter(u=>
      u.noteToAppend && u.name &&
      (acct.contacts||[]).some(c=>c.name.toLowerCase().includes(u.name.split(' ')[0].toLowerCase()))
    ).length
  }

  const commitSave = (parsed, date, selectedFuTempIds) => {
    const intelEntryId = uid()
    lastIntelEntryIdRef.current = intelEntryId
    setAcct(prev=>{
      let next={...prev}
      if (parsed.intelEntry) {
        next.intelLog=[{...parsed.intelEntry,id:intelEntryId},...(prev.intelLog||[])]
        next.lastContact=date
        const entry=parsed.intelEntry
        const names=(entry.participants||'').split(/[+,&]/).map(n=>n.trim()).filter(n=>n&&!n.toLowerCase().startsWith('mike'))
        const contactName=names[0]||(entry.participants||'').split(/[+,&]/)[0]?.trim()||''
        const topics=(entry.insights||[]).slice(0,2).join('; ').slice(0,120)
        const firstSentence=(entry.summary||'').split(/(?<=[.!?])\s/)[0]||''
        next.interactions=[...(prev.interactions||[]),{id:uid(),contact:contactName,type:entry.type||'Note',date:entry.date,topics,summary:firstSentence}]
      }
      if (parsed.newFollowUps?.length&&selectedFuTempIds.size) {
        const toAdd=parsed.newFollowUps.filter(fu=>selectedFuTempIds.has(fu._tempId)).map(({_tempId,...rest})=>({...rest,id:uid(),status:'Open',sourceIntelId:intelEntryId}))
        if(toAdd.length) next.followUps=[...(prev.followUps||[]),...toAdd]
      }
      if (parsed.contactUpdates?.length) {
        next.contacts=(prev.contacts||[]).map(c=>{const u=parsed.contactUpdates.find(u=>u.name&&c.name.toLowerCase().includes(u.name.split(' ')[0].toLowerCase()));return u?{...c,lastInteracted:u.lastInteracted||c.lastInteracted,notes:u.noteToAppend?(c.notes?c.notes+' | ['+date+']: '+u.noteToAppend:'['+date+']: '+u.noteToAppend):c.notes}:c})
        const existFn=(prev.contacts||[]).map(c=>c.name.split(' ')[0].toLowerCase())
        const newUnknowns=parsed.contactUpdates.filter(u=>u.name&&!existFn.some(fn=>u.name.toLowerCase().includes(fn))).map(u=>({id:uid(),name:u.name,mentionedDate:date,context:'',sourceIntelId:intelEntryId})).filter(u=>!(prev.unknownMentions||[]).some(m=>m.name.toLowerCase()===u.name.toLowerCase()))
        if(newUnknowns.length) next.unknownMentions=[...(prev.unknownMentions||[]),...newUnknowns]
        // Upsert contactSuggestions — one per contact, always most recent
        const existSugs=[...(prev.contactSuggestions||[])]
        parsed.contactUpdates.forEach(u=>{
          if(!u.suggestedRole&&!u.suggestedInfluence)return
          const fn=u.name?.split(' ')[0]?.toLowerCase()
          if(!fn)return
          const existIdx=existSugs.findIndex(s=>s.contactName.toLowerCase().includes(fn)||fn.includes(s.contactName.split(' ')[0].toLowerCase()))
          const newSug={id:uid(),contactName:u.name,suggestedRole:u.suggestedRole||'',suggestedInfluence:u.suggestedInfluence||'',context:u.context||'',lastUpdated:date}
          if(existIdx>=0){
            const ex=existSugs[existIdx]
            const ctx=u.context?(ex.context?(ex.context+' | '+u.context).slice(0,200):u.context):ex.context
            existSugs[existIdx]={...newSug,id:ex.id,context:ctx}
          } else {
            existSugs.push(newSug)
          }
        })
        next.contactSuggestions=existSugs
      }
      return next
    })
  }

  const process = async (date, textOverride) => {
    if (loading) return
    const inputText = textOverride !== undefined ? textOverride : text
    if (!uploadedFile && !fileIsDirectType && inputText.length > MANUAL_CHAR_LIMIT) {
      setError('This transcript exceeds the current 60,000 character limit.')
      return
    }
    const SAFE_CHAR_LIMIT = 18000
    const promptInput = inputText.length > SAFE_CHAR_LIMIT
      ? inputText.slice(0, 12000) + '\n\n[...transcript truncated — including end of transcript...]\n\n' + inputText.slice(-6000)
      : inputText
    const vendorCtx = (acct.techStack||[]).filter(t=>t.vendor&&(t.aiNotes||(t.aiNotesHistory||[]).length)).map(t=>{
      const hist=[...(t.aiNotesHistory||[])].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(h=>`[${h.date||'?'}] ${(h.text||h.summary||'').slice(0,300)}`).join('\n')
      const current=t.aiNotes?`[${t.aiNotesUpdatedAt||'current'}] ${t.aiNotes}`:'';
      return `${t.vendor}:\n${[hist,current].filter(Boolean).join('\n')}`
    }).join('\n\n')
    setLoading(true);setError('');setResult(null);setSoftWarn('');setProcessingLong(false);setRetryStatus('')
    const longTimer = setTimeout(()=>setProcessingLong(true), 30000)
    try {
      const {data} = await callClaudeWithRetry({
        model:'claude-sonnet-4-6',max_tokens:3000,
        system:'You are an account intelligence analyst for a cybersecurity sales rep at GuidePoint Security. Extract structured intel from input. Return only valid JSON. No markdown. No code fences. No commentary. Max 5 items per insights/risks/opportunities arrays.',
        messages:[{role:'user',content:`Extract intelligence and return JSON:

FOLLOW-UP RULES: Extract a MAXIMUM of 3 follow-up tasks. Write each task like a real human to-do list item — short, action-oriented, no corporate speak. The task field should be 3-8 words maximum, starting with a verb. Like: 'Call Rudy about NetSpy demo' or 'Send pricing to Jamie' or 'Schedule ThreatLocker intro call'. Put any extra context, background, or detail in the context field — NOT in the task title. Consolidate related actions into one task. Only include tasks that are genuinely important and time-sensitive. Skip anything vague or aspirational.

{
  "intelEntry":{"date":"${date}","type":"Call|Meeting|Email|Note","participants":"string","summary":"2-3 sentences","insights":["string"],"risks":["string"],"opportunities":["string"]},
  "newFollowUps":[{"contact":"first name and last name of most relevant contact","task":"3-8 words max, starts with a verb, reads like a sticky note (e.g. 'Follow up with Rudy on pricing', 'Schedule NetSpy demo', 'Send contract to legal')","priority":"Critical|High|Medium|Low","dueDate":"YYYY-MM-DD or empty","context":"1-2 sentences of background detail and context — this is where the longer explanation goes"}],
  "contactUpdates":[{"name":"exact contact name","lastInteracted":"${date}","noteToAppend":"brief note about what was discussed — 1-2 sentences","suggestedRole":"new job title only if clearly stated or changed — empty string if no change","suggestedInfluence":"Executive Sponsor|Technical Gatekeeper|Financial Gatekeeper|Final Approval|Stakeholder|Risk Factor|Ally — empty string if no change","context":"one sentence explaining the role/influence change — empty string if no suggestion"}],
  "techStackSuggestions":[{"vendor":"vendor name","products":"product or solution name if mentioned","category":"Endpoint / EDR|Identity / IAM|Cloud Security|SIEM / SOC|Email Security|Network / SASE|Data Security|GRC|Vulnerability Management|MDR|Pen Test / Red Team|IGA|PAM|Other","status":"Active|Evaluating|Replacing","context":"one sentence about what was said","confidence":"high|medium"}],
  "techStackUpdates":[{"vendor":"exact vendor name matching tech stack","aiNotesUpdate":"exactly 3 sentences: (1) current state or recent activity with this vendor, (2) any changes concerns or opportunities, (3) next steps or outlook","bullets":["bullet 1","bullet 2","bullet 3"],"date":"${date}"}],
  "projectUpdates":[{"projectName":"deal or project name if identifiable","vendorName":"vendor or solution name if mentioned","suggestedStage":"Awareness|NDA|Intro Call|Demo|POC|Scoping|Pricing|Legal|Procurement|PO Received|Deployed — most advanced stage clearly implied, or empty string","suggestedStatus":"In Discussion|In Flight|Stalled|Won|Not Started — only if clearly implied, or empty string","suggestedCloseDate":"YYYY-MM-DD only if client gave explicit date, or empty string","suggestedRevenue":"dollar amount if stated, or empty string","waitingOn":"what or who is blocking this deal, if mentioned — or empty string","nextSteps":"specific next actions mentioned for this deal — or empty string","note":"1-2 sentence summary of this project update — always populated","isNewProject":false,"confidence":"high|medium"}]
}

For techStackSuggestions: only include vendors explicitly mentioned as used, evaluated, or replaced by THIS account. Do not include GuidePoint or GuidePoint Security. Do not include vendors mentioned only in passing with no account context. Minimum confidence: medium — skip low confidence suggestions.

For techStackUpdates: for each vendor/technology mentioned that relates to the account's security stack, extract an AI notes update. Only include vendors with meaningful intel — not just passing mentions. Keep it factual and specific to this account.

For projectUpdates: extract updates about specific deals, projects, or initiatives. Look for stage progression signals (e.g. 'demo scheduled', 'in legal review', 'PO signed'), timeline mentions, blockers, next steps, and deal size. Set isNewProject:true if this appears to be a new opportunity not previously tracked. Only include if there is meaningful intel — skip vague passing mentions.${vendorCtx?'\n\nEXISTING VENDOR CONTEXT:\n'+vendorCtx:''}

INPUT:
${promptInput}`}]
      }, null, msg=>{if(msg)setRetryStatus(msg);else setRetryStatus('')})
      if (data.error) throw new Error(data.error.message==='OVERLOADED'?'OVERLOADED':data.error.message)
      let parsed = extractStructuredAIResponse(data)
      if (!parsed) {
        if (import.meta.env.DEV) {
          const preview = String(data?.content?.[0]?.text || '').slice(0, 500)
          console.error('IntelLog parse failed', { responseShape: typeof data, preview })
        }
        parsed = await repairAIResponse(data?.content?.[0]?.text || '', makeRepairPrompt(date))
      }
      if (!parsed) {
        parsed = createFallbackEntry(promptInput, date)
        setSoftWarn('AI returned an imperfect format, so Ledgr saved the transcript as a basic intel entry.')
      }
      const rp = await runIdentityResolver(parsed, date)
      if (rp.newFollowUps?.length) {
        const fuWithIds=rp.newFollowUps.map((fu,i)=>({...fu,_tempId:i}))
        setPendingParsed({parsed:{...rp,newFollowUps:fuWithIds},date})
        setFuSelections(new Set(fuWithIds.map(fu=>fu._tempId)))
      } else {
        commitSave(rp,date,new Set())
        setResult({followUps:0,contacts:rp.contactUpdates?.length||0,entry:!!rp.intelEntry,noFollowUps:true,notesUpdated:countNotesUpdated(rp)})
        maybeShowTechSuggestions(rp)
      }
      setText('')
      setUploadedFile(null)
      setFileCharCount(0)
      setLargeDocWarning(false)
      const _det2 = detectCompanyMentions(`${inputText} ${rp?.intelEntry?.participants||''} ${rp?.intelEntry?.summary||''}`)
      if (_det2.length > 0) setDetectedCompanies(prev=>[...new Set([...prev,..._det2])])
    } catch(e) {
      const msg = e.message||''
      setError(msg==='OVERLOADED'?'Anthropic API is busy right now. Please wait 30 seconds and try again.':'Error: '+(msg||'Processing failed. Please try again.'))
    } finally { clearTimeout(longTimer); setProcessingLong(false); setRetryStatus('') }
    setLoading(false)
  }

  const handleProcess = () => {
    if (fileIsDirectType && pendingFile) {
      setDateModalIsFile(true)
      setShowDate(true)
    } else {
      setDateModalIsFile(false)
      const detected = detectDate(text)
      setCustomDate(detected || '')
      setShowDate(true)
    }
  }

  const generateActionFromIntel = async (entry) => {
    setGeneratingActionId(entry.id)
    const today = new Date().toISOString().split('T')[0]
    const contacts = (acct.contacts||[]).map(c=>`${c.name} (${c.title||'?'})`).join(', ')
    const projects = (acct.projects||[]).filter(p=>p.status!=='Lost').map(p=>`${p.name} [${p.status}]`).join(', ')
    const prompt = `You are an AI assistant for a cybersecurity sales CRM at GuidePoint Security. Generate a specific action item from this intel entry.

ACCOUNT: ${acct.name}
CONTACTS: ${contacts||'none'}
ACTIVE PROJECTS: ${projects||'none'}

INTEL ENTRY:
Date: ${entry.date||'?'}
Type: ${entry.type||'Note'}
Participants: ${entry.participants||'none'}
Summary: ${entry.summary||''}
Insights: ${(entry.insights||[]).join('; ')||'none'}
Risks: ${(entry.risks||[]).join('; ')||'none'}
Opportunities: ${(entry.opportunities||[]).join('; ')||'none'}

Today is ${today}. Generate a concrete action item from this intel. Return ONLY valid JSON. No markdown. No code fences. No commentary.
{
  "task": "3-8 word action item starting with a strong verb — reads like a sticky note",
  "priority": "Critical|High|Medium|Low",
  "dueDate": "YYYY-MM-DD (7-14 days out for High/Critical, blank for Low)",
  "contact": "first and last name of most relevant contact from this intel",
  "quickContext": "one sentence — why this action matters right now",
  "recommendedNextAction": "specific next step starting with a strong verb, names person or channel",
  "suggestedRecipients": {
    "to": ["Name (Title)"],
    "cc": []
  },
  "draftEmail": {
    "subject": "specific subject — reference the account or deal, not generic",
    "to": ["Name or Name (Title)"],
    "cc": [],
    "body": "3-5 lines, conversational, no filler opener, clear CTA, sign off: Best, Mike. Use \\n for line breaks."
  }
}

Rules:
- task should name the person and action: 'Call Rudy about NetSpy demo' not 'Follow up with stakeholder'
- draftEmail body has NO filler opener ('Hope this finds you well' etc.), one clear ask, human tone`

    try {
      const {data} = await callClaudeWithRetry(
        {model:'claude-sonnet-4-6', max_tokens:700, messages:[{role:'user',content:prompt}]},
        null, null
      )
      if (data.error) throw new Error(data.error.message || 'API error')
      let parsedAction = extractStructuredAIResponse(data)
      if (!parsedAction) {
        if (import.meta.env.DEV) {
          console.error('IntelLog action parse failed', { responseShape: typeof data, preview: String(data?.content?.[0]?.text || '').slice(0, 500) })
        }
        parsedAction = await repairAIResponse(data?.content?.[0]?.text || '', 'Convert this content into valid JSON with fields: task, priority, dueDate, contact, quickContext, recommendedNextAction, suggestedRecipients, draftEmail. Return only valid JSON. No markdown. No code fences. No commentary.')
      }
      if (parsedAction) {
        setPendingActionFromIntel({...parsedAction, _sourceEntryId: entry.id, _today: today})
      } else {
        setError('Could not generate action. Please try again.')
      }
    } catch(err) {
      setError(err.message==='OVERLOADED'?'API busy — try again in a moment.':'Action generation failed. Please try again.')
    } finally {
      setGeneratingActionId(null)
    }
  }

  const handleDeleteIntelEntry = (entryId) => {
    const linkedFollowUps = (acct.followUps || []).filter(f => f.sourceIntelId === entryId)
    const linkedTechStack = (acct.techStack || []).filter(t => t.sourceIntelId === entryId)
    const linkedContacts = (acct.contacts || []).filter(c => c.sourceIntelId === entryId)
    const linkedTechAiNotes = (acct.techStack || []).filter(t => t.aiNotesSourceIntelId === entryId)
    const hasLinked = linkedFollowUps.length || linkedTechStack.length || linkedContacts.length || linkedTechAiNotes.length
    if (!hasLinked) {
      if (!window.confirm('Delete this intel entry? This cannot be undone.')) return
      const entry = acct.intelLog.find(e => e.id === entryId)
      executeCascadeDelete({entryId, entry, linkedFollowUps:[], linkedTechStack:[], linkedContacts:[], linkedTechAiNotes:[]}, new Set(), new Set(), new Set(), new Set())
      return
    }
    const entry = acct.intelLog.find(e => e.id === entryId)
    setPendingDeleteEntry({entryId, entry, linkedFollowUps, linkedTechStack, linkedContacts, linkedTechAiNotes})
    setDeleteCheckedFu(new Set(linkedFollowUps.map(f => f.id)))
    setDeleteCheckedTs(new Set(linkedTechStack.map(t => t.id)))
    setDeleteCheckedCt(new Set(linkedContacts.map(c => c.id)))
    setDeleteCheckedTn(new Set(linkedTechAiNotes.map(t => t.id)))
  }

  const executeCascadeDelete = async (info, checkedFu, checkedTs, checkedCt, checkedTn) => {
    const {entryId, linkedFollowUps, linkedTechStack, linkedContacts, linkedTechAiNotes} = info
    const updatedIntelLog = (acct.intelLog || []).filter(e => e.id !== entryId)
    const updatedFollowUps = (acct.followUps || []).filter(f => !checkedFu.has(f.id))
    const updatedContacts = (acct.contacts || []).filter(c => !checkedCt.has(c.id))
    const updatedTechStack = (acct.techStack || [])
      .filter(t => !checkedTs.has(t.id))
      .map(t => checkedTn.has(t.id) ? {...t, aiNotes:'', aiNotesUpdatedAt:'', aiNotesSourceIntelId:''} : t)
    const updatedProjects = (acct.projects || [])
    const updatedAcct = {...acct, intelLog:updatedIntelLog, followUps:updatedFollowUps, techStack:updatedTechStack, contacts:updatedContacts, projects:updatedProjects}
    setAcct(updatedAcct)
    const updatedAccounts = (appData.accounts || []).map(a => a.id === acct.id ? updatedAcct : a)
    const updatedData = {...appData, accounts: updatedAccounts}
    setAppData(updatedData)
    setPendingDeleteEntry(null)
    const removedCount = checkedFu.size + checkedTs.size + checkedCt.size + checkedTn.size
    setDeleteToast(`Intel entry deleted${removedCount > 0 ? ` — ${removedCount} linked item${removedCount!==1?'s':''} removed` : ''}`)
    setTimeout(() => setDeleteToast(''), 4000)
    try {
      window._lastDirectSave = Date.now()
      const { error } = await supabase
        .from('accounts')
        .upsert({ id: 'user-data', data: updatedData, updated_at: new Date().toISOString() })
      if (error) throw error
      console.log('Intel entry and linked items deleted:', entryId)
    } catch (err) {
      console.error('Delete save failed:', err)
    }
  }

  const exportIntel = () => {
    const lines=acct.intelLog.map(e=>[
      `${e.date||''} | ${e.type||'Note'} | ${e.participants||''}`,
      e.summary||'',
      (e.insights||[]).length?'Insights: '+(e.insights||[]).join('; '):'',
      (e.risks||[]).length?'Risks: '+(e.risks||[]).join('; '):'',
      (e.opportunities||[]).length?'Opportunities: '+(e.opportunities||[]).join('; '):'',
      '---'
    ].filter(Boolean).join('\n'))
    const blob=new Blob([lines.join('\n\n')],{type:'text/plain'})
    const a=document.createElement('a')
    a.href=URL.createObjectURL(blob)
    a.download=`intel-log-${(acct.short||acct.name||'export').replace(/[^a-z0-9]/gi,'-')}.txt`
    a.click()
  }

  const filtered=acct.intelLog.filter(e=>{
    if(typeFilter!=='All'&&e.type!==typeFilter)return false
    if(dateFrom&&e.date<dateFrom)return false
    if(dateTo&&e.date>dateTo)return false
    if(search.trim()){
      const q=search.toLowerCase()
      const hay=[e.summary,e.participants,...(e.insights||[]),...(e.risks||[]),...(e.opportunities||[])].filter(Boolean).join(' ').toLowerCase()
      if(!hay.includes(q))return false
    }
    return true
  })

  const hasFilters=!!(search.trim()||typeFilter!=='All'||dateFrom||dateTo)
  const clearFilters=()=>{setSearch('');setTypeFilter('All');setDateFrom('');setDateTo('')}

  const typeBadge={Call:{bg:'#EBF4FF',c:'#0066CC'},Meeting:{bg:'#ede9fe',c:'#7c3aed'},Email:{bg:'#fef9c3',c:'#a16207'},Note:{bg:'#F9FAFB',c:'#6B7280'}}

  return (
    <div>
      <style>{`@keyframes ilSpin{to{transform:rotate(360deg)}}`}</style>

      {/* ─── WHITESPACE DETECTION BANNER ─── */}
      {detectedCompanies.length>0&&(
        <div style={{marginBottom:12,padding:'12px 14px',background:'rgba(234,179,8,0.08)',border:'1px solid rgba(234,179,8,0.3)',borderRadius:8}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div style={{fontSize:13,fontWeight:700,color:S.yellow}}>Companies mentioned that aren't in your CRM — add to Whitespace?</div>
            <button onClick={()=>setDetectedCompanies([])} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:18,lineHeight:1,padding:'0 4px'}}>×</button>
          </div>
          {detectedCompanies.map(name=>(
            <div key={name} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span style={{fontSize:12,color:S.txt,flex:1}}>{name}</span>
              <button onClick={()=>{if(!setAppData)return;const now=new Date().toISOString();setAppData(prev=>({...prev,whitespaceAccounts:[...(prev.whitespaceAccounts||[]),{id:uid(),name,hq:'',industry:'',employees:'',revenue:'',status:'Prospect',contacts:[],technologies:[],notes:[],intelLog:[],addedAt:now,updatedAt:now}]}));dismissedCompaniesRef.current.add(name.toLowerCase());setDetectedCompanies(prev=>prev.filter(n=>n!==name))}}
                style={{fontSize:11,color:'#fff',background:'#d97706',border:'none',borderRadius:5,padding:'3px 10px',cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>+ Add to Whitespace</button>
              <button onClick={()=>{dismissedCompaniesRef.current.add(name.toLowerCase());setDetectedCompanies(prev=>prev.filter(n=>n!==name))}}
                style={{background:'transparent',border:'none',color:S.muted,cursor:'pointer',fontSize:14,lineHeight:1,padding:'0 2px'}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ─── ADD INTELLIGENCE PANEL ─── */}
      <div style={{background:'#ffffff',borderRadius:12,border:'1px solid #e2e8f0',boxShadow:'0 1px 3px rgba(0,0,0,0.06)',padding:20,marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <div style={{fontSize:15,fontWeight:700,color:'#111827'}}>Add Intelligence</div>
          {!fileIsDirectType&&<span style={{fontSize:11,color:'#94a3b8'}}>{text.length.toLocaleString()} / {uploadedFile?FILE_CHAR_LIMIT.toLocaleString():MANUAL_CHAR_LIMIT.toLocaleString()}</span>}
        </div>
        <div style={{fontSize:12,color:'#64748b',marginBottom:12,lineHeight:1.5}}>Paste a call transcript, meeting notes, or upload a file. AI extracts follow-ups, updates contacts, and logs intel automatically.</div>
        {/* Textarea — hidden when PDF or image is loaded */}
        {!fileIsDirectType&&(
          <>
            <textarea
              value={text}
              onChange={e=>{setText(e.target.value);setLargeDocWarning(false);setFileCharCount(0)}}
              rows={7}
              placeholder={'Paste transcript, meeting notes, email, or a quick note here…\n\n"Talked to the security architect today. Wiz demo confirmed for Wednesday. The CISO reached back about Palo Alto pricing — wants a decision by June…"'}
              style={{width:'100%',boxSizing:'border-box',background:'#ffffff',border:`1px solid ${!uploadedFile&&text.length>MANUAL_CHAR_LIMIT?'#fca5a5':'#e2e8f0'}`,borderRadius:8,fontSize:13,color:'#111827',padding:12,resize:'vertical',minHeight:160,fontFamily:'inherit',lineHeight:1.6,outline:'none',display:'block'}}
              onFocus={e=>{e.target.style.borderColor=!uploadedFile&&text.length>MANUAL_CHAR_LIMIT?'#ef4444':'#007AFF';e.target.style.boxShadow=`0 0 0 3px ${!uploadedFile&&text.length>MANUAL_CHAR_LIMIT?'rgba(239,68,68,0.1)':'rgba(37,99,235,0.1)'}`}}
              onBlur={e=>{e.target.style.borderColor=!uploadedFile&&text.length>MANUAL_CHAR_LIMIT?'#fca5a5':'#EEEFF2';e.target.style.boxShadow='none'}}
            />
            <div style={{textAlign:'right',fontSize:11,color:text.length>MANUAL_CHAR_LIMIT?'#dc2626':text.length>MANUAL_CHAR_LIMIT*0.95?'#dc2626':text.length>MANUAL_CHAR_LIMIT*0.8?'#ea580c':'#94a3b8',marginTop:4,marginBottom:!uploadedFile&&text.length>MANUAL_CHAR_LIMIT?4:12}}>{text.length.toLocaleString()} / {uploadedFile?FILE_CHAR_LIMIT.toLocaleString():'60,000 characters max'}</div>
            {!uploadedFile&&text.length>MANUAL_CHAR_LIMIT&&(
              <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#dc2626',marginBottom:12}}>
                This transcript exceeds the current 60,000 character limit.
              </div>
            )}
          </>
        )}
        {/* PDF / image file preview card */}
        {fileIsDirectType&&uploadedFile&&(
          <div style={{background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'14px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:14}}>
            <div style={{fontSize:32,flexShrink:0,lineHeight:1}}>{uploadedFile.name.endsWith('.pdf')?'📄':'🖼️'}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:'#1e40af',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{uploadedFile.name}</div>
              <div style={{fontSize:11,color:'#3b82f6',marginTop:2}}>{(uploadedFile.size/1024).toFixed(0)} KB · Ready to analyze with AI</div>
              <div style={{fontSize:11,color:'#64748b',marginTop:3}}>{uploadedFile.name.endsWith('.pdf')?'PDF will be analyzed directly by AI — no text extraction needed':'Image will be analyzed directly by AI'}</div>
            </div>
            <button onClick={e=>{e.stopPropagation();resetFileState()}} style={{background:'none',border:'none',color:'#60a5fa',cursor:'pointer',fontSize:18,lineHeight:1,padding:0,flexShrink:0}}>×</button>
          </div>
        )}
        {/* File upload zone — always visible when no file loaded */}
        {!uploadedFile&&(
          <div
            onDragOver={e=>{e.preventDefault();setDragOver(true)}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)handleFile(f)}}
            onClick={()=>!fileLoading&&fileInputRef.current?.click()}
            style={{border:`2px dashed ${dragOver?'#007AFF':'#D1D5DB'}`,borderRadius:8,padding:20,textAlign:'center',background:dragOver?'#EBF4FF':'#F9FAFB',cursor:fileLoading?'default':'pointer',marginBottom:8,transition:'all 0.15s'}}>
            <input ref={fileInputRef} type='file' accept='.txt,.pdf,.doc,.docx,.md,.png,.jpg,.jpeg,.gif,.webp' style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value=''}}/>
            {fileLoading?(
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:13,color:'#64748b'}}>
                <span style={{display:'inline-block',width:14,height:14,border:'2px solid #cbd5e1',borderTop:'2px solid #2563eb',borderRadius:'50%',animation:'ilSpin 0.75s linear infinite',flexShrink:0}}/>
                Reading file...
              </div>
            ):(
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{margin:'0 auto 6px',display:'block'}}><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <div style={{fontSize:13,color:'#64748b',marginBottom:2}}>Drop a file here or click to upload</div>
                <div style={{fontSize:11,color:'#94a3b8'}}>Supports TXT, PDF, DOCX, MD, PNG, JPG, WEBP</div>
              </>
            )}
          </div>
        )}
        {/* DOCX/TXT file pill */}
        {!fileIsDirectType&&uploadedFile&&(
          <div style={{marginBottom:8}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'#EBF4FF',border:'1px solid #bfdbfe',borderRadius:999,padding:'4px 10px',fontSize:12,color:'#0066CC'}}>
              <span>📄 {uploadedFile.name} · {(uploadedFile.size/1024).toFixed(0)} KB</span>
              <button onClick={e=>{e.stopPropagation();resetFileState()}} style={{background:'none',border:'none',color:'#60a5fa',cursor:'pointer',fontSize:16,lineHeight:1,padding:0,display:'flex',alignItems:'center'}}>×</button>
            </div>
            {fileCharCount>0&&<div style={{fontSize:11,color:'#64748b',marginTop:3,paddingLeft:2}}>Extracted: {fileCharCount.toLocaleString()} characters{fileCharCount>FILE_CHAR_LIMIT?` (processing first ${FILE_CHAR_LIMIT.toLocaleString()})`:''}</div>}
          </div>
        )}
        {largeDocWarning&&(
          <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#92400e',marginBottom:8,display:'flex',alignItems:'flex-start',gap:6}}>
            <span style={{flexShrink:0,fontSize:14}}>⚠</span>
            <span>Large document detected — processing first 100,000 characters. If the document is longer, upload the remaining pages separately.</span>
          </div>
        )}
        {fileStatus&&!loading&&(
          <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#007AFF',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
            <span style={{display:'inline-block',width:12,height:12,border:'2px solid #bae6fd',borderTop:'2px solid #0369a1',borderRadius:'50%',animation:'ilSpin 0.75s linear infinite',flexShrink:0}}/>
            {fileStatus}
          </div>
        )}
        {fileError2&&(
          <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#dc2626',marginBottom:8}}>{fileError2}</div>
        )}
        {error&&(
          <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 12px',display:'flex',alignItems:'flex-start',gap:8,marginBottom:12}}>
            <span style={{color:'#dc2626',fontSize:14,flexShrink:0,fontWeight:700,marginTop:1}}>✕</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,color:'#dc2626',lineHeight:1.5}}>{error}</div>
              {pendingFile&&pendingFile.name.endsWith('.pdf')&&(
                <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
                  <button onClick={()=>{setError('');processDirectFile(pendingDate,true)}} style={{fontSize:12,color:'#0066CC',background:'#EBF4FF',border:'1px solid #bfdbfe',borderRadius:6,padding:'4px 12px',cursor:'pointer',fontWeight:600}}>Try Again (text extraction)</button>
                  <button onClick={()=>{resetFileState();setError('')}} style={{fontSize:12,color:'#64748b',background:'transparent',border:'1px solid #e2e8f0',borderRadius:6,padding:'4px 10px',cursor:'pointer'}}>Switch to text input</button>
                </div>
              )}
              {pendingFile&&!pendingFile.name.endsWith('.pdf')&&(
                <button onClick={()=>{resetFileState();setError('')}} style={{fontSize:12,color:'#64748b',background:'transparent',border:'1px solid #e2e8f0',borderRadius:6,padding:'4px 10px',cursor:'pointer',marginTop:6,display:'inline-block'}}>Switch to text input</button>
              )}
            </div>
          </div>
        )}
        {softWarn&&(
          <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'10px 12px',display:'flex',alignItems:'flex-start',gap:8,marginBottom:12}}>
            <span style={{color:'#d97706',fontSize:14,flexShrink:0,fontWeight:700,marginTop:1}}>⚠</span>
            <div style={{fontSize:12,color:'#92400e',lineHeight:1.5}}>{softWarn}</div>
          </div>
        )}
        {result&&(
          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'10px 12px',display:'flex',alignItems:'flex-start',gap:8,marginBottom:12}}>
            <span style={{color:'#16a34a',fontSize:14,flexShrink:0,fontWeight:700,marginTop:1}}>✓</span>
            <div>
              <div style={{fontSize:12,color:'#15803d'}}>
                {result.selectedMode?`Added ${result.followUps} follow-up${result.followUps!==1?'s':''} to your account`:result.skipAll?'Intel logged. No follow-ups added.':result.noFollowUps?'Intel logged successfully — no follow-ups suggested.':`Done — ${result.entry?'logged 1 intel entry, ':''}added ${result.followUps} follow-up${result.followUps!==1?'s':''},updated ${result.contacts} contact${result.contacts!==1?'s':''}`}
              </div>
              {result.notesUpdated>0&&<div style={{fontSize:11,color:'#16a34a',marginTop:3}}>Notes updated for {result.notesUpdated} contact{result.notesUpdated!==1?'s':''}</div>}
              {pdfAnalysisMethod&&<div style={{fontSize:11,color:'#86efac',marginTop:2}}>Analyzed via: {pdfAnalysisMethod}</div>}
            </div>
          </div>
        )}
        <button onClick={handleProcess} disabled={loading||(fileIsDirectType?!pendingFile:!text.trim())}
          style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',padding:11,background:loading||(fileIsDirectType?!pendingFile:!text.trim())?'#94a3b8':'linear-gradient(135deg,#0055CC 0%,#2563eb 100%)',border:'none',borderRadius:8,color:'#ffffff',fontSize:13,fontWeight:700,cursor:loading||(fileIsDirectType?!pendingFile:!text.trim())?'not-allowed':'pointer',transition:'opacity 0.15s'}}>
          {loading
            ?<><span style={{display:'inline-block',width:14,height:14,border:'2px solid rgba(255,255,255,0.35)',borderTop:'2px solid #fff',borderRadius:'50%',animation:'ilSpin 0.75s linear infinite',flexShrink:0}}/> {retryStatus||( processingLong?'Still processing large document...':'Processing...')}</>
            :fileIsDirectType?'Analyze Document with AI ✨':'Process with AI ✨'}
        </button>
      </div>

      {pendingIdentityConfirm.length > 0 && (
        <div style={{background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'14px 16px',marginBottom:16,display:'flex',flexDirection:'column',gap:8}}>
          <div style={{fontSize:12,fontWeight:700,color:'#0066CC',marginBottom:2}}>Contact Identity Check</div>
          <div style={{fontSize:11,color:'#64748b',marginBottom:4}}>The AI found similar names to existing contacts. Please confirm:</div>
          {pendingIdentityConfirm.map((item,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'8px 12px',background:'#fff',borderRadius:8,border:'1px solid #dbeafe',flexWrap:'wrap'}}>
              <span style={{fontSize:13,color:'#1e40af'}}>Is <strong>"{item.extractedName}"</strong> the same person as <strong>{item.matchedContactName}</strong>?</span>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <button onClick={()=>confirmIdentityYes(item)} style={{padding:'4px 14px',background:'#007AFF',border:'none',borderRadius:6,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>Yes</button>
                <button onClick={()=>confirmIdentityNo(item)} style={{padding:'4px 14px',background:'transparent',border:'1px solid #e2e8f0',borderRadius:6,color:'#64748b',fontSize:12,cursor:'pointer'}}>No</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* ─── SEARCH AND FILTER BAR ─── */}
      <div style={{background:'#ffffff',borderRadius:12,border:'1px solid #e2e8f0',padding:'12px 16px',marginBottom:16,display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{position:'relative',flex:1,minWidth:200}}>
          <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',fontSize:13,pointerEvents:'none'}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search entries...'
            style={{width:'100%',boxSizing:'border-box',fontSize:13,padding:'8px 12px 8px 34px',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:8,color:'#111827',outline:'none'}}/>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',flexShrink:0}}>
          {['All','Call','Meeting','Email','Note'].map(t=>(
            <button key={t} onClick={()=>setTypeFilter(t)}
              style={{padding:'4px 12px',borderRadius:999,fontSize:12,fontWeight:500,cursor:'pointer',background:typeFilter===t?'#007AFF':'#ffffff',color:typeFilter===t?'#ffffff':'#64748b',border:typeFilter===t?'1px solid #2563eb':'1px solid #e2e8f0',transition:'all 0.12s'}}>{t}</button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',flexShrink:0}}>
          <span style={{fontSize:11,color:'#64748b',flexShrink:0}}>From</span>
          <input type='date' value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{fontSize:11,padding:'4px 8px',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:6,color:'#374151'}}/>
          <span style={{fontSize:11,color:'#64748b'}}>To</span>
          <input type='date' value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{fontSize:11,padding:'4px 8px',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:6,color:'#374151'}}/>
          {hasFilters&&<button onClick={clearFilters} style={{fontSize:11,padding:'4px 8px',background:'transparent',border:'none',color:'#007AFF',cursor:'pointer',fontWeight:600}}>Clear</button>}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',marginLeft:'auto',flexWrap:'wrap',flexShrink:0}}>
          <span style={{fontSize:11,color:'#94a3b8',whiteSpace:'nowrap'}}>Showing {filtered.length} of {acct.intelLog.length}</span>
          <button onClick={exportIntel} style={{padding:'6px 12px',background:'transparent',border:'1px solid #e2e8f0',borderRadius:6,color:'#64748b',fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>↓ Export</button>
        </div>
      </div>

      {/* ─── INTEL ENTRIES FEED ─── */}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {filtered.length===0&&<div style={{textAlign:'center',padding:'32px',color:'#94a3b8',fontSize:13,background:'#ffffff',borderRadius:12,border:'1px solid #e2e8f0'}}>{acct.intelLog.length===0?'No intel logged yet. Paste a transcript above to get started.':'No entries match your filters.'}</div>}
        {filtered.map(e=>{
          const isExp=expandedEntry===e.id
          const tb=typeBadge[e.type||'Note']||typeBadge.Note
          const hasDetail=(e.insights?.length||0)+(e.risks?.length||0)+(e.opportunities?.length||0)>0
          return (
            <div key={e.id}
              style={{background:'#ffffff',borderRadius:12,border:'1px solid #e2e8f0',padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',transition:'box-shadow 0.15s'}}
              onMouseEnter={e2=>e2.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'}
              onMouseLeave={e2=>e2.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'}>
              {/* Header row — click to expand */}
              <div onClick={()=>setExpandedEntry(isExp?null:e.id)} style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,cursor:'pointer'}}>
                <span style={{fontSize:11,fontWeight:600,color:tb.c,background:tb.bg,padding:'2px 10px',borderRadius:999,flexShrink:0}}>{e.type||'Note'}</span>
                <span style={{fontSize:12,color:'#64748b',flexShrink:0}}>{fmtDate(e.date)}</span>
                {e.participants&&<span style={{fontSize:12,color:'#64748b',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>· {e.participants}</span>}
                {hasDetail&&<span style={{marginLeft:'auto',color:'#94a3b8',fontSize:12,flexShrink:0}}>{isExp?'▲':'▼'}</span>}
                <button
                  onClick={ev=>{ev.stopPropagation();generateActionFromIntel(e)}}
                  disabled={generatingActionId===e.id}
                  title='Generate action from this intel'
                  style={{display:'inline-flex',alignItems:'center',gap:3,background:'transparent',border:'1px solid #EEEFF2',color:'#9CA3AF',cursor:generatingActionId===e.id?'default':'pointer',fontSize:10,padding:'3px 7px',borderRadius:5,flexShrink:0,...(!hasDetail?{marginLeft:'auto'}:{})}}
                  onMouseEnter={ev=>{if(generatingActionId!==e.id){ev.currentTarget.style.color='#007AFF';ev.currentTarget.style.borderColor='#007AFF'}}}
                  onMouseLeave={ev=>{ev.currentTarget.style.color='#9CA3AF';ev.currentTarget.style.borderColor='#EEEFF2'}}>
                  {generatingActionId===e.id?'…':'⚡'}
                </button>
                <button
                  onClick={ev=>{ev.stopPropagation();handleDeleteIntelEntry(e.id)}}
                  title='Delete entry'
                  style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',padding:'4px',display:'flex',alignItems:'center',flexShrink:0}}
                  onMouseEnter={ev=>ev.currentTarget.style.color='#dc2626'}
                  onMouseLeave={ev=>ev.currentTarget.style.color='#94a3b8'}>
                  <Trash2 size={16}/>
                </button>
              </div>
              {/* Summary always visible */}
              <p style={{fontSize:13,color:'#374151',margin:'0 0 0',lineHeight:1.6}}>{e.summary}</p>
              {/* Expandable detail */}
              {isExp&&hasDetail&&(
                <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:8}}>
                  {e.insights?.length>0&&(
                    <div style={{background:'#f0f9ff',borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontSize:10,color:'#0066CC',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Key Insights</div>
                      {e.insights.map((ins,i)=><div key={i} style={{fontSize:12,color:'#374151',marginBottom:i<e.insights.length-1?4:0,lineHeight:1.5,display:'flex',gap:6}}><span style={{color:'#007AFF',flexShrink:0}}>→</span>{ins}</div>)}
                    </div>
                  )}
                  {e.risks?.length>0&&(
                    <div style={{background:'#fef2f2',borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontSize:10,color:'#dc2626',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Risks</div>
                      {e.risks.map((r,i)=><div key={i} style={{fontSize:12,color:'#374151',marginBottom:i<e.risks.length-1?4:0,lineHeight:1.5,display:'flex',gap:6}}><span style={{color:'#dc2626',flexShrink:0,fontWeight:700}}>!</span>{r}</div>)}
                    </div>
                  )}
                  {e.opportunities?.length>0&&(
                    <div style={{background:'#f0fdf4',borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Opportunities</div>
                      {e.opportunities.map((o,i)=><div key={i} style={{fontSize:12,color:'#374151',marginBottom:i<e.opportunities.length-1?4:0,lineHeight:1.5,display:'flex',gap:6}}><span style={{color:'#16a34a',flexShrink:0,fontWeight:700}}>+</span>{o}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {pendingParsed&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{width:'70vw',maxWidth:720,maxHeight:'80vh',background:'#fff',borderRadius:16,boxShadow:'0 25px 50px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Header */}
            <div style={{padding:'16px 20px',borderBottom:'1px solid #e2e8f0',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                <span style={{fontSize:16,fontWeight:700,color:'#111827',flex:1}}>Review Suggested Follow-Ups</span>
                <span style={{fontSize:11,fontWeight:600,color:'#0066CC',background:'#EBF4FF',borderRadius:999,padding:'2px 8px'}}>{pendingParsed.parsed.newFollowUps.length} suggested</span>
                <button onClick={()=>{setPendingParsed(null);setFuSelections(new Set())}} style={{background:'none',border:'none',color:'#94a3b8',fontSize:18,cursor:'pointer',lineHeight:1,padding:'0 2px',marginLeft:4}}>×</button>
              </div>
              <p style={{fontSize:12,color:'#64748b',margin:'0 0 10px'}}>AI extracted these action items from your input. Select the ones you want to add.</p>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <button onClick={()=>setFuSelections(new Set(pendingParsed.parsed.newFollowUps.map(fu=>fu._tempId)))} style={{fontSize:12,color:'#007AFF',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Select All</button>
                <button onClick={()=>setFuSelections(new Set())} style={{fontSize:12,color:'#007AFF',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Deselect All</button>
                <span style={{fontSize:12,color:'#94a3b8',marginLeft:'auto'}}>{fuSelections.size} of {pendingParsed.parsed.newFollowUps.length} selected</span>
              </div>
            </div>
            {/* Scrollable rows */}
            <div style={{overflowY:'auto',maxHeight:'calc(80vh - 140px)'}}>
              {pendingParsed.parsed.newFollowUps.map((fu,i)=>{
                const sel=fuSelections.has(fu._tempId)
                const p=PC[fu.priority]||PC.Medium
                const toggleSel=()=>setFuSelections(prev=>{const ns=new Set(prev);if(ns.has(fu._tempId))ns.delete(fu._tempId);else ns.add(fu._tempId);return ns})
                return(
                  <div key={fu._tempId}
                    onClick={toggleSel}
                    style={{padding:'12px 16px',cursor:'pointer',display:'flex',alignItems:'flex-start',gap:12,background:sel?'rgba(37,99,235,0.04)':'transparent',opacity:sel?1:0.6,borderBottom:'1px solid #f1f5f9',transition:'all 0.12s'}}>
                    <input type='checkbox' checked={sel} onChange={()=>{}} onClick={e=>e.stopPropagation()}
                      style={{marginTop:2,flexShrink:0,accentColor:p.c,cursor:'pointer',width:18,height:18}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#111827',lineHeight:1.4,marginBottom:4}}>{fu.task}</div>
                      {(fu.contact||fu.dueDate)&&(
                        <div style={{display:'flex',alignItems:'center',gap:12,fontSize:11,color:'#64748b'}}>
                          {fu.contact&&<span style={{display:'flex',alignItems:'center',gap:3}}>
                            <span style={{fontSize:11}}>👤</span>{fu.contact}
                          </span>}
                          {fu.dueDate&&<span style={{display:'flex',alignItems:'center',gap:3}}>
                            <span style={{fontSize:11}}>📅</span>Due: {fu.dueDate}
                          </span>}
                        </div>
                      )}
                    </div>
                    <span style={{fontSize:10,fontWeight:600,color:p.c,background:p.b,borderRadius:999,padding:'2px 8px',flexShrink:0,alignSelf:'flex-start',whiteSpace:'nowrap'}}>{fu.priority}</span>
                  </div>
                )
              })}
            </div>
            {/* Sticky footer */}
            <div style={{padding:'12px 16px',borderTop:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#fff',flexShrink:0}}>
              <span style={{fontSize:12,color:'#94a3b8'}}>{fuSelections.size} follow-up{fuSelections.size!==1?'s':''} will be added</span>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={()=>{setPendingParsed(null);setFuSelections(new Set())}} style={{padding:'8px 14px',background:'transparent',color:'#64748b',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,cursor:'pointer'}}>Cancel</button>
                <button
                  onClick={()=>{const{parsed,date}=pendingParsed;commitSave(parsed,date,new Set());setResult({followUps:0,contacts:parsed.contactUpdates?.length||0,entry:!!parsed.intelEntry,skipAll:true,notesUpdated:countNotesUpdated(parsed)});maybeShowTechSuggestions(parsed);setPendingParsed(null);setFuSelections(new Set())}}
                  style={{padding:'8px 14px',background:'transparent',color:'#64748b',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,cursor:'pointer'}}>
                  Skip All
                </button>
                <button
                  onClick={()=>{const{parsed,date}=pendingParsed;commitSave(parsed,date,fuSelections);const cnt=fuSelections.size;setResult({followUps:cnt,contacts:parsed.contactUpdates?.length||0,entry:!!parsed.intelEntry,selectedMode:true,notesUpdated:countNotesUpdated(parsed)});maybeShowTechSuggestions(parsed);setPendingParsed(null);setFuSelections(new Set())}}
                  disabled={fuSelections.size===0}
                  style={{padding:'8px 16px',background:fuSelections.size===0?'#94a3b8':'#007AFF',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:fuSelections.size===0?'not-allowed':'pointer'}}>
                  Add Selected Follow-Ups
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingTechSuggestions&&!pendingParsed&&(()=>{
        const handleAddTech = () => {
          const p=pendingTechSuggestions.parsed
          setAcct(prev=>{
            let ts=[...(prev.techStack||[])]
            pendingTechSuggestions.suggestions.forEach(s=>{
              if(!techSugSelections.has(s._id))return
              const idx=ts.findIndex(t=>t.vendor.toLowerCase().includes(s.vendor.toLowerCase())||s.vendor.toLowerCase().includes(t.vendor.toLowerCase()))
              if(idx>=0){
                ts[idx]={...ts[idx],status:s.status==='Active'?'Current':s.status,notes:(ts[idx].notes?ts[idx].notes+' | ':'')+s.context}
              } else {
                ts.push({id:uid(),vendor:s.vendor,products:s.products||'',category:resolveVendorMapping(s.vendor,s.category).primarySub||s.category||'Other',status:s.status==='Active'?'Current':s.status,notes:s.context||'',renewalDate:'',cost:'',vendorRep:'',vendorRepEmail:'',clientOwner:'',replacementOptions:'',aiNotes:'',aiNotesUpdatedAt:'',aiNotesHistory:[],sourceIntelId:lastIntelEntryIdRef.current||''})
              }
            })
            return{...prev,techStack:ts}
          })
          setPendingTechSuggestions(null);setTechSugSelections(new Set())
          maybeShowTechAiNotes(p)
        }
        const allIds=pendingTechSuggestions.suggestions.map(s=>s._id)
        const statusColor={Active:'#16a34a',Evaluating:'#007AFF',Replacing:'#ea580c'}
        const statusBg={Active:'#dcfce7',Evaluating:'#EBF4FF',Replacing:'#ffedd5'}
        return(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
            <div style={{width:'70vw',maxWidth:740,maxHeight:'82vh',background:'#fff',borderRadius:16,boxShadow:'0 25px 50px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
              {/* Header */}
              <div style={{padding:'16px 20px',borderBottom:'1px solid #e2e8f0',flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                  <span style={{fontSize:16,fontWeight:700,color:'#111827',flex:1}}>Tech Stack Mentions Detected</span>
                  <span style={{fontSize:11,fontWeight:600,color:'#7c3aed',background:'#ede9fe',borderRadius:999,padding:'2px 8px'}}>{pendingTechSuggestions.suggestions.length} found</span>
                  <button onClick={()=>{setPendingTechSuggestions(null);setTechSugSelections(new Set())}} style={{background:'none',border:'none',color:'#94a3b8',fontSize:18,cursor:'pointer',lineHeight:1,padding:'0 2px',marginLeft:4}}>×</button>
                </div>
                <p style={{fontSize:12,color:'#64748b',margin:'0 0 10px'}}>AI found these technologies mentioned in your intel. Add them to the tech stack?</p>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <button onClick={()=>setTechSugSelections(new Set(allIds))} style={{fontSize:12,color:'#007AFF',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Select All</button>
                  <button onClick={()=>setTechSugSelections(new Set())} style={{fontSize:12,color:'#007AFF',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Deselect All</button>
                  <span style={{fontSize:12,color:'#94a3b8',marginLeft:'auto'}}>{techSugSelections.size} of {pendingTechSuggestions.suggestions.length} selected</span>
                </div>
              </div>
              {/* Rows */}
              <div style={{overflowY:'auto',flex:1}}>
                {pendingTechSuggestions.suggestions.map(s=>{
                  const sel=techSugSelections.has(s._id)
                  const alreadyExists=(acct.techStack||[]).some(t=>t.vendor.toLowerCase().includes(s.vendor.toLowerCase())||s.vendor.toLowerCase().includes(t.vendor.toLowerCase()))
                  const toggle=()=>setTechSugSelections(prev=>{const ns=new Set(prev);if(ns.has(s._id))ns.delete(s._id);else ns.add(s._id);return ns})
                  return(
                    <div key={s._id} onClick={toggle}
                      style={{padding:'12px 16px',cursor:'pointer',display:'flex',alignItems:'flex-start',gap:12,background:sel?'rgba(124,58,237,0.04)':'transparent',opacity:sel?1:0.6,borderBottom:'1px solid #f1f5f9',transition:'all 0.12s'}}>
                      <input type='checkbox' checked={sel} onChange={()=>{}} onClick={e=>e.stopPropagation()}
                        style={{marginTop:3,flexShrink:0,accentColor:'#7c3aed',cursor:'pointer',width:18,height:18}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                          <span style={{fontSize:13,fontWeight:700,color:'#111827'}}>{s.vendor}</span>
                          {s.products&&<span style={{fontSize:12,color:'#64748b'}}>{s.products}</span>}
                          {s.category&&<span style={{fontSize:10,fontWeight:600,color:'#007AFF',background:'#EBF4FF',borderRadius:999,padding:'2px 7px'}}>{s.category}</span>}
                          {s.status&&<span style={{fontSize:10,fontWeight:600,color:statusColor[s.status]||'#6B7280',background:statusBg[s.status]||'#F9FAFB',borderRadius:999,padding:'2px 7px'}}>{s.status}</span>}
                          {alreadyExists
                            ?<span style={{fontSize:10,fontWeight:600,color:'#92400e',background:'#fef3c7',borderRadius:999,padding:'2px 7px'}}>Already in stack — Update?</span>
                            :<span style={{fontSize:10,fontWeight:600,color:'#15803d',background:'#dcfce7',borderRadius:999,padding:'2px 7px'}}>New</span>}
                        </div>
                        {s.context&&<div style={{fontSize:12,color:'#64748b',fontStyle:'italic',lineHeight:1.5}}>"{s.context}"</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Footer */}
              <div style={{padding:'12px 16px',borderTop:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#fff',flexShrink:0}}>
                <span style={{fontSize:12,color:'#94a3b8'}}>{techSugSelections.size} item{techSugSelections.size!==1?'s':''} will be added or updated</span>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{const p=pendingTechSuggestions.parsed;setPendingTechSuggestions(null);setTechSugSelections(new Set());maybeShowTechAiNotes(p)}}
                    style={{padding:'8px 14px',background:'transparent',color:'#64748b',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,cursor:'pointer'}}>Skip</button>
                  <button onClick={handleAddTech} disabled={techSugSelections.size===0}
                    style={{padding:'8px 16px',background:techSugSelections.size===0?'#94a3b8':'#7c3aed',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:techSugSelections.size===0?'not-allowed':'pointer'}}>
                    Add Selected
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {pendingTechAiNotes&&!pendingTechSuggestions&&!pendingParsed&&(()=>{
        const p = pendingTechAiNotes.parsed
        const commitAiNotesUpdate = () => {
          setAcct(prev=>{
            const ts=[...(prev.techStack||[])]
            pendingTechAiNotes.updates.forEach(u=>{
              if(!techAiNotesSels.has(u._id))return
              const idx=ts.findIndex(t=>t.id===u.matchedEntry.id)
              if(idx<0)return
              const existing=ts[idx]
              const formatted=u.aiNotesUpdate+(u.bullets?.length?'\n\n'+u.bullets.map(b=>'• '+b).join('\n'):'')
              const hist=[...(existing.aiNotesHistory||[])]
              if(existing.aiNotes?.trim()) hist.push({id:uid(),text:existing.aiNotes,date:existing.aiNotesUpdatedAt||'',archivedAt:new Date().toISOString()})
              ts[idx]={...existing,
                aiNotes:formatted,
                aiNotesUpdatedAt:u.date||new Date().toISOString().split('T')[0],
                aiNotesSourceIntelId:lastIntelEntryIdRef.current||'',
                aiNotesHistory:hist,
                aiNotesSummary:''
              }
            })
            return{...prev,techStack:ts}
          })
          setPendingTechAiNotes(null);setTechAiNotesSels(new Set())
          maybeShowProjectUpdates(p)
        }
        return(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
            <div style={{width:'72vw',maxWidth:760,maxHeight:'84vh',background:'#fff',borderRadius:16,boxShadow:'0 25px 50px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
              <div style={{padding:'16px 20px',borderBottom:'1px solid #e2e8f0',flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                  <span style={{fontSize:18}}>✨</span>
                  <span style={{fontSize:16,fontWeight:700,color:'#111827',flex:1}}>AI Notes for Your Tech Stack</span>
                  <span style={{fontSize:11,fontWeight:600,color:'#007AFF',background:'#EBF4FF',borderRadius:999,padding:'2px 8px'}}>{pendingTechAiNotes.updates.length} update{pendingTechAiNotes.updates.length!==1?'s':''}</span>
                  <button onClick={()=>{setPendingTechAiNotes(null);setTechAiNotesSels(new Set());maybeShowProjectUpdates(p)}} style={{background:'none',border:'none',color:'#94a3b8',fontSize:18,cursor:'pointer',lineHeight:1,padding:'0 2px',marginLeft:4}}>×</button>
                </div>
                <p style={{fontSize:12,color:'#64748b',margin:'0 0 10px'}}>AI found updates for these technologies based on the intel you just uploaded. Review and confirm which to save.</p>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <button onClick={()=>setTechAiNotesSels(new Set(pendingTechAiNotes.updates.map(u=>u._id)))} style={{fontSize:12,color:'#007AFF',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Select All</button>
                  <button onClick={()=>setTechAiNotesSels(new Set())} style={{fontSize:12,color:'#007AFF',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:0}}>Deselect All</button>
                  <span style={{fontSize:12,color:'#94a3b8',marginLeft:'auto'}}>{techAiNotesSels.size} of {pendingTechAiNotes.updates.length} selected</span>
                </div>
              </div>
              <div style={{overflowY:'auto',flex:1}}>
                {pendingTechAiNotes.updates.map(u=>{
                  const sel=techAiNotesSels.has(u._id)
                  const toggle=()=>setTechAiNotesSels(prev=>{const ns=new Set(prev);ns.has(u._id)?ns.delete(u._id):ns.add(u._id);return ns})
                  const hasPrev=!!(u.matchedEntry?.aiNotes)
                  const prevParts=(u.matchedEntry?.aiNotes||'').split('\n\n')
                  const newBullets=(u.bullets||[])
                  return(
                    <div key={u._id} onClick={toggle}
                      style={{padding:'14px 16px',cursor:'pointer',background:sel?'rgba(37,99,235,0.04)':'transparent',opacity:sel?1:0.65,borderBottom:'1px solid #f1f5f9',transition:'all 0.12s'}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                        <input type='checkbox' checked={sel} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{marginTop:4,flexShrink:0,accentColor:'#007AFF',cursor:'pointer',width:16,height:16}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
                            <span style={{fontSize:13,fontWeight:700,color:'#111827'}}>{u.vendor}</span>
                            {u.matchedEntry?.category&&<span style={{fontSize:10,fontWeight:600,color:'#007AFF',background:'#EBF4FF',borderRadius:999,padding:'2px 7px'}}>{u.matchedEntry.category}</span>}
                            {u.date&&<span style={{fontSize:10,color:'#94a3b8',background:'#F9FAFB',borderRadius:999,padding:'2px 7px'}}>{fmtDate(u.date)}</span>}
                          </div>
                          {hasPrev&&(
                            <div style={{background:'#F9FAFB',border:'1px solid #e2e8f0',borderRadius:7,padding:'8px 10px',marginBottom:8}}>
                              <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Previous Notes</div>
                              <div style={{fontSize:11,color:'#94a3b8',fontStyle:'italic',lineHeight:1.5,maxHeight:56,overflow:'hidden'}}>{prevParts[0]}</div>
                            </div>
                          )}
                          {hasPrev&&<div style={{fontSize:11,color:'#94a3b8',textAlign:'center',marginBottom:6}}>↓ Updated to</div>}
                          <div style={{background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:7,padding:'8px 10px'}}>
                            <div style={{fontSize:10,fontWeight:700,color:'#007AFF',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>New AI Summary</div>
                            <div style={{fontSize:12,color:'#1e3a5f',lineHeight:1.6,marginBottom:newBullets.length?4:0}}>{u.aiNotesUpdate}</div>
                            {newBullets.length>0&&<ul style={{margin:'4px 0 0',paddingLeft:16,fontSize:11,color:'#374151'}}>{newBullets.map((b,bi)=><li key={bi}>{b}</li>)}</ul>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{padding:'12px 16px',borderTop:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#fff',flexShrink:0}}>
                <span style={{fontSize:12,color:'#94a3b8'}}>{techAiNotesSels.size} tech stack entr{techAiNotesSels.size!==1?'ies':'y'} will be updated</span>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{setPendingTechAiNotes(null);setTechAiNotesSels(new Set());maybeShowProjectUpdates(p)}} style={{padding:'8px 14px',background:'transparent',color:'#64748b',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,cursor:'pointer'}}>Skip</button>
                  <button onClick={commitAiNotesUpdate} disabled={techAiNotesSels.size===0}
                    style={{padding:'8px 16px',background:techAiNotesSels.size===0?'#94a3b8':'#007AFF',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:techAiNotesSels.size===0?'not-allowed':'pointer'}}>
                    Update Selected
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {pendingActionFromIntel&&!pendingParsed&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{width:'70vw',maxWidth:680,maxHeight:'85vh',background:'#fff',borderRadius:16,boxShadow:'0 25px 50px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #e2e8f0',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                <span style={{fontSize:16}}>⚡</span>
                <span style={{fontSize:16,fontWeight:700,color:'#111827',flex:1}}>New Action from Intel</span>
                <button onClick={()=>setPendingActionFromIntel(null)} style={{background:'none',border:'none',color:'#94a3b8',fontSize:18,cursor:'pointer',lineHeight:1,padding:'0 2px'}}>×</button>
              </div>
              <p style={{fontSize:12,color:'#64748b',margin:0}}>Review and edit before saving to Actions.</p>
            </div>
            <div style={{overflowY:'auto',flex:1,padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Task</div>
                <input
                  value={pendingActionFromIntel.task||''}
                  onChange={e=>setPendingActionFromIntel(p=>({...p,task:e.target.value}))}
                  style={{width:'100%',boxSizing:'border-box',fontSize:13,fontWeight:600,color:'#111827',background:'#F9FAFB',border:'1px solid #e2e8f0',borderRadius:7,padding:'8px 12px',outline:'none'}}
                  onFocus={e=>{e.target.style.borderColor='#007AFF';e.target.style.background='#fff'}}
                  onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.background='#F9FAFB'}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Priority</div>
                  <select value={pendingActionFromIntel.priority||'High'} onChange={e=>setPendingActionFromIntel(p=>({...p,priority:e.target.value}))}
                    style={{width:'100%',fontSize:12,padding:'7px 10px',background:'#F9FAFB',border:'1px solid #e2e8f0',borderRadius:7,color:'#374151',cursor:'pointer'}}>
                    {['Critical','High','Medium','Low'].map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Due Date</div>
                  <input type='date' value={pendingActionFromIntel.dueDate||''} onChange={e=>setPendingActionFromIntel(p=>({...p,dueDate:e.target.value}))}
                    style={{width:'100%',fontSize:12,padding:'7px 10px',background:'#F9FAFB',border:'1px solid #e2e8f0',borderRadius:7,color:'#374151'}}/>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5}}>Contact</div>
                  <input value={pendingActionFromIntel.contact||''} onChange={e=>setPendingActionFromIntel(p=>({...p,contact:e.target.value}))}
                    style={{width:'100%',fontSize:12,padding:'7px 10px',background:'#F9FAFB',border:'1px solid #e2e8f0',borderRadius:7,color:'#374151',outline:'none'}}
                    onFocus={e=>e.target.style.borderColor='#007AFF'}
                    onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
                </div>
              </div>
              {pendingActionFromIntel.quickContext&&(
                <div style={{background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'10px 12px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#0066CC',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>📋 Quick Context</div>
                  <div style={{fontSize:12,color:'#1e3a5f',lineHeight:1.6}}>{pendingActionFromIntel.quickContext}</div>
                </div>
              )}
              {pendingActionFromIntel.recommendedNextAction&&(
                <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'10px 12px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#15803d',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>⚡ Recommended Next Action</div>
                  <div style={{fontSize:12,color:'#166534',lineHeight:1.6,fontWeight:500}}>{pendingActionFromIntel.recommendedNextAction}</div>
                </div>
              )}
              {pendingActionFromIntel.draftEmail&&(
                <div style={{background:'#F9FAFB',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 12px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>✉️ Draft Email (pre-loaded)</div>
                  <div style={{fontSize:11,marginBottom:3}}>
                    <span style={{fontWeight:700,color:'#374151'}}>Subject: </span>
                    <span style={{color:'#374151'}}>{pendingActionFromIntel.draftEmail.subject}</span>
                  </div>
                  {pendingActionFromIntel.draftEmail.to?.length>0&&(
                    <div style={{fontSize:11,marginBottom:8}}>
                      <span style={{fontWeight:700,color:'#374151'}}>To: </span>
                      <span style={{color:'#374151'}}>{pendingActionFromIntel.draftEmail.to.join(', ')}</span>
                    </div>
                  )}
                  <div style={{fontSize:11,color:'#374151',lineHeight:1.6,whiteSpace:'pre-line',borderTop:'1px solid #e2e8f0',paddingTop:6}}>{pendingActionFromIntel.draftEmail.body}</div>
                </div>
              )}
            </div>
            <div style={{padding:'12px 16px',borderTop:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,background:'#fff',flexShrink:0}}>
              <button onClick={()=>setPendingActionFromIntel(null)} style={{padding:'8px 14px',background:'transparent',color:'#64748b',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button
                onClick={()=>{
                  if(!pendingActionFromIntel.task?.trim())return
                  const now=new Date().toISOString().split('T')[0]
                  const newAction={
                    id:uid(),
                    task:pendingActionFromIntel.task,
                    priority:pendingActionFromIntel.priority||'High',
                    dueDate:pendingActionFromIntel.dueDate||'',
                    contact:pendingActionFromIntel.contact||'',
                    status:'Open',
                    context:pendingActionFromIntel.quickContext||'',
                    createdAt:now,
                    aiIntel:{
                      quickContext:pendingActionFromIntel.quickContext||'',
                      recommendedNextAction:{text:pendingActionFromIntel.recommendedNextAction||'',confidence:0.9},
                      suggestedRecipients:{...(pendingActionFromIntel.suggestedRecipients||{}),internal:[]},
                      draftEmail:pendingActionFromIntel.draftEmail||null,
                      generatedAt:new Date().toISOString()
                    }
                  }
                  setAcct(p=>({...p,followUps:[...(p.followUps||[]),newAction]}))
                  setPendingActionFromIntel(null)
                }}
                disabled={!pendingActionFromIntel.task?.trim()}
                style={{padding:'8px 16px',background:pendingActionFromIntel.task?.trim()?'#007AFF':'#94a3b8',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:pendingActionFromIntel.task?.trim()?'pointer':'not-allowed'}}>
                Save Action
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingProjectUpdates&&!pendingTechAiNotes&&!pendingTechSuggestions&&!pendingParsed&&(()=>{
        const applyProjectUpdates = () => {
          const intelEntryId = lastIntelEntryIdRef.current || ''
          const intelDate = pendingProjectUpdates.parsed?.intelEntry?.date || new Date().toISOString().split('T')[0]
          setAcct(prev => {
            let projects = [...(prev.projects || [])]
            pendingProjectUpdates.updates.forEach((u, idx) => {
              const checked = projUpdateChecked[idx] || {}
              if (u.matchedProject) {
                const pidx = projects.findIndex(p => p.id === u.matchedProject.id)
                if (pidx < 0) return
                let proj = {...projects[pidx]}
                if (checked.stage && u.suggestedStage) {
                  proj.timeline = (proj.timeline || []).map(s => {
                    if (s.stage === u.suggestedStage) return {...s, status:'current', date:new Date().toISOString().split('T')[0]}
                    if (s.status === 'current') return {...s, status:'completed', date:s.date||new Date().toISOString().split('T')[0]}
                    return s
                  })
                }
                if (checked.status && u.suggestedStatus) proj.status = u.suggestedStatus
                if (checked.closeDate && u.suggestedCloseDate) proj.closeDate = u.suggestedCloseDate
                if (checked.revenue && u.suggestedRevenue) proj.estimatedRevenue = u.suggestedRevenue
                if (checked.waitingOn && u.waitingOn) proj.waitingOn = u.waitingOn
                if (checked.nextSteps && u.nextSteps) proj.nextSteps = u.nextSteps
                if (u.note) proj.projectNotes = [{id:uid(),text:u.note,date:intelDate,sourceIntelId:intelEntryId,createdAt:new Date().toISOString()},...(proj.projectNotes||[])]
                projects[pidx] = proj
              }
            })
            Object.entries(newProjForms).forEach(([idxStr, form]) => {
              const idx = parseInt(idxStr)
              const u = pendingProjectUpdates.updates[idx]
              if (!u || u.matchedProject || !form.name?.trim()) return
              projects.push({
                id:uid(), name:form.name, vendor:form.vendor||'', category:form.category||'',
                status:form.status||'Not Started', description:'', goals:'', pains:'',
                primaryContact:'', budget:false, closeDate:u.suggestedCloseDate||'', notes:'',
                waitingOn:u.waitingOn||'', nextAction:'', nextSteps:u.nextSteps||'',
                estimatedRevenue:u.suggestedRevenue||'', estimatedGrossProfit:'', clientTargetDate:'',
                projectNotes:u.note?[{id:uid(),text:u.note,date:intelDate,sourceIntelId:intelEntryId,createdAt:new Date().toISOString()}]:[],
                timeline:STAGES.map(s=>({stage:s,status:'pending',date:''}))
              })
            })
            return {...prev, projects}
          })
          setPendingProjectUpdates(null); setProjUpdateChecked({}); setNewProjForms({})
        }
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
            <div style={{width:'72vw',maxWidth:760,maxHeight:'86vh',background:'#fff',borderRadius:16,boxShadow:'0 25px 50px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
              <div style={{padding:'16px 20px',borderBottom:'1px solid #e2e8f0',flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                  <span style={{fontSize:18}}>📋</span>
                  <span style={{fontSize:16,fontWeight:700,color:'#111827',flex:1}}>Project Updates Detected</span>
                  <span style={{fontSize:11,fontWeight:600,color:'#15803d',background:'#dcfce7',borderRadius:999,padding:'2px 8px'}}>{pendingProjectUpdates.updates.length} found</span>
                  <button onClick={()=>{setPendingProjectUpdates(null);setProjUpdateChecked({});setNewProjForms({})}} style={{background:'none',border:'none',color:'#94a3b8',fontSize:18,cursor:'pointer',lineHeight:1,padding:'0 2px',marginLeft:4}}>×</button>
                </div>
                <p style={{fontSize:12,color:'#64748b',margin:0}}>AI found project intel in your upload. Check which fields to update. Notes are always added.</p>
              </div>
              <div style={{overflowY:'auto',flex:1,padding:'12px 20px',display:'flex',flexDirection:'column',gap:12}}>
                {pendingProjectUpdates.updates.map((u, idx) => {
                  const checked = projUpdateChecked[idx] || {}
                  const toggleField = field => setProjUpdateChecked(prev=>({...prev,[idx]:{...(prev[idx]||{}),[field]:!(prev[idx]?.[field])}}))
                  if (u.matchedProject) {
                    return (
                      <div key={idx} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:'12px 14px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                          <span style={{fontSize:14,fontWeight:700,color:'#111827'}}>{u.matchedProject.name}</span>
                          <span style={{fontSize:10,fontWeight:600,color:'#15803d',background:'#dcfce7',borderRadius:999,padding:'2px 7px'}}>Matched</span>
                          {u.matchedProject.vendor&&<span style={{fontSize:11,color:'#64748b'}}>{u.matchedProject.vendor}</span>}
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:6}}>
                          {u.suggestedStage&&<label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:12}}><input type='checkbox' checked={checked.stage||false} onChange={()=>toggleField('stage')} style={{accentColor:'#007AFF',width:15,height:15}}/><span style={{color:'#64748b',fontWeight:600,minWidth:80}}>Stage →</span><span style={{color:'#111827'}}>{u.suggestedStage}</span></label>}
                          {u.suggestedStatus&&<label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:12}}><input type='checkbox' checked={checked.status||false} onChange={()=>toggleField('status')} style={{accentColor:'#007AFF',width:15,height:15}}/><span style={{color:'#64748b',fontWeight:600,minWidth:80}}>Status →</span><span style={{color:'#111827'}}>{u.suggestedStatus}</span></label>}
                          {u.suggestedCloseDate&&<label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:12}}><input type='checkbox' checked={checked.closeDate||false} onChange={()=>toggleField('closeDate')} style={{accentColor:'#007AFF',width:15,height:15}}/><span style={{color:'#64748b',fontWeight:600,minWidth:80}}>Close Date →</span><span style={{color:'#111827'}}>{u.suggestedCloseDate}</span></label>}
                          {u.suggestedRevenue&&<label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:12}}><input type='checkbox' checked={checked.revenue||false} onChange={()=>toggleField('revenue')} style={{accentColor:'#007AFF',width:15,height:15}}/><span style={{color:'#64748b',fontWeight:600,minWidth:80}}>Revenue →</span><span style={{color:'#111827'}}>{u.suggestedRevenue}</span></label>}
                          {u.waitingOn&&<label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:12}}><input type='checkbox' checked={checked.waitingOn||false} onChange={()=>toggleField('waitingOn')} style={{accentColor:'#007AFF',width:15,height:15}}/><span style={{color:'#64748b',fontWeight:600,minWidth:80}}>Waiting On →</span><span style={{color:'#111827'}}>{u.waitingOn}</span></label>}
                          {u.nextSteps&&<label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:12}}><input type='checkbox' checked={checked.nextSteps||false} onChange={()=>toggleField('nextSteps')} style={{accentColor:'#007AFF',width:15,height:15}}/><span style={{color:'#64748b',fontWeight:600,minWidth:80}}>Next Steps →</span><span style={{color:'#111827'}}>{u.nextSteps}</span></label>}
                        </div>
                        {u.note&&<div style={{marginTop:8,padding:'7px 10px',background:'#fff',border:'1px solid #e2e8f0',borderRadius:7}}>
                          <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Note (always added)</div>
                          <div style={{fontSize:12,color:'#374151',lineHeight:1.5,fontStyle:'italic'}}>{u.note}</div>
                        </div>}
                      </div>
                    )
                  } else {
                    const form = newProjForms[idx] || {name:u.projectName||'',vendor:u.vendorName||'',status:'Not Started',category:''}
                    const updateForm = (field, val) => setNewProjForms(prev=>({...prev,[idx]:{...form,[field]:val}}))
                    return (
                      <div key={idx} style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'12px 14px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                          <span style={{fontSize:13,fontWeight:700,color:'#92400e'}}>New Project Detected</span>
                          <span style={{fontSize:10,fontWeight:600,color:'#92400e',background:'#fef3c7',borderRadius:999,padding:'2px 7px'}}>{u.confidence}</span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                          <div>
                            <div style={{fontSize:10,color:'#92400e',fontWeight:700,marginBottom:3}}>Project Name</div>
                            <input value={form.name} onChange={e=>updateForm('name',e.target.value)} placeholder='Project name'
                              style={{width:'100%',boxSizing:'border-box',fontSize:12,padding:'5px 8px',border:'1px solid #fde68a',borderRadius:5,background:'#fff',color:'#374151',outline:'none'}}/>
                          </div>
                          <div>
                            <div style={{fontSize:10,color:'#92400e',fontWeight:700,marginBottom:3}}>Vendor</div>
                            <input value={form.vendor} onChange={e=>updateForm('vendor',e.target.value)} placeholder='Vendor name'
                              style={{width:'100%',boxSizing:'border-box',fontSize:12,padding:'5px 8px',border:'1px solid #fde68a',borderRadius:5,background:'#fff',color:'#374151',outline:'none'}}/>
                          </div>
                        </div>
                        {u.note&&<div style={{padding:'7px 10px',background:'#fff',border:'1px solid #fde68a',borderRadius:7,marginBottom:6}}>
                          <div style={{fontSize:10,fontWeight:700,color:'#92400e',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Intel Note</div>
                          <div style={{fontSize:12,color:'#374151',lineHeight:1.5,fontStyle:'italic'}}>{u.note}</div>
                        </div>}
                        <div style={{fontSize:11,color:'#92400e'}}>Fill in the name above to create this project when you click Apply.</div>
                      </div>
                    )
                  }
                })}
              </div>
              <div style={{padding:'12px 16px',borderTop:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,background:'#fff',flexShrink:0}}>
                <button onClick={()=>{setPendingProjectUpdates(null);setProjUpdateChecked({});setNewProjForms({})}}
                  style={{padding:'8px 14px',background:'transparent',color:'#64748b',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,cursor:'pointer'}}>Skip</button>
                <button onClick={applyProjectUpdates}
                  style={{padding:'8px 16px',background:'#15803d',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Apply Selected</button>
              </div>
            </div>
          </div>
        )
      })()}

      {deleteToast&&(
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'#f1f5f9',padding:'10px 18px',borderRadius:8,fontSize:13,fontWeight:500,zIndex:2000,boxShadow:'0 4px 16px rgba(0,0,0,0.25)',whiteSpace:'nowrap'}}>
          {deleteToast}
        </div>
      )}

      {pendingDeleteEntry&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{width:'70vw',maxWidth:680,maxHeight:'82vh',background:'#fff',borderRadius:16,boxShadow:'0 25px 50px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #e2e8f0',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <span style={{fontSize:16,fontWeight:700,color:'#111827',flex:1}}>Delete Intel Entry</span>
                <button onClick={()=>setPendingDeleteEntry(null)} style={{background:'none',border:'none',color:'#94a3b8',fontSize:20,cursor:'pointer',lineHeight:1}}>×</button>
              </div>
              <p style={{fontSize:13,color:'#64748b',margin:'0 0 8px'}}>The following were created from this intel. Select what to remove:</p>
              <div style={{padding:'8px 10px',background:'#f8fafc',borderRadius:7,border:'1px solid #e2e8f0'}}>
                <div style={{fontSize:12,fontWeight:600,color:'#374151'}}>{pendingDeleteEntry.entry?.type||'Note'} · {fmtDate(pendingDeleteEntry.entry?.date)}</div>
                {pendingDeleteEntry.entry?.participants&&<div style={{fontSize:11,color:'#64748b',marginTop:2}}>{pendingDeleteEntry.entry.participants}</div>}
                {pendingDeleteEntry.entry?.summary&&<div style={{fontSize:11,color:'#64748b',marginTop:2,fontStyle:'italic'}}>{pendingDeleteEntry.entry.summary.slice(0,100)}{(pendingDeleteEntry.entry.summary||'').length>100?'…':''}</div>}
              </div>
            </div>
            <div style={{overflowY:'auto',flex:1,padding:'12px 20px',display:'flex',flexDirection:'column',gap:10}}>
              {pendingDeleteEntry.linkedFollowUps.length>0&&(
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Follow-Ups ({pendingDeleteEntry.linkedFollowUps.length})</div>
                  {pendingDeleteEntry.linkedFollowUps.map(fu=>(
                    <div key={fu.id} onClick={()=>setDeleteCheckedFu(prev=>{const s=new Set(prev);s.has(fu.id)?s.delete(fu.id):s.add(fu.id);return s})}
                      style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 10px',cursor:'pointer',background:deleteCheckedFu.has(fu.id)?'rgba(220,38,38,0.04)':'transparent',borderRadius:6,marginBottom:2,border:'1px solid #f1f5f9',transition:'background 0.1s'}}>
                      <input type='checkbox' checked={deleteCheckedFu.has(fu.id)} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{marginTop:2,cursor:'pointer',accentColor:'#dc2626'}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#111827'}}>{fu.task}</div>
                        <div style={{display:'flex',gap:8,marginTop:2}}>
                          {fu.dueDate&&<span style={{fontSize:11,color:'#64748b'}}>Due: {fu.dueDate}</span>}
                          {fu.priority&&<span style={{fontSize:11,fontWeight:600,color:fu.priority==='Critical'?'#dc2626':fu.priority==='High'?'#ea580c':fu.priority==='Medium'?'#2563eb':'#64748b'}}>{fu.priority}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {pendingDeleteEntry.linkedTechStack.length>0&&(
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Tech Stack ({pendingDeleteEntry.linkedTechStack.length})</div>
                  {pendingDeleteEntry.linkedTechStack.map(t=>(
                    <div key={t.id} onClick={()=>setDeleteCheckedTs(prev=>{const s=new Set(prev);s.has(t.id)?s.delete(t.id):s.add(t.id);return s})}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',cursor:'pointer',background:deleteCheckedTs.has(t.id)?'rgba(220,38,38,0.04)':'transparent',borderRadius:6,marginBottom:2,border:'1px solid #f1f5f9',transition:'background 0.1s'}}>
                      <input type='checkbox' checked={deleteCheckedTs.has(t.id)} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{cursor:'pointer',accentColor:'#dc2626'}}/>
                      <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:13,fontWeight:700,color:'#111827'}}>{t.vendor}</span>
                        {t.category&&<span style={{fontSize:10,fontWeight:600,color:'#2563eb',background:'#dbeafe',borderRadius:999,padding:'1px 7px'}}>{t.category}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {pendingDeleteEntry.linkedContacts.length>0&&(
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Contacts ({pendingDeleteEntry.linkedContacts.length})</div>
                  {pendingDeleteEntry.linkedContacts.map(c=>(
                    <div key={c.id} onClick={()=>setDeleteCheckedCt(prev=>{const s=new Set(prev);s.has(c.id)?s.delete(c.id):s.add(c.id);return s})}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',cursor:'pointer',background:deleteCheckedCt.has(c.id)?'rgba(220,38,38,0.04)':'transparent',borderRadius:6,marginBottom:2,border:'1px solid #f1f5f9',transition:'background 0.1s'}}>
                      <input type='checkbox' checked={deleteCheckedCt.has(c.id)} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{cursor:'pointer',accentColor:'#dc2626'}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <span style={{fontSize:13,fontWeight:700,color:'#111827'}}>{c.name}</span>
                        {c.title&&<span style={{fontSize:11,color:'#64748b',marginLeft:6}}>{c.title}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {pendingDeleteEntry.linkedTechAiNotes.length>0&&(
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Tech Stack AI Notes ({pendingDeleteEntry.linkedTechAiNotes.length})</div>
                  {pendingDeleteEntry.linkedTechAiNotes.map(t=>(
                    <div key={t.id} onClick={()=>setDeleteCheckedTn(prev=>{const s=new Set(prev);s.has(t.id)?s.delete(t.id):s.add(t.id);return s})}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',cursor:'pointer',background:deleteCheckedTn.has(t.id)?'rgba(220,38,38,0.04)':'transparent',borderRadius:6,marginBottom:2,border:'1px solid #f1f5f9',transition:'background 0.1s'}}>
                      <input type='checkbox' checked={deleteCheckedTn.has(t.id)} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{cursor:'pointer',accentColor:'#dc2626'}}/>
                      <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:13,fontWeight:700,color:'#111827'}}>{t.vendor}</span>
                        <span style={{fontSize:11,color:'#64748b',fontStyle:'italic'}}>AI notes will be cleared</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{fontSize:11,color:'#94a3b8',paddingTop:6,borderTop:'1px solid #f1f5f9'}}>Unchecked items will remain in the account</div>
            </div>
            <div style={{padding:'12px 16px',borderTop:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,background:'#fff',flexShrink:0}}>
              <button onClick={()=>setPendingDeleteEntry(null)} style={{padding:'8px 14px',background:'transparent',color:'#64748b',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={()=>executeCascadeDelete(pendingDeleteEntry,deleteCheckedFu,deleteCheckedTs,deleteCheckedCt,deleteCheckedTn)}
                style={{padding:'8px 16px',background:'#dc2626',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {showDate&&<Modal title={dateModalIsFile?'When did this document originate?':'Date this entry'} onClose={()=>setShowDate(false)} width={380}>
        <p style={{fontSize:13,color:S.secondary,marginBottom:10}}>{dateModalIsFile?'When was this document created or the event it describes occurred?':'Is this a new entry from today, or are you uploading an older transcript or note?'}</p>
        {customDate&&<div style={{fontSize:12,color:S.green,padding:'6px 10px',background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:5,marginBottom:10}}>Date detected from {dateModalIsFile?'document':'text'}: <strong>{fmtDate(customDate)}</strong></div>}
        <Field label='Custom date (leave blank for today)' value={customDate} onChange={setCustomDate} type='date'/>
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <Btn variant='primary' onClick={()=>{const d=new Date().toISOString().split('T')[0];setShowDate(false);dateModalIsFile?processDirectFile(d):process(d)}}>Use Today</Btn>
          <Btn onClick={()=>{if(customDate){setShowDate(false);dateModalIsFile?processDirectFile(customDate):process(customDate)}}} style={{opacity:customDate?1:0.4}}>Use {customDate?fmtDate(customDate):'Custom Date'}</Btn>
        </div>
      </Modal>}
    </div>
  )
}
