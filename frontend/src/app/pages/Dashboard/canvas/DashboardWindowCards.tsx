import React from 'react';
import WorkflowsAppCard from '@/app/pages/Workflows/app/WorkflowsAppCard';
import RunMonitor from '@/app/pages/Workflows/app/RunMonitor';
import SettingsAppCard from '@/app/pages/Settings/SettingsAppCard';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import {
  closeWorkflowMonitor,
  SETTINGS_CARD_ID,
  type WorkflowsHubPosition,
} from '@/shared/state/dashboardLayoutSlice';
import type { CardType, useDashboardSelection } from '../hooks/state/useDashboardSelection';

interface DashboardWindowCardsProps {
  workflowsHub: WorkflowsHubPosition | null;
  selection: ReturnType<typeof useDashboardSelection>;
  highlightedCardId: string | null;
  multiDragDelta: { dx: number; dy: number } | null;
  getCanvasState: () => { panX: number; panY: number; zoom: number };
  onCardSelect: (id: string, type: CardType, shiftKey: boolean, originTarget?: EventTarget | null) => void;
  onDragStart: (id: string, type: CardType) => void;
  onDragMove: (dx: number, dy: number, mouseX?: number, mouseY?: number) => void;
  onDragEnd: (dx: number, dy: number, didDrag: boolean) => void;
  onBringToFront: (id: string, type: CardType) => void;
}

// The singleton app windows on the canvas (Workflows, its run monitor, Settings). One per dashboard, so they read their geometry straight from the slice instead of a card map.
const DashboardWindowCards: React.FC<DashboardWindowCardsProps> = ({
  workflowsHub,
  selection,
  highlightedCardId,
  multiDragDelta,
  getCanvasState,
  onCardSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onBringToFront,
}) => {
  const dispatch = useAppDispatch();
  const settingsCard = useAppSelector((s) => s.dashboardLayout.settingsCard);
  const monitorCard = useAppSelector((s) => s.dashboardLayout.workflowsMonitorCard);
  const monitorWorkflowId = useAppSelector((s) => s.dashboardLayout.workflowsMonitorId);
  const monitorWorkflow = useAppSelector((s) => (monitorWorkflowId ? s.workflows.items[monitorWorkflowId] : undefined));
  // The monitor's workflow vanished (trashed/deleted) while open: tear the card + its tether down instead of leaving an orange line pointing at nothing.
  React.useEffect(() => {
    if (monitorCard && !monitorWorkflow) dispatch(closeWorkflowMonitor());
  }, [monitorCard, monitorWorkflow, dispatch]);

  return (
    <>
      {workflowsHub && (
        <WorkflowsAppCard
          cardX={workflowsHub.x}
          cardY={workflowsHub.y}
          cardWidth={workflowsHub.width}
          cardHeight={workflowsHub.height}
          cardZOrder={workflowsHub.zOrder ?? 0}
          getCanvasState={getCanvasState}
          isSelected={selection.isSelected('workflows-hub')}
          isHighlighted={highlightedCardId === 'workflows-hub'}
          multiDragDelta={selection.isSelected('workflows-hub') ? multiDragDelta : null}
          onCardSelect={onCardSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onBringToFront={onBringToFront}
        />
      )}
      {settingsCard && (
        <SettingsAppCard
          cardX={settingsCard.x}
          cardY={settingsCard.y}
          cardWidth={settingsCard.width}
          cardHeight={settingsCard.height}
          cardZOrder={settingsCard.zOrder ?? 0}
          getCanvasState={getCanvasState}
          isSelected={selection.isSelected(SETTINGS_CARD_ID)}
          isHighlighted={highlightedCardId === SETTINGS_CARD_ID}
          multiDragDelta={selection.isSelected(SETTINGS_CARD_ID) ? multiDragDelta : null}
          onCardSelect={onCardSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onBringToFront={onBringToFront}
        />
      )}
      {monitorCard && monitorWorkflow && (
        <RunMonitor
          workflow={monitorWorkflow}
          cardX={monitorCard.x}
          cardY={monitorCard.y}
          cardWidth={monitorCard.width}
          cardHeight={monitorCard.height}
          cardZOrder={monitorCard.zOrder ?? 0}
          getCanvasState={getCanvasState}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
        />
      )}
    </>
  );
};

export default DashboardWindowCards;
