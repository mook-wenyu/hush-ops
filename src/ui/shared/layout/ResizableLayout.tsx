import React from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";

type Direction = "horizontal" | "vertical";

interface ResizableLayoutProps {
  id: string;
  direction?: Direction;
  className?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  leftMinPx?: number;
  rightMinPx?: number;
  leftMaxPx?: number;
  rightMaxPx?: number;
}

export function ResizableLayout({
  id,
  direction = "horizontal",
  className,
  left,
  right,
  leftMinPx = 240,
  rightMinPx = 320,
  leftMaxPx,
  rightMaxPx,
}: ResizableLayoutProps) {
  return (
    <PanelGroup direction={direction} autoSaveId={id}>
      <Panel minSize={leftMinPx} maxSize={leftMaxPx} order={1} className={className}>
        {left}
      </Panel>
      <PanelResizeHandle className="w-1 bg-base-300/60 hover:bg-base-300 transition-colors" />
      <Panel minSize={rightMinPx} maxSize={rightMaxPx} order={2} className={className}>
        {right}
      </Panel>
    </PanelGroup>
  );
}
