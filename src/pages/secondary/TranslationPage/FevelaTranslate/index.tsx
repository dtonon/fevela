import { AccountInfo } from './AccountInfo'
import { FevelaTranslateAccountProvider } from './FevelaTranslateAccountProvider'

export default function FevelaTranslate() {
  return (
    <FevelaTranslateAccountProvider>
      <AccountInfo />
    </FevelaTranslateAccountProvider>
  )
}
