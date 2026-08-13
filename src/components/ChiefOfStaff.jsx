// src/components/ChiefOfStaff.jsx
//
// A calm, headline-first feed: the day's brief up top in plain language,
// then one merged accordion list below — stale "waiting on" commitments
// first, then drafts ready to send, sharp signals, high-priority
// follow-ups. Click a row to expand for context/draft/actions; snooze
// pushes it out to tomorrow/3 days/next week.
//
// Reads the same Supabase tables wave-sync.js (in the ai-brain repo)
// writes to: call_signals, reminders, draft_emails, briefings, plus the
// existing open_items. Standalone twin at
// ai-brain/signal-board/index.html — same tables, same behavior, just
// outside Ledgr's own nav.

import { useState, useEffect } from 'react'
import { S } from '../theme.js'
import { supabase } from '../supabase.js'

const STALE_HOURS = 4

function fixedCutoff() {
  // Yesterday 8am through now — resets at the start of the workday, not at
  // midnight, so an evening check-in doesn't lose yesterday afternoon's calls.
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(8, 0, 0, 0)
  return d.toISOString()
}

function ago(iso) {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return 'now'
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function firstName(s) {
  return (s || '').split(/[\s(]/)[0]
}

function draftHeadline(recipient) {
  const m = (recipient || '').match(/^(.+?)\s*\(CC (.+?)\)/i)
  if (m) return `Send email to ${firstName(m[1])} & ${firstName(m[2])}`
  return `Send email to ${firstName(recipient)}`
}

function snoozeUntil(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

export default function ChiefOfStaff({ onBack }) {
  const [briefContent, setBriefContent] = useState(null)
  const [items, setItems] = useState([])
  const [hiddenCount, setHiddenCount] = useState(0)
  const [openRowId, setOpenRowId] = useState(null)
  const [showAllActions, setShowAllActions] = useState(false)
  const [accountNames, setAccountNames] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [toast, setToast] = useState('')

  const flashToast = msg => { setToast(msg); setTimeout(() => setToast(''), 1800) }

  const loadAccountNames = async () => {
    const { data } = await supabase.from('accounts').select('data').eq('id', 'user-data').single()
    const map = Object.fromEntries((data?.data?.accounts || []).map(a => [a.id, a.name]))
    setAccountNames(map)
    return map
  }

  const loadBrief = async () => {
    const { data } = await supabase.from('briefings').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle()
    setBriefContent(data?.content || null)
  }

  const buildFeed = async (namesOverride, showAllOverride) => {
    const names = namesOverride || accountNames
    const showAll = showAllOverride ?? showAllActions
    const cutoff = fixedCutoff()
    const notSnoozed = q => q.or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`)

    const [{ data: waiting }, { data: drafts }, { data: signals }, { data: actions }] = await Promise.all([
      notSnoozed(supabase.from('reminders').select('*').eq('list_name', 'AI Waiting-On').eq('completed', false)).order('synced_at', { ascending: true }),
      notSnoozed(supabase.from('draft_emails').select('*').eq('status', 'draft')).order('created_at', { ascending: false }),
      notSnoozed(supabase.from('call_signals').select('*').eq('status', 'new').gte('session_date', cutoff)).order('session_date', { ascending: false }),
      notSnoozed(supabase.from('open_items').select('*').neq('status', 'closed').neq('status', 'done').gte('last_flagged_at', cutoff)).order('priority'),
    ])

    const built = []

    for (const w of waiting || []) {
      const hours = Math.round((Date.now() - new Date(w.synced_at).getTime()) / 3_600_000)
      const stale = hours >= STALE_HOURS
      const who = firstName(w.title)
      built.push({
        id: 'r-' + w.id, rank: stale ? 0 : 3, urgent: stale, mark: '⏳',
        headline: `Nudge ${who}${stale ? ' — quiet since call' : ''}`,
        when: ago(w.synced_at),
        context: w.title + (w.notes ? ' — ' + w.notes.split(' -- account_id:')[0] : ''),
        onDone: () => supabase.from('reminders').update({ completed: true }).eq('id', w.id).then(() => buildFeed()),
        onSnooze: days => supabase.from('reminders').update({ snoozed_until: snoozeUntil(days) }).eq('id', w.id).then(() => buildFeed()),
        doneLabel: 'Nudged / got it',
      })
    }

    for (const d of drafts || []) {
      built.push({
        id: 'd-' + d.id, rank: 1, mark: '✉️',
        headline: draftHeadline(d.recipient),
        when: ago(d.created_at),
        context: `"${d.subject || 'untitled'}" — go tweak and send.`,
        draftBody: d.body,
        onCopy: () => { navigator.clipboard.writeText(`Subject: ${d.subject || ''}\n\n${d.body}`); flashToast('Copied — paste into your email client.') },
        onDone: () => supabase.from('draft_emails').update({ status: 'sent' }).eq('id', d.id).then(() => buildFeed()),
        onSnooze: days => supabase.from('draft_emails').update({ snoozed_until: snoozeUntil(days) }).eq('id', d.id).then(() => buildFeed()),
        doneLabel: 'Mark sent',
      })
    }

    for (const s of signals || []) {
      const acct = s.account_name || names[s.account_id] || ''
      built.push({
        id: 's-' + s.id, rank: 5, mark: '💡',
        headline: `${acct}: ${s.headline || s.what.slice(0, 50)}`,
        when: s.session_date ? s.session_date.split('T')[0].slice(5) : '',
        context: `${s.what} ${s.gp_angle}`,
        onDone: () => supabase.from('call_signals').update({ status: 'actioned' }).eq('id', s.id).then(() => buildFeed()),
        onDismiss: () => supabase.from('call_signals').update({ status: 'dismissed' }).eq('id', s.id).then(() => buildFeed()),
        onSnooze: days => supabase.from('call_signals').update({ snoozed_until: snoozeUntil(days) }).eq('id', s.id).then(() => buildFeed()),
        doneLabel: 'Actioned',
      })
    }

    const highActions = (actions || []).filter(a => (a.priority || '').toLowerCase() === 'high')
    const restActions = (actions || []).filter(a => (a.priority || '').toLowerCase() !== 'high')
    const visibleActions = showAll ? [...highActions, ...restActions] : highActions

    for (const a of visibleActions) {
      const short = a.description.length > 50 ? a.description.slice(0, 50).trim() + '…' : a.description
      built.push({
        id: 'a-' + a.id, rank: (a.priority || '').toLowerCase() === 'high' ? 2 : 4, mark: '☐',
        headline: short,
        when: names[a.account_id] || '',
        context: a.description,
        onDone: () => supabase.from('open_items').update({ status: 'done', resolved_at: new Date().toISOString() }).eq('id', a.id).then(() => buildFeed()),
        onSnooze: days => supabase.from('open_items').update({ snoozed_until: snoozeUntil(days) }).eq('id', a.id).then(() => buildFeed()),
        doneLabel: 'Done',
      })
    }

    built.sort((a, b) => a.rank - b.rank)
    setItems(built)
    setHiddenCount(restActions.length && !showAll ? restActions.length : 0)
    setLoaded(true)
  }

  useEffect(() => {
    (async () => {
      const names = await loadAccountNames()
      await Promise.all([loadBrief(), buildFeed(names, false)])
    })()

    const channel = supabase.channel('cos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_signals' }, () => buildFeed())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' }, () => buildFeed())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_emails' }, () => buildFeed())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'open_items' }, () => buildFeed())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefings' }, () => loadBrief())
      .subscribe()

    const iv = setInterval(() => { loadBrief(); buildFeed() }, 60000)
    return () => { supabase.removeChannel(channel); clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const revealMore = () => { setShowAllActions(true); buildFeed(accountNames, true) }

  return (
    <div style={{minHeight:'100vh',background:S.bg,color:S.txt}}>
      <div style={{maxWidth:640,margin:'0 auto',padding:'40px 24px 100px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28}}>
          <button onClick={onBack} style={{background:'none',border:'none',color:S.muted,cursor:'pointer',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:6,padding:0}}>
            ← Chief of Staff
          </button>
          <div style={{fontSize:12,color:S.muted}}>since yesterday 8am</div>
        </div>

        <div style={{fontSize:17,lineHeight:1.65,marginBottom:32,paddingLeft:16,borderLeft:`3px solid ${S.blue}`}}>
          {briefContent
            ? briefContent
            : <span style={{fontSize:15,color:S.muted,fontStyle:'italic'}}>Nothing brief-worthy yet — check back after your next call.</span>}
        </div>

        {!loaded && <div style={{textAlign:'center',padding:40,color:S.muted,fontSize:13}}>Loading…</div>}

        {loaded && items.length === 0 && (
          <div style={{textAlign:'center',padding:'60px 20px',color:S.muted}}>
            <div style={{fontSize:15,color:S.txt,marginBottom:6}}>All clear.</div>
            Nothing waiting on you or anyone else right now.
          </div>
        )}

        {loaded && items.length > 0 && (
          <div>
            {items.map(item => {
              const open = openRowId === item.id
              return (
                <div key={item.id} style={{borderBottom:`1px solid ${S.bdr}`}}>
                  <div
                    onClick={() => setOpenRowId(open ? null : item.id)}
                    style={{
                      display:'flex',alignItems:'center',gap:10,padding:'13px 0',cursor:'pointer',
                      ...(item.urgent ? {background:'rgba(239,68,68,0.08)',margin:'0 -16px',padding:'13px 16px',borderRadius:8} : {}),
                    }}
                  >
                    <div style={{fontSize:14,flexShrink:0,width:18,textAlign:'center'}}>{item.mark}</div>
                    <div style={{fontSize:14.5,fontWeight:600,color:item.urgent?S.red:S.txt,flex:1,minWidth:0}}>{item.headline}</div>
                    <div style={{fontSize:12,color:S.muted,flexShrink:0,whiteSpace:'nowrap'}}>{item.when}</div>
                    <div style={{fontSize:11,color:S.muted,transition:'transform 0.15s',transform:open?'rotate(90deg)':'none',flexShrink:0}}>▸</div>
                  </div>
                  {open && (
                    <div style={{padding:'0 0 16px 28px'}}>
                      <div style={{fontSize:13.5,lineHeight:1.6,color:S.muted,marginBottom:10}}>{item.context}</div>
                      {item.draftBody && (
                        <div style={{padding:'10px 12px',background:S.surf,border:`1px solid ${S.bdr}`,borderRadius:8,fontSize:13,color:S.muted,lineHeight:1.5,whiteSpace:'pre-wrap',marginBottom:10}}>
                          {item.draftBody}
                        </div>
                      )}
                      <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'center'}}>
                        {item.onCopy && <button onClick={item.onCopy} style={{fontSize:12.5,padding:'4px 0',background:'none',border:'none',color:S.blue,cursor:'pointer',fontWeight:500}}>Copy</button>}
                        {item.onDone && <button onClick={item.onDone} style={{fontSize:12.5,padding:'4px 0',background:'none',border:'none',color:S.blue,cursor:'pointer',fontWeight:500}}>{item.doneLabel}</button>}
                        {item.onDismiss && <button onClick={item.onDismiss} style={{fontSize:12.5,padding:'4px 0',background:'none',border:'none',color:S.muted,cursor:'pointer',fontWeight:500}}>Dismiss</button>}
                        {item.onSnooze && (
                          <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'}}>
                            <span style={{fontSize:12,color:S.muted}}>Remind me:</span>
                            <button onClick={()=>item.onSnooze(1)} style={{fontSize:12,color:S.txt,border:`1px solid ${S.bdr}`,borderRadius:6,padding:'3px 8px',background:'none',cursor:'pointer'}}>tomorrow</button>
                            <button onClick={()=>item.onSnooze(3)} style={{fontSize:12,color:S.txt,border:`1px solid ${S.bdr}`,borderRadius:6,padding:'3px 8px',background:'none',cursor:'pointer'}}>in 3 days</button>
                            <button onClick={()=>item.onSnooze(7)} style={{fontSize:12,color:S.txt,border:`1px solid ${S.bdr}`,borderRadius:6,padding:'3px 8px',background:'none',cursor:'pointer'}}>next week</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {hiddenCount > 0 && (
              <div style={{textAlign:'center',padding:'20px 0'}}>
                <button onClick={revealMore} style={{background:'none',border:'none',color:S.muted,fontSize:13,cursor:'pointer',textDecoration:'underline'}}>
                  + {hiddenCount} more lower-priority item{hiddenCount!==1?'s':''}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:S.txt,color:S.bg,padding:'8px 16px',borderRadius:8,fontSize:13}}>
          {toast}
        </div>
      )}
    </div>
  )
}
