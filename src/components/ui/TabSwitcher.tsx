import { useState } from 'react';

interface Tab {
  id: string;
  label: string;
}

interface TabSwitcherProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function TabSwitcher({ tabs, activeTab, onChange, className = '' }: TabSwitcherProps) {
  return (
    <div className={`flex rounded-xl p-1 bg-background/50 backdrop-blur-lg border border-border/30 shadow-[0_2px_8px_hsl(var(--foreground)/0.04)] ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
            activeTab === tab.id
              ? 'bg-background/80 backdrop-blur-md text-accent font-bold shadow-[0_2px_8px_hsl(var(--foreground)/0.06),inset_0_1px_0_hsl(var(--background)/0.5)] border border-border/30'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
