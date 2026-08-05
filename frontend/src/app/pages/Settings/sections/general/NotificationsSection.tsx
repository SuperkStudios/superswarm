import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';
import type { AppSettings } from '@/shared/state/settingsSlice';

interface Props {
  form: AppSettings;
  setForm: (next: AppSettings) => void;
}

// Both toggles gate REAL notification paths (notifications.ts checks them before firing); nothing here is decorative.
const NotificationsSection: React.FC<Props> = ({ form, setForm }) => {
  const c = useClaudeTokens();
  const row = (title: string, body: string, key: 'notify_agent_completion' | 'notify_workflow_runs'): React.ReactElement => (
    <Box sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
      px: 2, py: 1.75, bgcolor: c.bg.surface, border: `1px solid ${c.border.subtle}`, borderRadius: `${c.radius.md}px`,
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: c.text.primary }}>{title}</Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: c.text.tertiary, mt: 0.25 }}>{body}</Typography>
      </Box>
      <Switch
        size="small"
        checked={form[key] !== false}
        onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
      />
    </Box>
  );
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 720 }}>
      {row('Agent completion', 'Native notification when an agent finishes or errors while the window is in the background.', 'notify_agent_completion')}
      {row('Workflow runs', 'Notification Center alert when a scheduled workflow run finishes, with quick actions.', 'notify_workflow_runs')}
      <Typography sx={{ fontSize: '0.75rem', color: c.text.ghost, px: 0.5 }}>
        Email alerts are not available yet.
      </Typography>
    </Box>
  );
};

export default NotificationsSection;
