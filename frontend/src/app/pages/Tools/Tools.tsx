import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import BuildIcon from '@mui/icons-material/Build';
import LockIcon from '@mui/icons-material/Lock';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import {
  fetchTools,
  fetchBuiltinTools,
  fetchBuiltinPermissions,
  ToolDefinition,
} from '@/shared/state/toolsSlice';
import {
  fetchServerDetail,
  clearDetail,
} from '@/shared/state/mcpRegistrySlice';
import { Skeleton } from '@/app/components/feedback/Loading';

import { useClaudeTokens } from '@/shared/styles/ThemeContext';
import { Integration, INTEGRATIONS } from './integrations';
import { CATEGORY_ORDER } from './toolsHelpers';
import ToolSection from './cards/ToolSection';
import BrowserPermissionCard from './cards/BrowserPermissionCard';
import AgentWorkflowsSection from './cards/AgentWorkflowsSection';
import RegistryBrowserDialog from './dialogs/RegistryBrowserDialog';
import ToolsAddMenu from './dialogs/ToolsAddMenu';
import ToolDialogs from './dialogs/ToolDialogs';
import CustomToolCard from './cards/CustomToolCard';
import IntegrationGalleryCard from './cards/IntegrationGalleryCard';
import { useToolsActions } from './hooks/useToolsActions';
import { useBuiltinSections } from './hooks/useBuiltinSections';
import { useCuratedRegistry } from './hooks/useCuratedRegistry';

interface ToolsProps {
  /** Provided when hosted inside the Marketplace: Browse connectors switches the view in place. */
  onBrowseConnectors?: () => void;
  /** Connector to expand when returning from the Marketplace browse grid. */
  expandToolId?: string | null;
}

