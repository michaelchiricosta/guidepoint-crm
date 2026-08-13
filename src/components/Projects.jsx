import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { uid, parseCost } from '../utils.js'
import { STAGES, PROJ_STATS } from '../constants.js'

// Section order top to bottom. Won/Lost are collapsed by default.
const STATUS_ORDER = ['In Flight', 'In Discussion', 'Not Started', 'Stalled', 'Won', 'Lost']
const COLLAPSIBLE_STATUSES = new Set(['Won', 'Lost'])

const STATUS_DOT = {
  'Not Started': '#9CA3AF',
  'In Discussion': '#3B82F6',
  'In Flight': '#10B981',
  'Stalled': '#F59E0B',
  'Won': '#8B5CF6',
  'Lost': '#EF4444',
}

const fmtMoney = n => (n ? `$${Math.round(n).toLocaleString('en-US')}` : '')

const blank = { id: '', name: '', stage: STAGES[0], status: 'In Flight', estimatedGrossProfit: '', statusNote: '' }

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 13, color: '#111827', outline: 'none', background: '#fff' }

function EditRow({ form, setForm, onSave, onCancel }) {
  const canSave = form.name.trim().length > 0
  return (
    <div style={{ padding: '12px', background: '#F9FAFB', border: '1px solid #EEEFF2', borderRadius: 8, marginBottom: 4 }}>
      <input
        value={form.name}
        onChange={e => setForm({ ...form, name: e.target.value })}
        placeholder="Project name"
        autoFocus
        style={{ ...inputStyle, fontWeight: 600, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} style={{ ...inputStyle, flex: '1 1 140px' }}>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={{ ...inputStyle, flex: '1 1 140px' }}>
          {PROJ_STATS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ position: 'relative', flex: '1 1 140px' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#64748b' }}>$</span>
          <input
            type="number"
            value={form.estimatedGrossProfit}
            onChange={e => setForm({ ...form, estimatedGrossProfit: e.target.value })}
            placeholder="0"
            style={{ ...inputStyle, paddingLeft: 22 }}
          />
        </div>
      </div>
      <input
        value={form.statusNote}
        onChange={e => setForm({ ...form, statusNote: e.target.value })}
        placeholder="What's the current situation?"
        style={{ ...inputStyle, marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button onClick={onSave} disabled={!canSave} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: canSave ? '#007AFF' : '#BFDBFE', color: '#fff', fontSize: 12, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed' }}>Save</button>
      </div>
    </div>
  )
}

function ProjectRow({ proj, onEdit, onDelete }) {
  const dot = STATUS_DOT[proj.status] || '#9CA3AF'
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '6px 4px', borderBottom: '1px solid #F3F4F6' }}
      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</div>
        {proj.statusNote && <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.statusNote}</div>}
      </div>
      <span style={{ fontSize: 11, fontWeight: 500, color: '#374151', background: '#F3F4F6', borderRadius: 999, padding: '3px 10px', flexShrink: 0, whiteSpace: 'nowrap' }}>{proj.stage || '—'}</span>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', flexShrink: 0, minWidth: 64, textAlign: 'right' }}>{fmtMoney(parseCost(proj.estimatedGrossProfit || ''))}</div>
      <button onClick={() => onEdit(proj)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex', flexShrink: 0 }}
        onMouseEnter={e => e.currentTarget.style.color = '#007AFF'} onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
        <Pencil size={14} />
      </button>
      <button onClick={() => onDelete(proj)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex', flexShrink: 0 }}
        onMouseEnter={e => e.currentTarget.style.color = '#EF4444'} onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export default function Projects({ acct, setAcct }) {
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [collapsed, setCollapsed] = useState(new Set(['Won', 'Lost']))

  const projects = acct.projects || []

  const startAdd = () => {
    setEditingId('__new__')
    setEditForm({ ...blank })
  }
  const startEdit = (proj) => {
    setEditingId(proj.id)
    setEditForm({
      id: proj.id,
      name: proj.name || '',
      stage: proj.stage || STAGES[0],
      status: proj.status || 'Not Started',
      estimatedGrossProfit: proj.estimatedGrossProfit ? String(parseCost(proj.estimatedGrossProfit)) : '',
      statusNote: proj.statusNote || '',
    })
  }
  const cancelEdit = () => { setEditingId(null); setEditForm(null) }
  const saveEdit = () => {
    if (!editForm?.name?.trim()) return
    const gpVal = fmtMoney(parseFloat(editForm.estimatedGrossProfit) || 0)
    const cleaned = { ...editForm, name: editForm.name.trim(), estimatedGrossProfit: gpVal }
    if (editingId === '__new__') {
      const { id: _drop, ...rest } = cleaned
      setAcct(prev => ({ ...prev, projects: [...(prev.projects || []), { ...rest, id: uid() }] }))
    } else {
      setAcct(prev => ({ ...prev, projects: (prev.projects || []).map(p => p.id === editingId ? { ...p, ...cleaned } : p) }))
    }
    cancelEdit()
  }
  const deleteProject = (proj) => {
    if (!window.confirm(`Delete "${proj.name}"?`)) return
    window._lastDirectSave = Date.now()
    setAcct(prev => ({ ...prev, projects: (prev.projects || []).filter(p => p.id !== proj.id) }))
    if (editingId === proj.id) cancelEdit()
  }
  const toggleCollapse = (status) => setCollapsed(prev => {
    const n = new Set(prev)
    n.has(status) ? n.delete(status) : n.add(status)
    return n
  })

  const grouped = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = projects.filter(p => (p.status || 'Not Started') === s)
    return acc
  }, {})

  const activeProjects = projects.filter(p => p.status !== 'Won' && p.status !== 'Lost')
  const totalActiveGP = activeProjects.reduce((s, p) => s + parseCost(p.estimatedGrossProfit || ''), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Projects</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#007AFF', background: '#EBF4FF', borderRadius: 999, padding: '2px 9px' }}>{projects.length}</span>
        </div>
        <button onClick={startAdd} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add Project</button>
      </div>

      {projects.length === 0 && editingId !== '__new__' && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF', fontSize: 13 }}>No projects yet.</div>
      )}

      {STATUS_ORDER.map(status => {
        const items = grouped[status]
        const showNewRowHere = editingId === '__new__' && status === 'In Flight'
        if (items.length === 0 && !showNewRowHere) return null
        const isCollapsible = COLLAPSIBLE_STATUSES.has(status)
        const isCollapsed = isCollapsible && collapsed.has(status)
        return (
          <div key={status}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0 6px' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{status} ({items.length})</span>
              {isCollapsible && items.length > 0 && (
                <button onClick={() => toggleCollapse(status)} style={{ background: 'none', border: 'none', color: '#007AFF', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  {isCollapsed ? `Show ${items.length} ${status.toLowerCase()}` : 'Hide'}
                </button>
              )}
            </div>
            {!isCollapsed && (
              <>
                {showNewRowHere && <EditRow form={editForm} setForm={setEditForm} onSave={saveEdit} onCancel={cancelEdit} />}
                {items.map(p => (
                  editingId === p.id
                    ? <EditRow key={p.id} form={editForm} setForm={setEditForm} onSave={saveEdit} onCancel={cancelEdit} />
                    : <ProjectRow key={p.id} proj={p} onEdit={startEdit} onDelete={deleteProject} />
                ))}
              </>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, padding: '14px 4px 0', fontSize: 13, color: '#6B7280' }}>
        <span>{activeProjects.length} active project{activeProjects.length !== 1 ? 's' : ''}</span>
        <span>{fmtMoney(totalActiveGP)} est. GP</span>
      </div>
    </div>
  )
}
