import React from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import LanguageIcon from '@mui/icons-material/Language';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import SettingsIcon from '@mui/icons-material/Settings';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import { useAppDispatch } from '@/shared/hooks';
import { openSettingsCard, openWorkflowsApp } from '@/shared/state/dashboardLayoutSlice';

// The dock reserves room for these before it knows what they are, so the count lives with the list.
export const DOCK_ACTION_COUNT = 4;

interface DockActionTilesProps {
  tile: number;
  onAddBrowser: () => void;
  onApplications: () => void;
  onHoverAway: () => void;
}

/** The dock's fixed group: browser, workflows, then settings + applications under their own divider. */
function DockActionTiles({ tile, onAddBrowser, onApplications, onHoverAway }: DockActionTilesProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const actions: { label: string; icon: React.ReactNode; act: () => void; divider?: boolean; bg?: string }[] = [
    { label: 'New browser', icon: <LanguageIcon sx={{ color: '#e8e8ee' }} />, act: onAddBrowser },
    { label: 'Workflows', icon: <EventRepeatIcon sx={{ color: '#e8e8ee' }} />, act: () => dispatch(openWorkflowsApp()) },
    { label: 'Settings', icon: <SettingsIcon sx={{ color: '#e8e8ee' }} />, act: () => dispatch(openSettingsCard()), divider: true },
    { label: 'Applications', icon: <AppsRoundedIcon sx={{ color: '#e8e8ee' }} />, act: onApplications, bg: 'linear-gradient(135deg, #3d3d46, #232329)' },
  ];

  return (
    <>
      {actions.map((a) => (
        <React.Fragment key={a.label}>
          {a.divider && <Box sx={{ width: tile - 8, height: '1px', background: 'rgba(255,255,255,0.14)' }} />}
          <Tooltip title={a.label} placement="right">
            <Box
              className="osw-dock-tile"
              onClick={a.act}
              onMouseEnter={onHoverAway}
              sx={{
                width: tile,
                height: tile,
                borderRadius: '12px',
                background: a.bg ?? 'linear-gradient(135deg, #5a5a62, #34343c)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {a.icon}
            </Box>
          </Tooltip>
        </React.Fragment>
      ))}
    </>
  );
}

export default DockActionTiles;
