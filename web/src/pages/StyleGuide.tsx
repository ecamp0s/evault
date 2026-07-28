import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar"
import {
  Field,
  FieldSet,
  FieldLegend,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field"

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  )
}

export function StyleGuide() {
  const [emailError, setEmailError] = useState<string | undefined>()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
      <h1 className="text-2xl font-semibold">Style Guide</h1>

      <Section title="Button">
        <Button>Default</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
      </Section>

      <Section title="Input & Label">
        <div className="flex w-64 flex-col gap-1.5">
          <Label htmlFor="demo-input">Email</Label>
          <Input id="demo-input" type="email" placeholder="tu@correo.com" />
        </div>
      </Section>

      <Section title="Field">
        <FieldSet className="w-80">
          <FieldLegend>Cuenta</FieldLegend>
          <FieldGroup>
            <Field
              data-invalid={emailError ? true : undefined}
              onBlur={(event) => {
                const value = (event.target as HTMLInputElement).value
                setEmailError(
                  value && !value.includes("@")
                    ? "Introduce un email válido."
                    : undefined
                )
              }}
            >
              <FieldLabel htmlFor="field-email">Email</FieldLabel>
              <Input id="field-email" type="email" placeholder="tu@correo.com" />
              <FieldDescription>Usaremos esto para tu acceso.</FieldDescription>
              <FieldError errors={emailError ? [{ message: emailError }] : []} />
            </Field>
          </FieldGroup>
        </FieldSet>
      </Section>

      <Section title="Card">
        <Card className="w-80">
          <CardHeader>
            <CardTitle>Vault personal</CardTitle>
            <CardDescription>3 secretos guardados</CardDescription>
            <CardAction>
              <Button size="icon-sm" variant="ghost">
                ⋮
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Cifrado con AES-256-GCM en el cliente.
            </p>
          </CardContent>
          <CardFooter>
            <Button size="sm">Abrir</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Dropdown Menu">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline">Opciones</Button>} />
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Vault</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Renombrar</DropdownMenuItem>
              <DropdownMenuItem>Compartir</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Eliminar</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      <Section title="Avatar">
        <Avatar>
          <AvatarImage src="https://github.com/shadcn.png" alt="Usuario" />
          <AvatarFallback>EC</AvatarFallback>
        </Avatar>
        <AvatarGroup>
          <Avatar>
            <AvatarFallback>EC</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>AB</AvatarFallback>
          </Avatar>
          <AvatarGroupCount>+3</AvatarGroupCount>
        </AvatarGroup>
      </Section>

      <Section title="Sonner">
        <Button
          variant="outline"
          onClick={() => toast.success("Vault guardado correctamente.")}
        >
          Mostrar toast
        </Button>
      </Section>
    </div>
  )
}
