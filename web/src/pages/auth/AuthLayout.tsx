import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthLayoutProps {
  title: string
  description: string
  children: ReactNode
  footer: {
    text: string
    link: { to: string; text: string }
  }
}

/**
 * The wrapper of the entry screens: a single card centred on a dark background, with
 * the wordmark above and the switching link below.
 */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
        <span>eVault</span>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {footer.text}{' '}
        <Link to={footer.link.to} className="font-medium text-foreground underline underline-offset-4">
          {footer.link.text}
        </Link>
      </p>
    </main>
  )
}
