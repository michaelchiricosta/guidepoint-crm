// V3 design system — clean light SaaS, Apple blue accent
export const theme = {
  // Canvas & surfaces
  bgCanvas:      '#F4F6F9',
  bgCard:        '#FFFFFF',
  bgSidebar:     '#FFFFFF',
  bgHover:       '#F9FAFB',
  bgAccentLight: '#EBF4FF',

  // Borders
  border:        '1px solid #EEEFF2',
  borderColor:   '#EEEFF2',
  borderInput:   '1px solid #D1D5DB',

  // Accent
  accent:        '#007AFF',
  accentHover:   '#0066CC',
  accentLight:   '#EBF4FF',

  // Text
  textPrimary:   '#111827',
  textSecondary: '#6B7280',
  textLabel:     '#9CA3AF',
  textInverse:   '#FFFFFF',

  // Semantic
  success:     '#10B981',
  successBg:   '#D1FAE5',
  successText: '#059669',
  warning:     '#F59E0B',
  warningBg:   '#FEF3C7',
  warningText: '#D97706',
  danger:      '#EF4444',
  dangerBg:    '#FEE2E2',
  dangerText:  '#DC2626',

  // Shadows
  shadowCard:       '0 1px 4px rgba(0,0,0,0.06)',
  shadowCardHover:  '0 4px 12px rgba(0,0,0,0.10)',
  shadowButton:     '0 1px 3px rgba(0,122,255,0.25)',

  // Radius
  radiusCard:   '12px',
  radiusButton: '8px',
  radiusInput:  '8px',
  radiusBadge:  '20px',

  // Sidebar
  sidebarWidth: '260px',

  // Typography
  fontFamily:    'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontSizeXS:    '11px',
  fontSizeSM:    '13px',
  fontSizeMD:    '14px',
  fontSizeLG:    '16px',
  fontSizeXL:    '20px',
  fontSizeTitle: '24px',

  // Spacing
  spaceXS:  '4px',
  spaceSM:  '8px',
  spaceMD:  '16px',
  spaceLG:  '24px',
  spaceXL:  '32px',
  spaceXXL: '48px',
}

export default theme

// ── Backward-compatible S object ──────────────────────────────────────────────
// All components import `S` — this maps old property names to new theme values.
export const LIGHT_THEME = {
  bg:        theme.bgCanvas,
  surf:      theme.bgCard,
  surf2:     theme.bgHover,
  bdr:       theme.borderColor,
  bdr2:      '#D1D5DB',
  txt:       theme.textPrimary,
  muted:     theme.textSecondary,
  dim:       theme.textLabel,
  blue:      theme.accent,
  green:     theme.success,
  red:       theme.danger,
  orange:    theme.warning,
  yellow:    theme.warning,
  purple:    '#8B5CF6',
  secondary: '#374151',
  sidebarBg: theme.bgSidebar,
  headerBg:  theme.bgCard,
  isLight:   true,
  sideTxt:   theme.textPrimary,
  sideMuted: theme.textSecondary,
  sideActive: theme.bgAccentLight,
  sideBdr:   theme.borderColor,
  sideHover: theme.bgHover,
}

export const DARK_THEME = {
  bg:        '#0a0e1a',
  surf:      '#111827',
  surf2:     '#0f1729',
  bdr:       '#1e2d40',
  bdr2:      '#2d3d50',
  txt:       '#e2e8f0',
  muted:     '#64748b',
  dim:       '#334155',
  blue:      '#3b82f6',
  green:     '#22c55e',
  red:       '#ef4444',
  orange:    '#f97316',
  yellow:    '#eab308',
  purple:    '#a855f7',
  secondary: '#94a3b8',
  sidebarBg: '#0f172a',
  headerBg:  '#0c1017',
  isLight:   false,
  sideTxt:   '#e2e8f0',
  sideMuted: '#475569',
  sideActive:'rgba(59,130,246,0.15)',
  sideBdr:   '#1e2d40',
  sideHover: 'rgba(255,255,255,0.04)',
}

export const LIGHT_PC = { Critical:{c:'#EF4444',b:'#FEE2E2',d:'#EF4444'}, High:{c:'#F97316',b:'#FFEDD5',d:'#F97316'}, Medium:{c:'#F59E0B',b:'#FEF3C7',d:'#F59E0B'}, Low:{c:'#10B981',b:'#D1FAE5',d:'#10B981'} }
export const DARK_PC  = { Critical:{c:'#fc413d',b:'rgba(252,65,61,0.1)',d:'#fc413d'}, High:{c:'#fc5c30',b:'rgba(252,92,48,0.1)',d:'#fc5c30'}, Medium:{c:'#fec700',b:'rgba(254,199,0,0.12)',d:'#fec700'}, Low:{c:'#0ebc5f',b:'rgba(14,188,95,0.1)',d:'#0ebc5f'} }

export const LIGHT_IC = { 'Executive Sponsor':{c:'#8B5CF6',b:'#EDE9FE'}, 'Technical Gatekeeper':{c:'#007AFF',b:'#EBF4FF'}, 'Financial Gatekeeper':{c:'#F59E0B',b:'#FEF3C7'}, 'Final Approval':{c:'#EF4444',b:'#FEE2E2'}, 'Stakeholder':{c:'#6B7280',b:'#F3F4F6'}, 'Risk Factor':{c:'#F97316',b:'#FFEDD5'}, 'Ally':{c:'#10B981',b:'#D1FAE5'} }
export const DARK_IC  = { 'Executive Sponsor':{c:'#a855f7',b:'rgba(168,85,247,0.12)'}, 'Technical Gatekeeper':{c:'#3b82f6',b:'rgba(59,130,246,0.12)'}, 'Financial Gatekeeper':{c:'#eab308',b:'rgba(234,179,8,0.12)'}, 'Final Approval':{c:'#ef4444',b:'rgba(239,68,68,0.12)'}, 'Stakeholder':{c:'#64748b',b:'rgba(100,116,139,0.12)'}, 'Risk Factor':{c:'#f97316',b:'rgba(249,115,22,0.12)'}, 'Ally':{c:'#22c55e',b:'rgba(34,197,94,0.12)'} }

export let S  = LIGHT_THEME
export let PC = LIGHT_PC
export let IC = LIGHT_IC

export function applyTheme(t) {
  S  = t === 'light' ? LIGHT_THEME : DARK_THEME
  PC = t === 'light' ? LIGHT_PC   : DARK_PC
  IC = t === 'light' ? LIGHT_IC   : DARK_IC
}
