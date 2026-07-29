import React from 'react';
import LanguageIcon from '@mui/icons-material/Language';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import EditNoteIcon from '@mui/icons-material/EditNote';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { MessageCircle } from 'lucide-react';
import { pickIcon } from '../canvas/DashboardGlyph';
import { displayChatTitle } from '@/shared/state/sessionDisplay';
import type { AgentSession } from '@/shared/state/agentsSlice';
import type {
  CardPosition,
  ViewCardPosition,
  BrowserCardPosition,
  NotePosition,
  WorkflowCardPosition,
} from '@/shared/state/dashboardLayoutSlice';
import type { Output } from '@/shared/state/outputsSlice';

export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DockEntry {
  id: string;
  label: string;
  rect: CardRect;
  tileBg: string;
  icon: React.ReactNode;
  faviconUrl?: string;
  thumbnail?: string | null;
  browserId?: string;
  snippet?: string;
}

export interface DockSlices {
  sessions: Record<string, AgentSession>;
  cards: Record<string, CardPosition>;
  viewCards: Record<string, ViewCardPosition>;
  browserCards: Record<string, BrowserCardPosition>;
  notes: Record<string, NotePosition>;
  workflowCards: Record<string, WorkflowCardPosition>;
  outputs: Record<string, Output>;
}

// Frames show a colorful per-card dock, not uniform tiles; hues rotate by name so two agents rarely match.
const AGENT_TILE_HUES = [
  'linear-gradient(135deg, #4a7dd6, #2b4fa8)',
  'linear-gradient(135deg, #8a5bd6, #5b34a8)',
  'linear-gradient(135deg, #3aa88f, #1f7a64)',
  'linear-gradient(135deg, #d6754a, #a8492b)',
  'linear-gradient(135deg, #c94a7d, #96305c)',
];

function hueFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AGENT_TILE_HUES[Math.abs(h) % AGENT_TILE_HUES.length];
}

export function buildDockEntries({ sessions, cards, viewCards, browserCards, notes, workflowCards, outputs }: DockSlices): DockEntry[] {
  const list: DockEntry[] = [];
  for (const card of Object.values(cards)) {
    const session = sessions[card.session_id];
    if (!session) continue;
    const title = displayChatTitle(session);
    const ChatIcon = pickIcon(title) || MessageCircle;
    list.push({
      id: card.session_id,
      label: title,
      rect: card,
      tileBg: hueFor(title),
      icon: <ChatIcon size={16} strokeWidth={1.75} color="#fff" />,
      snippet: session.turn_label?.label || undefined,
    });
  }
  for (const bc of Object.values(browserCards)) {
    const activeTab = bc.tabs.find((t) => t.id === bc.activeTabId) || bc.tabs[0];
    list.push({
      id: bc.browser_id,
      label: activeTab?.title || 'Browser',
      rect: bc,
      tileBg: 'linear-gradient(135deg, #4f9fe8, #2f6ed4)',
      icon: <LanguageIcon sx={{ fontSize: 17, color: '#fff' }} />,
      faviconUrl: activeTab?.favicon,
      browserId: bc.browser_id,
    });
  }
  for (const [cardKey, vc] of Object.entries(viewCards)) {
    const output = outputs[vc.output_id];
    const appName = output?.name || 'App';
    list.push({
      id: cardKey,
      label: appName,
      rect: vc,
      tileBg: 'linear-gradient(135deg, #ef9552, #d96a2b)',
      // Never letters in the dock: a real symbol reads as an app, a glyph initial reads as a bug.
      icon: <GridViewRoundedIcon sx={{ fontSize: 16, color: '#fff' }} />,
      thumbnail: output?.thumbnail,
    });
  }
  for (const note of Object.values(notes)) {
    const firstLine = (note.content || '').split('\n')[0].trim();
    list.push({
      id: note.note_id,
      label: firstLine || 'Note',
      rect: note,
      tileBg: 'linear-gradient(135deg, #f2d270, #e0b23e)',
      icon: <EditNoteIcon sx={{ fontSize: 18, color: '#7a5d10' }} />,
      snippet: (note.content || '').slice(0, 140),
    });
  }
  for (const [cardKey, wf] of Object.entries(workflowCards)) {
    list.push({
      id: cardKey,
      label: 'Workflow',
      rect: wf,
      tileBg: 'linear-gradient(135deg, #ef7a70, #d94f45)',
      icon: <CalendarMonthIcon sx={{ fontSize: 16, color: '#fff' }} />,
    });
  }
  return list;
}
