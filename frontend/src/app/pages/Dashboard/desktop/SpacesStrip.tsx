import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Plus } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { createDashboard } from '@/shared/state/dashboardsSlice';

// macOS Spaces, one for one: rest the cursor on the top edge and the spaces bar slides down,
// full-size thumbnail tiles with the name beneath, + at the right end to add a space. It stays
// up while the cursor is anywhere near the bar and only leaves once you move well below it
// (mouseleave flicker is exactly what Mission Control does not do). Replaces the sidebar.
const HOT_ZONE_PX = 3;
const TILE_W = 176;
const TILE_H = 104;
const DISMISS_BELOW_PX = 72;

const SpacesStrip: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const dashboards = useAppSelector((s) => s.dashboards.items);
  const [open, setOpen] = React.useState(false);
  const barRef = React.useRef<HTMLDivElement | null>(null);

  const activeId = React.useMemo(() => {
    const m = location.pathname.match(/\/dashboard\/([^/]+)/);
    return m ? m[1] : null;
  }, [location.pathname]);

  const list = React.useMemo(
    () => Object.values(dashboards).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [dashboards],
  );

  // Mission Control dismissal: while open, watch the cursor globally and close only once it has
  // moved a comfortable distance BELOW the bar; hovering within or near the bar never flickers.
  React.useEffect(() => {
    if (!open) return undefined;
    const onMove = (e: MouseEvent): void => {
      const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 0;
      if (e.clientY > barBottom + DISMISS_BELOW_PX) setOpen(false);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [open]);

  const addSpace = (): void => {
    void dispatch(createDashboard('Untitled Dashboard')).then((result) => {
      if (createDashboard.fulfilled.match(result)) {
        navigate(`/dashboard/${(result.payload as { id: string }).id}`);
        setOpen(false);
      }
    });
  };

  return (
    <>
      <Box onMouseEnter={() => setOpen(true)} sx={{ position: 'fixed', top: 0, left: 0, right: 0, height: HOT_ZONE_PX, zIndex: 99998 }} />
      <Box
        ref={barRef}
        sx={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 2.25,
          px: 3, pt: 2, pb: 1.75,
          background: 'rgba(22,20,26,0.45)',
          backdropFilter: 'blur(30px) saturate(150%)',
          WebkitBackdropFilter: 'blur(30px) saturate(150%)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          transform: open ? 'translateY(0)' : 'translateY(-110%)',
          transition: 'transform 260ms cubic-bezier(0.22,1,0.36,1)',
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
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
                p: 0, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                '&:hover .osw-space-tile': { boxShadow: '0 0 0 3px rgba(255,255,255,0.65), 0 10px 26px rgba(0,0,0,0.4)' },
              }}
            >
              <Box
                className="osw-space-tile"
                sx={{
                  width: TILE_W, height: TILE_H, borderRadius: '10px', overflow: 'hidden',
                  background: 'rgba(255,255,255,0.08)',
                  boxShadow: active
                    ? '0 0 0 3px rgba(255,255,255,0.9), 0 10px 26px rgba(0,0,0,0.4)'
                    : '0 0 0 1px rgba(255,255,255,0.14), 0 8px 20px rgba(0,0,0,0.35)',
                  transition: 'box-shadow 140ms',
                }}
              >
                {d.thumbnail ? (
                  <Box component="img" src={d.thumbnail} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <Box sx={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))' }} />
                )}
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.92)', fontSize: '0.8125rem', fontWeight: active ? 600 : 500, maxWidth: TILE_W, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.name || 'Untitled'}
              </Typography>
            </Box>
          );
        })}
        <Box
          component="button"
          aria-label="New dashboard"
          onClick={addSpace}
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: TILE_H, borderRadius: '10px', cursor: 'pointer',
            border: '1.5px dashed rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.85)', flexShrink: 0,
            transition: 'background 140ms, border-color 140ms',
            '&:hover': { background: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.6)' },
          }}
        >
          <Plus size={22} />
        </Box>
      </Box>
    </>
  );
};

export default SpacesStrip;