const Tools: React.FC<ToolsProps> = ({ onBrowseConnectors, expandToolId }) => {
  const c = useClaudeTokens();
  const dispatch = useAppDispatch();
  const { items, builtinTools, builtinPermissions, loading } = useAppSelector((s) => s.tools);
  const { servers: regServersRaw, total: regTotal, loading: regLoading, stats: regStats, detail: regDetail, detailLoading: regDetailLoading } = useAppSelector((s) => s.mcpRegistry);
  const devMode = useAppSelector((s) => s.settings.data.dev_mode);
  const allTools = Object.values(items);
  // Stable order so cards don't jump on refetch: connected+on, then on, then off; A-Z within each tier.
  const tools = useMemo(() => {
    const tier = (t: ToolDefinition) => (t.enabled === false ? 2 : t.auth_status === 'connected' ? 0 : 1);
    return Object.values(items).sort((a, b) => tier(a) - tier(b) || (a.name || '').localeCompare(b.name || ''));
  }, [items]);
  const uninstalledIntegrations = useMemo(() => INTEGRATIONS.filter((ig) => !allTools.find((t) => t.name === ig.name)), [allTools]);
  const getIntegrationForTool = useCallback((tool: ToolDefinition) => INTEGRATIONS.find((ig) => ig.name === tool.name), []);

  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(
    Object.fromEntries([
      ...CATEGORY_ORDER.map((cat) => [cat, true]),
      ...CATEGORY_ORDER.map((cat) => [`d_${cat}`, true]),
    ]),
  );
  const [expandedBuiltin, setExpandedBuiltin] = useState<string | null>(null);
  const [coreSectionOpen, setCoreSectionOpen] = useState(false);
  const [deferredSectionOpen, setDeferredSectionOpen] = useState(false);
  const [customSectionOpen, setCustomSectionOpen] = useState(true);
  const [browserSectionOpen, setBrowserSectionOpen] = useState(false);
  const [browserCollapsed, setBrowserCollapsed] = useState<Record<string, boolean>>({ browser_delegation: true, browser_action: true });
  const [builtinSectionOpen, setBuiltinSectionOpen] = useState(true);
  // claude.ai's Connectors page tabs: All / Connected / Not connected.
  const [connFilter, setConnFilter] = useState<'all' | 'connected' | 'not-connected'>('all');
  const visibleTools = useMemo(() => {
    if (connFilter === 'connected') return tools.filter((t) => t.enabled !== false);
    if (connFilter === 'not-connected') return tools.filter((t) => t.enabled === false);
    return tools;
  }, [tools, connFilter]);
  const visibleGallery = useMemo(() => (connFilter === 'connected' ? [] : uninstalledIntegrations), [uninstalledIntegrations, connFilter]);

  useEffect(() => {
    dispatch(fetchTools());
    dispatch(fetchBuiltinTools());
    dispatch(fetchBuiltinPermissions());
  }, [dispatch]);

  const {
    coreTools, deferredTools, browserTools, browserDelegationTools, browserActionTools,
    groupedCore, groupedDeferred, coreSectionEnabled, deferredSectionEnabled, browserSectionEnabled,
  } = useBuiltinSections(builtinTools, builtinPermissions);

  const toggleCategory = (cat: string) => setCollapsedCategories((p) => ({ ...p, [cat]: !p[cat] }));
  const toggleBuiltinExpand = (name: string) => setExpandedBuiltin((p) => (p === name ? null : name));
  // The Add menu closes itself now (ToolsAddMenu), so the hook's closeMenu hook-in is a no-op.
  const a = useToolsActions({ items, allTools, regServersRaw, closeMenu: () => {} });

  useEffect(() => { if (expandToolId) a.setExpandedToolId(expandToolId); }, [expandToolId]);

  const regServers = useCuratedRegistry(regServersRaw, a.regSource);

  return (
    <Box sx={{ px: 3, pt: 1, pb: 3, height: '100%', overflow: 'auto' }}>
      {/* The pane header already says "Tools"; a slim action row beats a second page title. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 1.5 }}>
        <ToolsAddMenu
          devMode={!!devMode}
          onBrowseConnectors={onBrowseConnectors}
          onOpenCreate={a.openCreate}
          onOpenRegistry={a.openRegistryBrowser}
          onSnackbar={(message, severity) => a.setSnackbar({ open: true, message, severity: severity === 'error' ? 'error' : undefined })}
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <Box
          onClick={() => setBuiltinSectionOpen((v) => !v)}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, px: 0.5, cursor: 'pointer', userSelect: 'none', '&:hover .section-arrow': { color: c.text.secondary } }}
        >
          <Typography sx={{ color: c.text.muted, fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Built-in
          </Typography>
          <Typography sx={{ color: c.text.ghost, fontSize: '0.6875rem', fontWeight: 600 }}>{coreTools.length + deferredTools.length + browserTools.length}</Typography>
          {builtinSectionOpen ? <KeyboardArrowDownIcon className="section-arrow" sx={{ fontSize: 15, color: c.text.ghost, transition: 'color 0.15s' }} /> : <KeyboardArrowRightIcon className="section-arrow" sx={{ fontSize: 15, color: c.text.ghost, transition: 'color 0.15s' }} />}
        </Box>
        <Collapse in={builtinSectionOpen} timeout={0} unmountOnExit>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1 }}>

      {coreTools.length > 0 && (
        <ToolSection label="Core Tools" icon={<LockIcon sx={{ fontSize: 14, color: c.text.tertiary }} />} count={coreTools.length} open={coreSectionOpen} onToggle={() => setCoreSectionOpen((v) => !v)} grouped={groupedCore} collapsedCategories={collapsedCategories} toggleCategory={toggleCategory} expandedBuiltin={expandedBuiltin} toggleBuiltinExpand={toggleBuiltinExpand} builtinPermissions={builtinPermissions} onPermissionChange={a.handleBuiltinPermissionChange} onCategoryPermissionChange={a.handleBuiltinCategoryPermissionChange} enabled={coreSectionEnabled} onEnabledChange={(v) => a.handleSectionEnabledChange(coreTools, v)} />
      )}

      {deferredTools.length > 0 && (
        <ToolSection label="Extended Tools" icon={<HourglassEmptyIcon sx={{ fontSize: 14, color: c.text.tertiary }} />} count={deferredTools.length} open={deferredSectionOpen} onToggle={() => setDeferredSectionOpen((v) => !v)} grouped={groupedDeferred} collapsedCategories={collapsedCategories} toggleCategory={toggleCategory} expandedBuiltin={expandedBuiltin} toggleBuiltinExpand={toggleBuiltinExpand} deferred builtinPermissions={builtinPermissions} onPermissionChange={a.handleBuiltinPermissionChange} onCategoryPermissionChange={a.handleBuiltinCategoryPermissionChange} enabled={deferredSectionEnabled} onEnabledChange={(v) => a.handleSectionEnabledChange(deferredTools, v)} />
      )}

      {browserTools.length > 0 && (
        <BrowserPermissionCard
          open={browserSectionOpen}
          enabled={browserSectionEnabled}
          onToggleOpen={() => setBrowserSectionOpen((v) => !v)}
          browserTools={browserTools}
          browserDelegationTools={browserDelegationTools}
          browserActionTools={browserActionTools}
          browserCollapsed={browserCollapsed}
          setBrowserCollapsed={setBrowserCollapsed}
          builtinPermissions={builtinPermissions}
          onSectionEnabledChange={a.handleSectionEnabledChange}
          onCategoryPermissionChange={a.handleBuiltinCategoryPermissionChange}
          onPermissionChange={a.handleBuiltinPermissionChange}
        />
      )}

          </Box>
        </Collapse>
      </Box>
      <AgentWorkflowsSection />

      <Box sx={{ mb: 2 }}>
        <Box onClick={() => setCustomSectionOpen((v) => !v)} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, px: 0.5, cursor: 'pointer', userSelect: 'none', '&:hover .section-arrow': { color: c.text.secondary } }}>
          <Typography sx={{ color: c.text.muted, fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Connections
          </Typography>
          <Typography sx={{ color: c.text.ghost, fontSize: '0.6875rem', fontWeight: 600 }}>{tools.length + uninstalledIntegrations.length}</Typography>
          {customSectionOpen ? <KeyboardArrowDownIcon className="section-arrow" sx={{ fontSize: 15, color: c.text.ghost, transition: 'color 0.15s' }} /> : <KeyboardArrowRightIcon className="section-arrow" sx={{ fontSize: 15, color: c.text.ghost, transition: 'color 0.15s' }} />}
          <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            {([['all', 'All'], ['connected', 'Connected'], ['not-connected', 'Not connected']] as const).map(([value, label]) => (
              <Box
                key={value}
                role="button"
                onClick={() => setConnFilter(value)}
                sx={{
                  px: 1.25, py: 0.3, borderRadius: 999, cursor: 'pointer', userSelect: 'none',
                  fontSize: '0.75rem', fontWeight: 600, lineHeight: 1.6,
                  color: connFilter === value ? c.text.primary : c.text.tertiary,
                  bgcolor: connFilter === value ? c.bg.secondary : 'transparent',
                  '&:hover': { color: c.text.primary },
                }}
              >
                {label}
              </Box>
            ))}
          </Box>
        </Box>
        <Collapse in={customSectionOpen} timeout={0} unmountOnExit>
          {loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1, mt: 1 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} variant="card" height={72} />
              ))}
            </Box>
          ) : (tools.length === 0 && uninstalledIntegrations.length === 0) ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6, color: c.text.ghost, gap: 1.5 }}>
              <BuildIcon sx={{ fontSize: 40, opacity: 0.3 }} />
              <Typography sx={{ fontSize: '0.875rem' }}>No custom tools defined yet. Create one to get started.</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', ml: 1, border: `1px solid ${c.border.subtle}`, borderRadius: '12px', overflow: 'hidden', bgcolor: c.bg.surface }}>
              {visibleTools.map((tool) => (
                <CustomToolCard
                  key={tool.id}
                  tool={tool}
                  ig={getIntegrationForTool(tool)}
                  isExpanded={a.expandedToolId === tool.id}
                  onToggleExpand={(toolId, wasExpanded) => a.setExpandedToolId(wasExpanded ? null : toolId)}
                  expandedServices={a.expandedServices}
                  setExpandedServices={a.setExpandedServices}
                  expandedSchema={a.expandedSchema}
                  setExpandedSchema={a.setExpandedSchema}
                  devMode={devMode}
                  integrationLoading={a.integrationLoading}
                  discovering={a.discovering}
                  onPermissionChange={a.handlePermissionChange}
                  onGroupPermissionChange={a.handleGroupPermissionChange}
                  onBulkReadOnly={a.handleBulkReadOnly}
                  onResetPermissions={a.handleResetPermissions}
                  onDiscover={a.handleDiscover}
                  onIntegrationToggle={a.handleIntegrationToggle}
                  onOAuthConnect={a.handleOAuthConnect}
                  onDeviceCodeConnect={a.handleDeviceCodeConnect}
                  onM365Disconnect={a.handleM365Disconnect}
                  onDisconnectIntegration={a.handleDisconnectIntegration}
                  onOpenCredentialsDialog={a.openCredentialsDialog}
                  onEdit={a.openEdit}
                  onDelete={a.handleDelete}
                />
              ))}
              {visibleGallery.map((ig) => (
                <IntegrationGalleryCard
                  key={ig.id}
                  integration={ig}
                  isLoading={!!a.integrationLoading[ig.id]}
                  onToggle={a.handleIntegrationToggle}
                />
              ))}
            </Box>
          )}
        </Collapse>
      </Box>

      <ToolDialogs
        {...a}
        onSave={a.handleSave}
        onMcpConfigSave={a.handleMcpConfigSave}
        onSlackAutoConnect={a.handleSlackAutoConnect}
        onCredentialsSave={a.handleCredentialsSave}
      />


      <RegistryBrowserDialog
        open={a.registryOpen}
        onClose={() => a.setRegistryOpen(false)}
        regStats={regStats}
        regSource={a.regSource}
        devMode={devMode}
        regQuery={a.regQuery}
        onRegSearch={a.handleRegSearch}
        regSort={a.regSort}
        onRegSort={a.handleRegSort}
        onRegSourceFilter={a.handleRegSourceFilter}
        regLoading={regLoading}
        regServers={regServers}
        regTotal={regTotal}
        allTools={allTools}
        expandedServer={a.expandedServer}
        onExpandServer={(srv, next) => {
          a.setExpandedServer(next);
          if (next && devMode) {
            dispatch(clearDetail());
            dispatch(fetchServerDetail(srv.name));
          }
        }}
        regDetail={regDetail}
        regDetailLoading={regDetailLoading}
        onInstall={a.handleInstall}
        onEditInstall={a.handleEditInstall}
        onLoadMore={a.handleLoadMore}
      />

      <Snackbar
        open={a.snackbar.open}
        autoHideDuration={3000}
        onClose={() => a.setSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => a.setSnackbar({ open: false, message: '' })} severity={a.snackbar.severity || 'success'} sx={{ bgcolor: a.snackbar.severity === 'error' ? '#2e1a1a' : c.status.successBg, color: a.snackbar.severity === 'error' ? '#f87171' : c.status.success, border: `1px solid ${a.snackbar.severity === 'error' ? '#ef444440' : `${c.status.success}40`}` }}>
          {a.snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Tools;
