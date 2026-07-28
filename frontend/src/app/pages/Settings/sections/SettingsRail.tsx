import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { User, Settings2, Palette, ShieldCheck, Wrench, Boxes, Sparkles, Hammer, SquareSlash, BarChart3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';

// ChatGPT/Apple-style settings nav: a left rail of short, focused sections instead of one giant
// General scroll. Grouped so the eye lands (account, then app-wide, then capabilities).
export interface RailSection {
  value: string;
  label: string;
  Icon: LucideIcon;
}

interface RailGroup {
  header: string | null;
  sections: RailSection[];
}

export const RAIL_GROUPS: RailGroup[] = [
  { header: null, sections: [
    { value: 'account', label: 'Account', Icon: User },
  ] },
  { header: 'App', sections: [
    { value: 'general', label: 'General', Icon: Settings2 },
    { value: 'appearance', label: 'Appearance', Icon: Palette },
    { value: 'privacy', label: 'Privacy', Icon: ShieldCheck },
    { value: 'advanced', label: 'Advanced', Icon: Wrench },
  ] },
  { header: 'Capabilities', sections: [
    { value: 'models', label: 'Models', Icon: Boxes },
    { value: 'skills', label: 'Skills', Icon: Sparkles },
    { value: 'tools', label: 'Tools', Icon: Hammer },
    { value: 'commands', label: 'Commands', Icon: SquareSlash },
    { value: 'usage', label: 'Usage', Icon: BarChart3 },
  ] },
];

export function railLabelFor(value: string): string {
  for (const g of RAIL_GROUPS) {
    const hit = g.sections.find((s) => s.value === value);
    if (hit) return hit.label;
  }
  return 'Settings';
}

const SettingsRail: React.FC<{
  activeTab: string;
  onTabChange: (v: string) => void;
}> = ({ activeTab, onTabChange }) => {
  const c = useClaudeTokens();
  return (
    <Box sx={{
      width: 192, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderRight: `1px solid ${c.border.subtle}`, bgcolor: c.bg.surface,
      px: 1.25, py: 1.75, overflowY: 'auto',
    }}>
      <Typography sx={{ color: c.text.primary, fontWeight: 600, fontSize: c.font.size.md, px: 1, pb: 1 }}>
        Settings
      </Typography>
      {RAIL_GROUPS.map((group) => (
        <Box key={group.header ?? 'top'} sx={{ mb: 0.5 }}>
          {group.header && (
            <Typography sx={{
              color: c.text.ghost, fontSize: '0.6875rem', fontWeight: 700,
              letterSpacing: '0.07em', textTransform: 'uppercase', px: 1, pt: 1.5, pb: 0.5,
            }}>
              {group.header}
            </Typography>
          )}
          {group.sections.map((s) => {
            const selected = activeTab === s.value;
            return (
              <Box
                key={s.value}
                component="button"
                onClick={() => onTabChange(s.value)}
                data-onboarding={s.value === 'models' ? 'settings-models-tab' : undefined}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.25, width: '100%',
                  px: 1, py: 0.75, mb: '2px', border: 'none', borderRadius: '8px',
                  bgcolor: selected ? `${c.accent.primary}1F` : 'transparent',
                  color: selected ? c.text.primary : c.text.secondary,
                  fontFamily: 'inherit', fontSize: c.font.size.base, fontWeight: selected ? 600 : 500,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'background-color 0.12s, color 0.12s',
                  '&:hover': selected ? {} : { bgcolor: `${c.text.tertiary}0F`, color: c.text.primary },
                }}
              >
                <s.Icon size={15} style={{ flexShrink: 0, opacity: selected ? 1 : 0.75 }} />
                {s.label}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
};

export default SettingsRail;
