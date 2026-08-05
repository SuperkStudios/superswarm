import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CheckIcon from '@mui/icons-material/Check';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';

export interface PickerOption {
  value: string;
  label: string;
}

interface PickerProps {
  label: string;
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
}

const DropdownPill: React.FC<PickerProps> = ({ label, options, value, onChange }) => {
  const c = useClaudeTokens();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const active = options.find((o) => o.value === value);
  return (
    <>
      <Box
        role="button"
        onClick={(e: React.MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75, px: 1.75, py: 0.9,
          borderRadius: `${c.radius.md}px`, border: `1px solid ${c.border.medium}`,
          cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
          '&:hover': { borderColor: c.border.strong, bgcolor: c.bg.elevated },
        }}
      >
        <Typography sx={{ fontSize: '0.9375rem', color: c.text.primary }}>
          {active && active.value !== options[0].value ? active.label : label}
        </Typography>
        <KeyboardArrowDownIcon sx={{ fontSize: 18, color: c.text.tertiary }} />
      </Box>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        PaperProps={{ sx: { bgcolor: c.bg.surface, border: `1px solid ${c.border.subtle}`, borderRadius: `${c.radius.md}px`, mt: 0.5, minWidth: 170 } }}
      >
        {options.map((o) => (
          <MenuItem
            key={o.value}
            onClick={() => { onChange(o.value); setAnchor(null); }}
            sx={{ fontSize: '0.875rem', color: c.text.primary, gap: 1, '&:hover': { bgcolor: c.bg.secondary } }}
          >
            <Box sx={{ width: 18, display: 'flex' }}>{o.value === value && <CheckIcon sx={{ fontSize: 16, color: c.text.secondary }} />}</Box>
            {o.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

interface Props {
  searchPlaceholder: string;
  chipLabel: string;
  query: string;
  onQuery: (q: string) => void;
  filterOptions: PickerOption[];
  filterValue: string;
  onFilter: (v: string) => void;
  sortOptions: PickerOption[];
  sortValue: string;
  onSort: (v: string) => void;
}

// The Directory's search row + chip/filter row, shared by both tabs (same chrome on claude.ai).
const DirectoryFilterBar: React.FC<Props> = ({
  searchPlaceholder, chipLabel, query, onQuery,
  filterOptions, filterValue, onFilter, sortOptions, sortValue, onSort,
}) => {
  const c = useClaudeTokens();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, flexShrink: 0 }}>
      <TextField
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 20, color: c.text.ghost }} />
            </InputAdornment>
          ),
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            bgcolor: c.bg.surface, borderRadius: `${c.radius.md}px`, fontSize: '0.9375rem',
            '& input': { py: 1.4 },
            '& fieldset': { borderColor: c.border.medium },
            '&:hover fieldset': { borderColor: c.border.strong },
            '&.Mui-focused fieldset': { borderColor: c.border.strong, borderWidth: 1 },
          },
        }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', px: 1.75, py: 0.9, borderRadius: 999, bgcolor: c.bg.secondary }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, color: c.text.primary, whiteSpace: 'nowrap' }}>{chipLabel}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <DropdownPill label="Filter by" options={filterOptions} value={filterValue} onChange={onFilter} />
          <DropdownPill label="Sort by" options={sortOptions} value={sortValue} onChange={onSort} />
        </Box>
      </Box>
    </Box>
  );
};

export default DirectoryFilterBar;
