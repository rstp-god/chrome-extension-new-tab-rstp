import { Separator } from '@/components/ui/separator.tsx'
import { WidgetFrame } from '@/newtab/components/WidgetLayout/WidgetFrame.tsx'
import { BookmarkIcon, LayersIcon, TwitchIcon, YoutubeIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function ChromeLibraryWidgetPreview() {
  const { t } = useTranslation('chromeLibraryWidget')

  return (
    <WidgetFrame title={t('title')} pinned={false}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <LayersIcon className="size-4" />
            {t('labels.groups')}
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs">
            {t('preview.groupRowPrimary')}
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs">
            {t('preview.groupRowSecondary')}
          </div>
        </div>

        <Separator />

        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <BookmarkIcon className="size-4" />
            {t('labels.bookmarks')}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-xs">
            <TwitchIcon className="size-3.5 shrink-0 text-[#9146ff]" aria-hidden />
            <span className="truncate">{t('preview.bookmarkRowPrimary')}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-3 py-2 text-xs">
            <YoutubeIcon className="size-3.5 shrink-0 text-[#ff0000]" aria-hidden />
            <span className="truncate">{t('preview.bookmarkRowSecondary')}</span>
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}
