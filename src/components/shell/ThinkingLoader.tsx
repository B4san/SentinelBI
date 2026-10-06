import React from 'react';
import { ThinkingLoader as PlanesThinkingLoader } from '../ui/ThinkingLoader';

export function ThinkingLoader({ label = 'AI is designing your board' }: { label?: string }) {
  return (
    <div className="sbi-thinking" role="status" aria-live="polite">
      <PlanesThinkingLoader phases={[label, 'Choosing a layout', 'Computing measures', 'Writing the board']} loop />
    </div>
  );
}
