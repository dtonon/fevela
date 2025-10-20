import * as React from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

interface InputProps extends React.ComponentProps<'input'> {
  showClearButton?: boolean
  onClear?: () => void
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, showClearButton = false, onClear, value, onChange, ...props }, ref) => {
    const [displayClear, setDisplayClear] = React.useState(false)

    React.useEffect(() => {
      if (showClearButton) {
        setDisplayClear(!!value)
      }
    }, [value, showClearButton])

    const handleClear = () => {
      if (onClear) {
        onClear()
      } else if (onChange) {
        onChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>)
      }
    }

    const input = (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          showClearButton && displayClear && 'pr-8',
          className
        )}
        ref={ref}
        value={value}
        onChange={onChange}
        {...props}
      />
    )

    if (!showClearButton || !displayClear) {
      return input
    }

    return (
      <>
        {input}
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-foreground/40 hover:bg-foreground transition-opacity size-5 shrink-0 flex flex-col items-center justify-center"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClear}
        >
          <X className="!size-3 shrink-0 text-background" strokeWidth={4} />
        </button>
      </>
    )
  }
)
Input.displayName = 'Input'

export { Input }
