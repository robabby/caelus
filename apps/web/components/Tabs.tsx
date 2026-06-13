"use client";

import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";

type TabProps = { label: string; children: ReactNode };

export function Tab({ children }: TabProps) {
  return <>{children}</>;
}

export function Tabs({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<TabProps>[];
  const [active, setActive] = useState(0);
  if (tabs.length === 0) return null;
  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist">
        {tabs.map((tab, i) => (
          <button
            key={tab.props.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            className="tabs__tab"
            onClick={() => setActive(i)}
          >
            {tab.props.label}
          </button>
        ))}
      </div>
      <div className="tabs__panel" role="tabpanel">
        {tabs[active]}
      </div>
    </div>
  );
}
