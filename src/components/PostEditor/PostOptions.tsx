import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { StorageKey } from '@/constants'
import { Dispatch, SetStateAction, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export default function PostOptions({
  posting,
  show,
  isReply,
  canQuietReply,
  quietReply,
  setQuietReply,
  isNsfw,
  setIsNsfw,
  minPow,
  setMinPow
}: {
  posting: boolean
  show: boolean
  isReply: boolean
  canQuietReply: boolean
  quietReply: boolean
  setQuietReply: Dispatch<SetStateAction<boolean>>
  isNsfw: boolean
  setIsNsfw: Dispatch<SetStateAction<boolean>>
  minPow: number
  setMinPow: Dispatch<SetStateAction<number>>
}) {
  const { t } = useTranslation()

  useEffect(() => {
    if (isReply && canQuietReply) {
      setQuietReply(window.localStorage.getItem(StorageKey.QUIET_REPLY) === 'true')
    }
  }, [])

  if (!show) return null

  const onNsfwChange = (checked: boolean) => {
    setIsNsfw(checked)
  }

  const onQuietReplyChange = (checked: boolean) => {
    setQuietReply(checked)
    window.localStorage.setItem(StorageKey.QUIET_REPLY, checked.toString())
  }

  return (
    <div className="space-y-4">
      {isReply && canQuietReply && (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Label htmlFor="quiet-reply">{t('Quiet reply')}</Label>
            <Switch
              id="quiet-reply"
              checked={quietReply}
              onCheckedChange={onQuietReplyChange}
              disabled={posting}
            />
          </div>
          <div className="text-muted-foreground text-xs">
            {t('Publish this reply as kind:1111 using NIP-22 tags')}
          </div>
        </div>
      )}

      <div className="flex items-center space-x-2">
        <Label htmlFor="add-nsfw-tag">{t('NSFW')}</Label>
        <Switch
          id="add-nsfw-tag"
          checked={isNsfw}
          onCheckedChange={onNsfwChange}
          disabled={posting}
        />
      </div>

      <div className="grid gap-4 pb-4">
        <Label>{t('Proof of Work (difficulty {{minPow}})', { minPow })}</Label>
        <Slider
          defaultValue={[0]}
          value={[minPow]}
          onValueChange={([pow]) => setMinPow(pow)}
          max={28}
          step={1}
          disabled={posting}
        />
      </div>
    </div>
  )
}
