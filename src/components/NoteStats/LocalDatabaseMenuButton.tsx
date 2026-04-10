import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerOverlay } from '@/components/ui/drawer'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import client from '@/services/client.service'
import { Save, Trash2 } from 'lucide-react'
import { Event } from '@nostr/tools/wasm'
import { useState } from 'react'

export default function LocalDatabaseMenuButton({
  event,
  is,
  mode,
  onAction
}: {
  event: Event
  is: boolean
  mode: 'drawer' | 'dropdown'
  onAction?: () => void
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const menuItems = (
    <>
      {!is && (
        <DropdownMenuItem
          onClick={() => {
            client.addEventToCache(event)
            onAction?.()
          }}
        >
          <Save className="!w-4 !h-4" /> save
        </DropdownMenuItem>
      )}
      {is && (
        <DropdownMenuItem
          onClick={() => {
            client.removeEventFromCache(event.id)
            onAction?.()
          }}
        >
          <Trash2 className="!w-4 !h-4" /> delete
        </DropdownMenuItem>
      )}
    </>
  )

  if (mode === 'dropdown') {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="min-w-52 cursor-pointer">
          <Save className="!w-6 !h-6" /> local database
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>{menuItems}</DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  }

  return (
    <>
      <Button
        className="w-full p-6 justify-start text-lg gap-4 cursor-pointer"
        variant="ghost"
        onClick={() => setIsDrawerOpen(true)}
      >
        <Save className="!w-6 !h-6" /> local database
      </Button>
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerOverlay className="bg-black/20" onClick={() => setIsDrawerOpen(false)} />
        <DrawerContent>
          <div className="py-2">
            {!is && (
              <Button
                className="w-full p-6 justify-start text-lg gap-4"
                variant="ghost"
                onClick={() => {
                  client.addEventToCache(event)
                  setIsDrawerOpen(false)
                  onAction?.()
                }}
              >
                <Save className="!w-4 !h-4" /> save
              </Button>
            )}
            {is && (
              <Button
                className="w-full p-6 justify-start text-lg gap-4"
                variant="ghost"
                onClick={() => {
                  client.removeEventFromCache(event.id)
                  setIsDrawerOpen(false)
                  onAction?.()
                }}
              >
                <Trash2 className="!w-4 !h-4" /> delete
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
