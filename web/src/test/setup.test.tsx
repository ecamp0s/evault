import { expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'

/*
 * Que el propio setup de los tests haga lo que dice. Ver #232.
 *
 * Estos dos tests van EN ESTE ORDEN y se leen juntos: el primero deja un aviso
 * colgando y el segundo comprueba que no llegó. Separarlos o reordenarlos los deja
 * sin sentido, y por eso están en un fichero propio en vez de sueltos.
 *
 * Lo que vigilan es una fuga que no se ve al escribir un test: los avisos de sonner
 * viven en estado global del módulo, fuera del árbol de React, así que `cleanup()`
 * no los borra. Sin el `toast.dismiss()` del setup, un test hereda los avisos de los
 * anteriores y falla —o no— según el orden de ejecución.
 */

it('deja un aviso colgando a propósito', async () => {
  render(<Toaster />)
  toast.success('Un aviso que no debería sobrevivir a este test')

  await waitFor(() =>
    expect(screen.getAllByText(/no debería sobrevivir/)).toHaveLength(1),
  )
})

it('y el siguiente test no lo hereda', async () => {
  render(<Toaster />)

  /*
   * Se espera un momento a propósito: si el aviso viejo fuera a reaparecer, lo haría
   * al montar este Toaster, no de forma instantánea. Comprobarlo sin esperar daría un
   * verde que no significa nada.
   */
  await new Promise((resolve) => setTimeout(resolve, 50))

  expect(screen.queryAllByText(/no debería sobrevivir/)).toHaveLength(0)
})
