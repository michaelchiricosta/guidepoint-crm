export const DARK_THEME = { bg:'#0a0e1a', surf:'#111827', surf2:'#0f1729', bdr:'#1e2d40', bdr2:'#2d3d50', txt:'#e2e8f0', muted:'#64748b', dim:'#334155', blue:'#3b82f6', green:'#22c55e', red:'#ef4444', orange:'#f97316', yellow:'#eab308', purple:'#a855f7', secondary:'#94a3b8', sidebarBg:'#060a12', headerBg:'#0c1017', isLight:false, sideTxt:'#e2e8f0', sideMuted:'#475569', sideActive:'rgba(59,130,246,0.15)', sideBdr:'#1e2d40', sideHover:'rgba(255,255,255,0.04)' }
export const LIGHT_THEME = { bg:'#f1f5f9', surf:'#ffffff', surf2:'#f8fafc', bdr:'#e2e8f0', bdr2:'#cbd5e1', txt:'#0f172a', muted:'#64748b', dim:'#94a3b8', blue:'#2563eb', green:'#16a34a', red:'#dc2626', orange:'#ea580c', yellow:'#ca8a04', purple:'#7c3aed', secondary:'#475569', sidebarBg:'linear-gradient(180deg,#0f1729 0%,#1a2744 60%,#0f1729 100%)', headerBg:'#ffffff', isLight:true, sideTxt:'#e2e8f0', sideMuted:'#64748b', sideActive:'rgba(37,99,235,0.15)', sideBdr:'rgba(255,255,255,0.06)', sideHover:'rgba(255,255,255,0.06)' }

export const DARK_PC  = { Critical:{c:'#fc413d',b:'rgba(252,65,61,0.1)',d:'#fc413d'},  High:{c:'#fc5c30',b:'rgba(252,92,48,0.1)',d:'#fc5c30'},  Medium:{c:'#fec700',b:'rgba(254,199,0,0.12)',d:'#fec700'},  Low:{c:'#0ebc5f',b:'rgba(14,188,95,0.1)',d:'#0ebc5f'}  }
export const LIGHT_PC = { Critical:{c:'#fc413d',b:'rgba(252,65,61,0.1)',d:'#fc413d'},  High:{c:'#fc5c30',b:'rgba(252,92,48,0.1)',d:'#fc5c30'},  Medium:{c:'#b38a00',b:'rgba(254,199,0,0.12)',d:'#fec700'}, Low:{c:'#0ebc5f',b:'rgba(14,188,95,0.1)',d:'#0ebc5f'}  }

export const DARK_IC = { 'Executive Sponsor':{c:'#a855f7',b:'rgba(168,85,247,0.12)'}, 'Technical Gatekeeper':{c:'#3b82f6',b:'rgba(59,130,246,0.12)'}, 'Financial Gatekeeper':{c:'#eab308',b:'rgba(234,179,8,0.12)'}, 'Final Approval':{c:'#ef4444',b:'rgba(239,68,68,0.12)'}, 'Stakeholder':{c:'#64748b',b:'rgba(100,116,139,0.12)'}, 'Risk Factor':{c:'#f97316',b:'rgba(249,115,22,0.12)'}, 'Ally':{c:'#22c55e',b:'rgba(34,197,94,0.12)'} }
export const LIGHT_IC = { 'Executive Sponsor':{c:'#7c3aed',b:'#ede9fe'}, 'Technical Gatekeeper':{c:'#1d4ed8',b:'#dbeafe'}, 'Financial Gatekeeper':{c:'#a16207',b:'#fef9c3'}, 'Final Approval':{c:'#dc2626',b:'#fee2e2'}, 'Stakeholder':{c:'#475569',b:'#f1f5f9'}, 'Risk Factor':{c:'#c2410c',b:'#ffedd5'}, 'Ally':{c:'#15803d',b:'#dcfce7'} }

export let S = LIGHT_THEME
export let PC = LIGHT_PC
export let IC = LIGHT_IC

export function applyTheme(t) {
  S = t === 'light' ? LIGHT_THEME : DARK_THEME
  PC = t === 'light' ? LIGHT_PC : DARK_PC
  IC = t === 'light' ? LIGHT_IC : DARK_IC
}
