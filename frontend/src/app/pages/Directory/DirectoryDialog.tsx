import React, { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import FolderSpecialOutlinedIcon from '@mui/icons-material/FolderSpecialOutlined';
import PowerOutlinedIcon from '@mui/icons-material/PowerOutlined';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';
import DirectorySkillsTab from './DirectorySkillsTab';
import DirectoryConnectorsTab from './DirectoryConnectorsTab';

// Lazy: the manage views pull the full Skills/Tools pages (markdown, MCP cards) and the marketplace opens from the dock.
const SkillsManage = React.lazy(() => import('../Skills/Skills'));
const ToolsManage = React.lazy(() => import('../Tools/Tools'));

export type DirectoryTab = 'skills' | 'connectors' | 'my-skills' | 'my-connectors';

interface Props {
  open: boolean;
  initialTab?: DirectoryTab;
  onClose: () => void;
}

// The Marketplace: lands on claude.ai's Directory grids (the store), with the installed-item
// manage pages as their own rail rows below the divider, claude's settings-rail grammar.
const DirectoryDialog: React.FC<Props> = ({ open, initialTab = 'skills', onClose }) => {
  const c = useClaudeTokens();
  const [view, setView] = useState<DirectoryTab>(initialTab);
  const [focusSkillId, setFocusSkillId] = useState<string | null>(null);
  const [focusToolId, setFocusToolId] = useState<string | null>(null);
  useEffect(() => { if (open) { setView(initialTab); setFocusSkillId(null); setFocusToolId(null); } }, [open, initialTab]);

  const railRow = (value: DirectoryTab, label: string, icon: React.ReactNode) => {
    const selected = view === value;
    return (
      <Box
        role="button"
        onClick={() => setView(value)}
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

  const spinner = (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <CircularProgress size={24} sx={{ color: c.accent.primary }} />
    </Box>
  );

  const content = (): React.ReactElement => {
    switch (view) {
      case 'skills':
        return <DirectorySkillsTab onOpenInstalled={(id) => { setFocusSkillId(id); setView('my-skills'); }} />;
      case 'connectors':
        return <DirectoryConnectorsTab onOpenInstalled={(id) => { setFocusToolId(id); setView('my-connectors'); }} />;
      case 'my-skills':
        return <SkillsManage onBrowseDirectory={() => setView('skills')} focusSkillId={focusSkillId} />;
      case 'my-connectors':
        return <ToolsManage onBrowseConnectors={() => setView('connectors')} expandToolId={focusToolId} />;
    }
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
          Marketplace
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: c.text.tertiary, mt: -0.5, mr: -1, '&:hover': { color: c.text.primary } }}>
          <CloseIcon sx={{ fontSize: 22 }} />
        </IconButton>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box sx={{ width: 220, minWidth: 220, px: 2, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {railRow('skills', 'Skills', <DescriptionOutlinedIcon sx={{ fontSize: 19, color: c.text.secondary }} />)}
          {railRow('connectors', 'Connectors', <GridViewOutlinedIcon sx={{ fontSize: 19, color: c.text.secondary }} />)}
          <Box sx={{ height: '1px', bgcolor: c.border.subtle, mx: 1.5, my: 1 }} />
          {railRow('my-skills', 'My skills', <FolderSpecialOutlinedIcon sx={{ fontSize: 19, color: c.text.secondary }} />)}
          {railRow('my-connectors', 'My connectors', <PowerOutlinedIcon sx={{ fontSize: 19, color: c.text.secondary }} />)}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', pr: 3.5, pl: 1, pb: 3 }}>
          <React.Suspense fallback={spinner}>
            {content()}
          </React.Suspense>
        </Box>
      </Box>
    </Dialog>
  );
};

export default DirectoryDialog;
