import { getFaviconUrl } from '@/widgets/ChromeLibrary/services/chromeLibrary.ts'

interface Props {
  url: string
  className?: string
}

export function ChromeLibraryFavicon({ url, className }: Props) {
  return <img src={getFaviconUrl(url)} alt="" className={className ?? 'size-4 shrink-0 rounded-sm'} />
}
