import { Button } from '@/components/ui/button'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { Sparkles } from 'lucide-react'
import { forwardRef } from 'react'

const HomePage = forwardRef(({ index }: { index?: number }, ref) => {
  const handleLearnMore = () => {
    window.open('https://njump.me', '_blank', 'noopener,noreferrer')
  }

  return (
    <SecondaryPageLayout
      ref={ref}
      index={index}
      title={
        <>
          <Sparkles />
          <div>Welcome to Nostr</div>
        </>
      }
      hideBackButton
      hideTitlebarBottomBorder
    >
      <div className="px-6 pt-6 pb-8 max-w-3xl mx-auto space-y-6">
        {/* Hero Image */}
        <div className="flex justify-center">
          <img
            src="https://njump.me/njump/static/home/home04.png"
            alt="Nostr Network"
            className="rounded-lg max-w-full h-auto"
            style={{ maxHeight: '180px' }}
          />
        </div>

        {/* Fevela Introduction */}
        <div className="space-y-4 text-base leading-relaxed">
          <h2 className="text-2xl font-bold">About Fevela</h2>
          <p>
            Fevela is a <strong>Nostr</strong> social client that gives you back full control of
            your attention and time with a newsreader-like interface. It promotes exploring
            interesting content over doomscrolling.
          </p>

          <p>
            Unlike traditional social media that's designed to maximize your time on the platform,
            Fevela respects your autonomy. Browse content deliberately, filter out noise, and move
            on with your day. No infinite scrolling, no manipulative algorithms or notifications,
            just a clean, efficient way to stay connected with what matters to you.
          </p>
        </div>

        {/* Nostr Introduction */}
        <div className="space-y-4 text-base leading-relaxed">
          <h2 className="text-2xl font-bold">Welcome to a new kind of social network</h2>
          <p>
            <span className="font-semibold text-foreground">Nostr</span> is a simple, open protocol
            that enables truly censorship-resistant and global social media. Unlike traditional
            platforms, Nostr doesn't rely on a central server or company. Instead, it's built on a
            decentralized network of relays that anyone can run.
          </p>

          <p>
            With Nostr, <span className="font-semibold text-foreground">you own your identity</span>
            . Your profile, followers, and content aren't locked into any single platform. You can
            switch clients, move between relays, and always keep your social graph intact. No
            corporation can ban you, shadowban you, or manipulate your feed with opaque algorithms.
          </p>

          <p>
            The protocol is designed for{' '}
            <span className="font-semibold text-foreground">resilience and freedom</span>. No single
            point of control means no one can shut it down. If a relay goes offline or censors
            content, you simply connect to others. This architecture ensures that your voice and
            connections persist regardless of political pressures or corporate decisions.
          </p>
        </div>

        {/* CTA Button */}
        <div className="flex justify-center pt-2">
          <Button size="lg" onClick={handleLearnMore} className="px-8">
            Learn more about Nostr
          </Button>
        </div>
      </div>
    </SecondaryPageLayout>
  )
})
HomePage.displayName = 'HomePage'
export default HomePage
