import { useNostr } from '@/providers/NostrProvider'
import { useTranslationService } from '@/providers/TranslationServiceProvider'
import { TTranslationAccount } from '@/types'
import { createContext, useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'

type TFevelaTranslateAccountContext = {
  account: TTranslationAccount | null
  getAccount: () => Promise<void>
  regenerateApiKey: () => Promise<void>
}

export const FevelaTranslateAccountContext = createContext<
  TFevelaTranslateAccountContext | undefined
>(undefined)

export const useFevelaTranslateAccount = () => {
  const context = useContext(FevelaTranslateAccountContext)
  if (!context) {
    throw new Error(
      'useFevelaTranslateAccount must be used within a FevelaTranslateAccountProvider'
    )
  }
  return context
}

export function FevelaTranslateAccountProvider({ children }: { children: React.ReactNode }) {
  const { pubkey } = useNostr()
  const { getAccount: _getAccount, regenerateApiKey: _regenerateApiKey } = useTranslationService()
  const [account, setAccount] = useState<TTranslationAccount | null>(null)

  useEffect(() => {
    setAccount(null)
    if (!pubkey) return

    setTimeout(() => {
      getAccount()
    }, 100)
  }, [pubkey])

  const regenerateApiKey = async (): Promise<void> => {
    try {
      if (!account) {
        await getAccount()
      }
      const newApiKey = await _regenerateApiKey()
      if (newApiKey) {
        setAccount((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            api_key: newApiKey
          }
        })
      }
    } catch (error) {
      toast.error(
        'Failed to regenerate Fevela translation API key: ' +
          (error instanceof Error
            ? error.message
            : 'An error occurred while regenerating the API key')
      )
      setAccount(null)
    }
  }

  const getAccount = async (): Promise<void> => {
    try {
      const data = await _getAccount()
      if (data) {
        setAccount(data)
      }
    } catch (error) {
      toast.error(
        'Failed to fetch Fevela translation account: ' +
          (error instanceof Error ? error.message : 'An error occurred while fetching the account')
      )
      setAccount(null)
    }
  }

  return (
    <FevelaTranslateAccountContext.Provider value={{ account, getAccount, regenerateApiKey }}>
      {children}
    </FevelaTranslateAccountContext.Provider>
  )
}
