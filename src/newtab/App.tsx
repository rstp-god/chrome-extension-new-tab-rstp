import { Background } from '@/newtab/components/Background/Background.tsx';
import { BackgroundDialog } from '@/newtab/components/Background/BackgroundDialog.tsx';
import { useBackgroundState } from '@/newtab/components/Background/hooks/useBackgroundState.ts';
import './App.css'

export default function App() {
  const { bg, bgDataUrl, persist } = useBackgroundState();

  return (
    <div className="min-h-screen">
      <Background state={bg} dataUrl={bgDataUrl} />

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-semibold">New Tab</div>
          <BackgroundDialog value={bg} onSaved={persist} />
        </div>
      </div>
    </div>
  );
}
