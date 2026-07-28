import React from 'react';
import Box from '@mui/material/Box';
import { Plus } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { createDashboard } from '@/shared/state/dashboardsSlice';

// macOS Spaces, one for one: rest the cursor on the very top edge and a translucent bar of
// dashboard "spaces" slides down (Mission Control's spaces row), click switches, + adds one.
// This replaces the sidebar as the dashboard switcher; tools live in the dock, search on Cmd+K.
const HOT_ZONE_PX = 3;
const CLOSE_DELAY_MS = 280;

const SpacesStrip: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const dashboards = useAppSelector((s) => s.dashboards.items);
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);

  const activeId = React.useMemo(() => {
    const m = location.pathname.match(/\/dashboard\/([^/]+)/);
    return m ? m[1] : null;
  }, [location.pathname]);

  const list = React.useMemo(
    () => Object.values(dashboards).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [dashboards],
  );

  const hold = (): void => { if (closeTimer.current) window.clearTimeout(closeTimer.current); };
  const reveal = (): void => { hold(); setOpen(true); };
  const scheduleClose = (): void => { hold(); closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS); };

  const addSpace = (): void => {
    void dispatch(createDashboard('Untitled Dashboard')).then((result) => {
      if (createDashboard.fulfilled.match(result)) navigate(`/dashboard/${(result.payload as { id: string }).id}`);
    });
  };

  return (
    <>
      <Box onMouseEnter={reveal} sx={{ position: 'fixed', top: 0, left: 0, right: 0, height: HOT_ZONE_PX, zIndex: 99998 }} />
      <Box
        onMouseEnter={reveal}
        onMouseLeave={scheduleClose}
        sx={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
          px: 2, py: 1.25,
          background: 'rgba(24,22,28,0.42)',
          backdropFilter: 'blur(26px) saturate(150%)',
          WebkitBackdropFilter: 'blur(26px) saturate(150%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          transform: open ? 'translateY(0)' : 'translateY(-110%)',
          transition: 'transform 220ms cubic-bezier(0.22,1,0.36,1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {list.map((d) => {
          const active = d.id === activeId;
          return (
            <Box
              key={d.id}
              component="button"
              onClick={() => { navigate(`/dashboard/${d.id}`); setOpen(false); }}
              sx={{
                px: 2, py: 0.8, borderRadius: '9px', cursor: 'pointer',
                border: active ? '2px solid rgba(255,255,255,0.85)' : '1px solid rgba(255,255,255,0.18)',
                background: active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.92)', fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: active ? 600 : 500,
                whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                transition: 'background 130ms, border-color 130ms',
                '&:hover': { background: 'rgba(255,255,255,0.18)' },
              }}
            >
              {d.name || 'Untitled'}
            </Box>
          );
        })}
        <Box
          component="button"
          aria-label="New dashboard"
          onClick={addSpace}
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: '9px', cursor: 'pointer',
            border: '1px dashed rgba(255,255,255,0.35)', background: 'transparent',
            color: 'rgba(255,255,255,0.85)',
            transition: 'background 130ms',
            '&:hover': { background: 'rgba(255,255,255,0.14)' },
          }}
        >
          <Plus size={16} />
        </Box>
      </Box>
    </>
  );
};

export default SpacesStrip;
