import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FEVELA_API_BASE_URL } from '@/constants'
import { useNostr } from '@/providers/NostrProvider'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFevelaTranslateAccount } from './FevelaTranslateAccountProvider'
import RegenerateApiKeyButton from './RegenerateApiKeyButton'
import TopUp from './TopUp'

export function AccountInfo() {
  const { t } = useTranslation()
  const { pubkey, startLogin } = useNostr()
  const { account } = useFevelaTranslateAccount()
  const [showApiKey, setShowApiKey] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!pubkey) {
    return (
      <div className="w-full flex justify-center">
        <Button onClick={() => startLogin()}>{t('Login')}</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Balance display in characters */}
      <div className="space-y-2">
        <p className="font-medium">{t('Balance')}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-bold">{account?.balance.toLocaleString() ?? '0'}</p>
          <p className="text-muted-foreground">{t('characters')}</p>
        </div>
      </div>

      {/* API Key section with visibility toggle and copy functionality */}
      <div className="space-y-2">
        <p className="font-medium">API key</p>
        <div className="flex items-center gap-2">
          <Input
            type={showApiKey ? 'text' : 'password'}
            value={account?.api_key ?? ''}
            readOnly
            className="font-mono flex-1 max-w-fit"
          />
          <Button variant="outline" onClick={() => setShowApiKey(!showApiKey)}>
            {showApiKey ? <Eye /> : <EyeOff />}
          </Button>
          <Button
            variant="outline"
            disabled={!account?.api_key}
            onClick={() => {
              if (!account?.api_key) return
              navigator.clipboard.writeText(account.api_key)
              setCopied(true)
              setTimeout(() => setCopied(false), 4000)
            }}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
          <RegenerateApiKeyButton />
        </div>
        <p className="text-sm text-muted-foreground select-text">
          {t('fevelaTranslateApiKeyDescription', {
            serviceUrl: new URL('/v1/translation', FEVELA_API_BASE_URL).toString()
          })}
        </p>
      </div>
      <TopUp />
      <div className="h-40" />
    </div>
  )
}
