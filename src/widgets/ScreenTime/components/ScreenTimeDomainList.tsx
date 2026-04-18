import { useTranslation } from 'react-i18next'

import type { DomainTotal } from '@/widgets/ScreenTime/types.ts'
import { OTHER_KEY } from '@/widgets/ScreenTime/types.ts'
import { DomainRow } from '@/widgets/ScreenTime/components/DomainRow.tsx'

interface Props {
  domains: readonly DomainTotal[]
  otherSeconds: number
  shades: readonly string[]
}

export function ScreenTimeDomainList({ domains, otherSeconds, shades }: Props) {
  const { t } = useTranslation('screenTimeWidget')
  return (
    <ul className="flex flex-col gap-1.5">
      {domains.map((d) => (
        <DomainRow
          key={d.domain}
          label={d.domain}
          color={shades[d.colorIndex % shades.length] ?? null}
          seconds={d.totalTime}
          dataKey={d.domain}
        />
      ))}
      {otherSeconds > 0 && (
        <DomainRow
          label={t('other')}
          color={null}
          seconds={otherSeconds}
          dataKey={OTHER_KEY}
        />
      )}
    </ul>
  )
}
