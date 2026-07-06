import type { ReactNode } from 'react';
import { TabBar } from '@/components/TabBar';

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main className="pb-safe" style={{ minHeight: '100%' }}>
        {children}
      </main>
      <TabBar />
    </>
  );
}
