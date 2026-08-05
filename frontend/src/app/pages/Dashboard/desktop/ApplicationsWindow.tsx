import React, { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import { EmptyState } from '@/app/components/feedback/Loading';
import { DarkTokensScope } from '@/shared/styles/ThemeContext';
import type { Output } from '@/shared/state/outputsSlice';

interface ApplicationsWindowProps {
  outputs: Record<string, Output>;
  onOpenApp: (outputId: string) => void;
  onClose: () => void;
}

// Stable per-app hue so icon-less apps are told apart at a glance; the old shared orange made every fallback tile an identical twin.
function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

function AppTile({ output }: { output: Output }): React.ReactElement {
  const tile = {
    width: 64,
    height: 64,
    borderRadius: '15px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    // Hairline inset so screenshots and light tiles read as crafted app icons on the glass, not raw pasted images.
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12), 0 4px 14px rgba(0,0,0,0.28)',
  } as const;
  if (output.thumbnail) {
    return <Box component="img" src={output.thumbnail} alt="" sx={{ ...tile, objectFit: 'cover' }} />;
  }
  const glyph = (output.icon || '').trim();
  const h = hueFor(output.name || '?');
  return (
    <Box
      sx={{
        ...tile,
        background: `linear-gradient(160deg, hsl(${h}, 42%, 52%), hsl(${(h + 24) % 360}, 48%, 34%))`,
        fontSize: glyph && glyph.length <= 3 ? '1.5rem' : '1.375rem',
        fontWeight: 590,
        color: 'rgba(255,255,255,0.94)',
      }}
    >
      {glyph && glyph.length <= 3 ? glyph : (output.name || '?').trim().charAt(0).toUpperCase()}
    </Box>
  );
}

/** Launchpad-style window over the canvas: the user's OpenSwarm apps, newest first. Deliberately NOT the machine's /Applications; this launcher is for things built in OpenSwarm. */
function ApplicationsWindow({ outputs, onOpenApp, onClose }: ApplicationsWindowProps): React.ReactElement {
  const [query, setQuery] = useState('');

  const apps = useMemo(() => {
    const all = Object.values(outputs);
    const q = query.trim().toLowerCase();
    const matched = q
      ? all.filter((o) => o.name.toLowerCase().includes(q) || (o.description || '').toLowerCase().includes(q))
      : all;
    return [...matched].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }, [outputs, query]);

  return (
    <>
      <Box onClick={onClose} sx={{ position: 'absolute', inset: 0, zIndex: 19 }} />
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          width: 620,
          maxWidth: 'calc(100% - 80px)',
          maxHeight: 'calc(100% - 120px)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '18px',
          background: 'rgba(22,12,34,0.82)',
          backdropFilter: 'blur(28px) saturate(160%)',
          WebkitBackdropFilter: 'blur(28px) saturate(160%)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          p: 2.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 2, px: 0.5 }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 590, letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.92)' }}>
            Applications
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.42)' }}>
            {Object.keys(outputs).length > 0 ? Object.keys(outputs).length : ''}
          </Typography>
        </Box>

        {Object.keys(outputs).length > 8 && (
          <Box
            component="input"
            autoFocus
            value={query}
            placeholder="Search your apps"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            sx={{
              mb: 2,
              px: 1.5,
              py: 0.75,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: '0.8125rem',
              fontFamily: 'inherit',
              outline: 'none',
              '&::placeholder': { color: 'rgba(255,255,255,0.45)' },
            }}
          />
        )}

        <Box sx={{ overflowY: 'auto', flex: 1, minHeight: 120 }}>
          {apps.length === 0 && (
            // The window is glass over the canvas, so the shared empty state needs dark-surface tokens to be readable.
            <DarkTokensScope>
              {Object.keys(outputs).length === 0 ? (
                <EmptyState
                  icon={<GridViewRoundedIcon sx={{ fontSize: 32 }} />}
                  title="No apps yet"
                  hint="Ask an agent to build one and it lands here."
                />
              ) : (
                <EmptyState title="No apps match that search." />
              )}
            </DarkTokensScope>
          )}
          {apps.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 1, pb: 0.5 }}>
              {apps.map((output) => (
                <Box
                  key={output.id}
                  onClick={() => { onOpenApp(output.id); onClose(); }}
                  title={output.description || output.name}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                    py: 1.25,
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.07)' },
                    '&:hover .osw-app-tile': { transform: 'scale(1.05)' },
                    '&:active .osw-app-tile': { transform: 'scale(0.97)' },
                  }}
                >
                  <Box className="osw-app-tile" sx={{ transition: 'transform 0.16s ease', display: 'flex' }}>
                    <AppTile output={output} />
                  </Box>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(255,255,255,0.86)', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', px: 0.5 }}>
                    {output.name}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}

export default ApplicationsWindow;
