import { Fragment } from "react";

import { usePluginPanels } from "../plugins/runtime";
import { cardClasses } from "../utils/classNames";

export function PluginSidePanels() {
  const panels = usePluginPanels();

  if (panels.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {panels.map((panel) => (
        <div key={panel.id} className={cardClasses()}>
          <div className="card-body space-y-2">
            <header className="flex flex-col gap-1">
              <h3 className="text-base font-semibold text-base-content">{panel.title}</h3>
              {panel.description && <p className="text-sm text-base-content/70">{panel.description}</p>}
            </header>
            <Fragment>{panel.render()}</Fragment>
          </div>
        </div>
      ))}
    </div>
  );
}
