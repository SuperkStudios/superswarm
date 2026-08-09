import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { API_BASE } from '@/shared/config';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';

export const APP_TOOL_GRANT_EVENT = 'openswarm:app-tool-grant';

export interface AppToolGrantRequest {
  request_id: string;
  output_id: string;
  app_name: string;
  tool_key: string;
  tool_label: string;
  args_preview: string;
}

/** One global mount that turns backend tool-grant requests (an app asking to use one of the user's
 * connected MCP tools) into an approval dialog. The backend blocks the call until this answers;
 * closing the dialog, denying, and the backend's own timeout ALL read as deny. */
const AppToolGrantHost: React.FC = () => {
  const c = useClaudeTokens();
  const [req, setReq] = useState<AppToolGrantRequest | null>(null);
  useEffect(() => {
    const onGrant = (e: Event): void => {
      const detail = (e as CustomEvent).detail as AppToolGrantRequest | undefined;
      if (detail && detail.request_id && detail.tool_key) setReq(detail);
    };
    window.addEventListener(APP_TOOL_GRANT_EVENT, onGrant);
    return () => window.removeEventListener(APP_TOOL_GRANT_EVENT, onGrant);
  }, []);
  if (!req) return null;
  const answer = (allow: boolean, remember: boolean): void => {
    void fetch(`${API_BASE}/apps-sdk/tools/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: req.request_id, allow, remember }),
    }).catch(() => { /* backend timeout already reads as deny */ });
    setReq(null);
  };
  return (
    <Dialog open onClose={() => answer(false, false)} maxWidth="xs" fullWidth>
      <Box sx={{ p: 2.5, background: c.bg.surface }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15, mb: 0.5, color: c.text.primary }}>
          "{req.app_name}" wants to use {req.tool_label}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: c.text.secondary, mb: 1.5 }}>
          This app is asking to call one of your connected tools. Only allow it if you trust the app
          with this action.
        </Typography>
        {req.args_preview && req.args_preview !== '{}' && (
          <Box sx={{ fontFamily: 'monospace', fontSize: 11, p: 1, borderRadius: '8px', background: c.bg.page, color: c.text.secondary, mb: 1.5, maxHeight: 96, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {req.args_preview}
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button size="small" color="inherit" onClick={() => answer(false, true)}>Never allow</Button>
          <Button size="small" color="inherit" onClick={() => answer(false, false)}>Deny</Button>
          <Button size="small" variant="outlined" onClick={() => answer(true, false)}>Allow once</Button>
          <Button size="small" variant="contained" disableElevation onClick={() => answer(true, true)}>Always allow</Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default AppToolGrantHost;
