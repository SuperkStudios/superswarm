import React, { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';
import DirectorySkillsTab from './DirectorySkillsTab';
import DirectoryConnectorsTab from './DirectoryConnectorsTab';

export type DirectoryTab = 'skills' | 'connectors';

interface Props {
  open: boolean;
  initialTab?: DirectoryTab;
  onClose: () => void;
  /** Installed-item affordance: jump to the item's management surface (Skills / Tools settings tab). */
  onOpenInstalledSkill?: (skillId: string) => void;
  onOpenInstalledConnector?: (toolId: string) => void;
}

// The claude.ai Directory, one for one: serif title, left rail with Skills + Connectors (no Plugins,
// deliberately), search + filter chrome per tab, and a two-column card grid.
const DirectoryDialog: React.FC<Props> = ({ open, initialTab = 'skills', onClose, onOpenInstalledSkill, onOpenInstalledConnector }) => {
  const c = useClaudeTokens();
  const [tab, setTab] = useState<DirectoryTab>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  const railRow = (value: DirectoryTab, label: string, icon: React.ReactNode) => {
    const selected = tab === value;
    return (
      <Box
        role="button"
        onClick={() => setTab(value)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1,
          borderRadius: `${c.radius.md}px`, cursor: 'pointer', userSelect: 'none',
          bgcolor: selected ? c.bg.secondary : 'transparent',
          transition: 'background 0.12s',
          '&:hover': { bgcolor: selected ? c.bg.secondary : c.bg.elevated },
        }}
      >
        {icon}
        <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: c.text.primary }}>{label}</Typography>
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: 'min(1180px, calc(100vw - 64px))', height: 'min(820px, calc(100vh - 64px))',
          bgcolor: c.bg.surface, backgroundImage: 'none', borderRadius: '16px',
          border: `1px solid ${c.border.subtle}`, boxShadow: c.shadow.lg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', px: 3.5, pt: 3, pb: 1.5, flexShrink: 0 }}>
        <Typography sx={{ fontSize: '1.75rem', fontWeight: 600, color: c.text.primary, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.15 }}>
          Directory
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: c.text.tertiary, mt: -0.5, mr: -1, '&:hover': { color: c.text.primary } }}>
          <CloseIcon sx={{ fontSize: 22 }} />
        </IconButton>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box sx={{ width: 220, minWidth: 220, px: 2, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {railRow('skills', 'Skills', <DescriptionOutlinedIcon sx={{ fontSize: 19, color: c.text.secondary }} />)}
          {railRow('connectors', 'Connectors', <GridViewOutlinedIcon sx={{ fontSize: 19, color: c.text.secondary }} />)}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', pr: 3.5, pl: 1, pb: 3 }}>
          {tab === 'skills' ? (
            <DirectorySkillsTab onOpenInstalled={onOpenInstalledSkill} />
          ) : (
            <DirectoryConnectorsTab onOpenInstalled={onOpenInstalledConnector} />
          )}
        </Box>
      </Box>
    </Dialog>
  );
};

export default DirectoryDialog;
