import React from 'react';
import WeatherWidget from './WeatherWidget';
import PlanWidget from './PlanWidget';
import StatsWidget from './StatsWidget';
import LinksWidget from './LinksWidget';
import VendoredToolUi from '@toolui/VendoredToolUi';
import type { ShowUiPayload } from './showUiPayload';

/** One switch for every surface that renders a ShowUI payload (chat bubble, pill artifact); ambient = low-cost render for resting surfaces. */
function ShowUiWidgetView({ payload, ambient }: { payload: ShowUiPayload; ambient?: boolean }): React.ReactElement | null {
  if (payload.component === 'weather') return <WeatherWidget props={payload.props} ambient={ambient} />;
  if (payload.component === 'plan') return <PlanWidget props={payload.props} />;
  if (payload.component === 'stats') return <StatsWidget props={payload.props} />;
  if (payload.component === 'links') return <LinksWidget props={payload.props} />;
  if (payload.component === 'vendored') {
    // The vendored contracts carry no question/title field, so agent-supplied ones silently vanish and a choice widget renders with no visible question; surface them as a host header (ENG-227).
    const raw = (payload.props ?? {}) as Record<string, unknown>;
    const title = [raw.title, raw.question, raw.prompt, raw.heading]
      .find((v): v is string => typeof v === 'string' && v.trim().length > 0) ?? '';
    const desc = typeof raw.description === 'string' && raw.description !== title ? raw.description : '';
    const widget = <VendoredToolUi name={payload.name} props={payload.props} quietFail={ambient} />;
    if (!title && !desc) return widget;
    return (
      <div>
        <div style={{ marginBottom: 6, paddingLeft: 4, paddingRight: 4 }}>
          {title && <div style={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.35 }}>{title}</div>}
          {desc && <div style={{ fontSize: '0.8125rem', opacity: 0.72, marginTop: 2, lineHeight: 1.4 }}>{desc}</div>}
        </div>
        {widget}
      </div>
    );
  }
  return null;
}

export default ShowUiWidgetView;
