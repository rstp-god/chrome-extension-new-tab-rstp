import { getLocal, setLocal } from '@/services/chrome/storage.ts';
import { WidgetInstance } from '@/types/widgets.ts';

const KEY_LAYOUT = "widgets-layout:v1";

export async function loadWidgetsLayout(): Promise<WidgetInstance[] | null> {
  return await getLocal<WidgetInstance[]>(KEY_LAYOUT);
}

export async function saveWidgetsLayout(layout: WidgetInstance[]): Promise<void> {
  await setLocal(KEY_LAYOUT, layout);
}
