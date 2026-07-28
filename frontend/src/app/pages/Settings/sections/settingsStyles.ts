// Theme-dependent style objects shared across Settings tabs; built from the resolved Claude tokens.
export function makeSettingsStyles(c: any) {
  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      fontSize: '0.875rem',
    },
  };

  const sectionSx = {
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase' as const,
    color: c.text.muted,
    mb: 1,
    mt: 2.5,
    px: 0.5,
  };

  // Apple/ChatGPT settings grammar: each row is its own soft contained chip, not a hairline in a
  // long scroll; the pane reads as a stack of quiet cards.
  const rowSx = {
    px: 2,
    py: 1.5,
    mb: 1,
    bgcolor: c.bg.surface,
    border: `1px solid ${c.border.subtle}`,
    borderRadius: '10px',
  };

  const rowLastSx = {
    ...rowSx,
  };

  const inlineRowSx = {
    ...rowSx,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const inlineRowLastSx = {
    ...rowLastSx,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const labelSx = {
    color: c.text.primary,
    fontWeight: 500,
    fontSize: '0.875rem',
    lineHeight: 1.4,
  };

  const descSx = {
    color: c.text.tertiary,
    fontSize: '0.75rem',
    lineHeight: 1.4,
  };

  return { fieldSx, sectionSx, rowSx, rowLastSx, inlineRowSx, inlineRowLastSx, labelSx, descSx };
}

export type SettingsStyles = ReturnType<typeof makeSettingsStyles>;
