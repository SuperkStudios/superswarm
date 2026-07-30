import React, { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import type { Output } from '@/shared/state/outputsSlice';

interface ApplicationsWindowProps {
  outputs: Record<string, Output>;
  onOpenApp: (outputId: string) => void;
  onClose: () => void;
}

function AppTile({ output }: { output: Output }): React.ReactElement {
  const tile = {
    width: 52,
    height: 52,
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as const;
  if (output.thumbnail) {
    return <Box component="img" src={output.thumbnail} alt="" sx={{ ...tile, objectFit: 'cover' }} />;
  }
  // The icon field holds an emoji for most apps; anything longer is not a glyph, so fall back to the app symbol.
  const glyph = (output.icon || '').trim();
  return (
    <Box sx={{ ...tile, background: 'linear-gradient(135deg, #ef9552, #d96a2b)', fontSize: '1.375rem' }}>
      {glyph && glyph.length <= 3 ? glyph : <GridViewRoundedIcon sx={{ fontSize: 26, color: '#fff' }} />}
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
          <Typography sx={{ fontSize: '1.125rem' }}>🐙</Typography>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
            Applications
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
            <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', textAlign: 'center', py: 5 }}>
              {Object.keys(outputs).length === 0
                ? 'No apps yet. Ask an agent to build one and it lands here.'
                : 'No apps match that search.'}
            </Typography>
          )}
          {apps.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 1.5 }}>
              {apps.map((output) => (
                <Box
                  key={output.id}
                  onClick={() => { onOpenApp(output.id); onClose(); }}
                  title={output.description || output.name}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 0.75,
                    py: 0.75,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    '&:hover': { background: 'rgba(255,255,255,0.08)' },
                  }}
                >
                  <AppTile output={output} />
                  <Typography sx={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.82)', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
