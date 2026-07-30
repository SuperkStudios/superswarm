import React, { useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { closeSettingsModal } from '@/shared/state/settingsSlice';
import { onboardingBus } from '@/app/components/Onboarding/eventBus';
import { useClaudeTokens } from '@/shared/styles/ThemeContext';
import SettingsBody from './SettingsBody';

// Modal host for the settings UI, kept for every programmatic caller (provider-health toast, search palette, "Configure models" links). The dock opens the same body as an on-canvas window instead.
const Settings: React.FC = () => {
  const open = useAppSelector((s) => s.settings.modalOpen);
  const initialTab = useAppSelector((s) => s.settings.initialTab);
  const c = useClaudeTokens();
  const dispatch = useAppDispatch();

  const handleClose = useCallback(() => {
    dispatch(closeSettingsModal());
    onboardingBus.emit('settings:closed');
  }, [dispatch]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: 880,
          height: '85vh',
          display: 'flex',
          flexDirection: 'row',
          bgcolor: c.bg.page,
          borderRadius: 2,
          border: `1px solid ${c.border.subtle}`,
          boxShadow: c.shadow.md,
          transition: 'none',
          overflow: 'hidden',
        },
      }}
    >
      <SettingsBody active={open} requestedTab={initialTab} onRequestClose={handleClose} />
    </Dialog>
  );
};

export default Settings;
