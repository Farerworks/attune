import type { ReactNode } from 'react';

export default function TabsTemplate({ children }: { children: ReactNode }) {
  return <div className="anim-rise">{children}</div>;
}
