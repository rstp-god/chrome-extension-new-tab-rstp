import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function SearchWidget() {
  const { t } = useTranslation('searchWidget');
  const [q, setQ] = useState('');

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;

    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    chrome.tabs?.create?.({ url }) ?? window.open(url, '_blank');
  };

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('placeholder')}
      />
      <Button type="submit">{t('submit')}</Button>
    </form>
  );
}
