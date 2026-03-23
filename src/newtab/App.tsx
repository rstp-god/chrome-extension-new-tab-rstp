import { Background } from '@/newtab/components/Background/Background.tsx';
import { useBackgroundState } from '@/newtab/components/Background/hooks/useBackgroundState.ts';
import { Header } from '@/newtab/components/Header/Header.tsx';
import { WidgetsGrid } from '@/newtab/components/WidgetLayout/WidgetsGrid.tsx';

export default function App() {
  const { bg, bgDataUrl, persist } = useBackgroundState();

  return (
    <div className="min-h-screen">
      <Background state={bg} dataUrl={bgDataUrl} />

      <div className="px-6 py-8">
        <Header bgState={bg} onSaveBackground={persist} />

        <div className="mt-6">
          <WidgetsGrid />
        </div>
      </div>
    </div>
  );
}
