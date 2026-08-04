import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { ImportDialog } from './ImportDialog'
import { createQueryClient } from '@/lib/queries'
import { api } from '@/lib/api'
import * as vaultApi from '@/lib/vault/api'
import { unlockForTest } from '@/test/vault'
import type { Item } from '@/lib/vault/types'

const CHROME = `name,url,username,password,note
GitHub,https://github.com,ada,secreto-del-fichero,la del trabajo
Banco,https://banco.es,0001,otra-mas,`

function ficheroCon(contenido: string, nombre = 'passwords.csv'): File {
  return new File([contenido], nombre, { type: 'text/csv' })
}

function pintar(items: Item[] = []) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ImportDialog vaultId="vault-1" items={items} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

async function elegirFichero(contenido: string) {
  await userEvent.upload(screen.getByLabelText('Fichero'), ficheroCon(contenido))
}

beforeEach(async () => {
  vi.restoreAllMocks()

  // Sin clave en memoria, createItem ni llega a la red: cifra antes de pedir. Con
  // ella, lo que viaja en el test es ciphertext de verdad.
  await unlockForTest()
})

describe('la previsualización', () => {
  it('dice cuántas entradas trae el fichero antes de escribir nada', async () => {
    const crear = vi.spyOn(vaultApi, 'createItem')

    pintar()
    await elegirFichero(CHROME)

    expect(await screen.findByText(/2 entradas en el fichero/i)).toBeInTheDocument()
    expect(crear).not.toHaveBeenCalled()
  })

  it('avisa de los campos que no caben y acabarán en las notas', async () => {
    pintar()
    await elegirFichero(
      'name,login_username,login_password,login_totp\nGitHub,ada,secreto,JBSWY3DPEHPK3PXP',
    )

    expect(await screen.findByText(/se guardarán dentro de las notas/i)).toBeInTheDocument()
    expect(screen.getByText(/login_totp/)).toBeInTheDocument()
  })

  /*
   * Los repetidos se avisan y se dejan fuera por defecto, pero la decisión es del
   * usuario: la detección es una heurística sobre nombre y usuario, y equivocarse
   * hacia el lado de fusionar pierde datos.
   */
  it('deja fuera los que ya parecen estar, y deja volver a meterlos', async () => {
    const yaEsta: Item = {
      id: '1',
      vaultId: 'vault-1',
      content: { nombre: 'GitHub', usuario: 'ada' },
      createdAt: null,
      updatedAt: null,
    }

    pintar([yaEsta])
    await elegirFichero(CHROME)

    expect(await screen.findByText(/parece que ya está/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar 1' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('button', { name: 'Importar 2' })).toBeInTheDocument()
  })

  it('explica qué hacer cuando no reconoce el fichero', async () => {
    pintar()
    await elegirFichero('una,cosa\n1,2')

    expect(await screen.findByText(/no reconocemos este fichero/i)).toBeInTheDocument()
  })
})

describe('importar', () => {
  it('escribe una entrada por cada una seleccionada', async () => {
    const crear = vi.spyOn(vaultApi, 'createItem').mockResolvedValue({
      id: 'x',
      vaultId: 'vault-1',
      content: { nombre: 'X' },
      createdAt: null,
      updatedAt: null,
    })

    pintar()
    await elegirFichero(CHROME)
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 2' }))

    await waitFor(() => expect(crear).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/2 entradas importadas/i)).toBeInTheDocument()
  })

  /*
   * LA GARANTÍA QUE MÁS IMPORTA DE ESTA PANTALLA.
   *
   * El fichero llega en claro y con todo dentro. No puede salir del navegador: ni
   * entero, ni en trozos, ni «para validar el formato». Lo único que viaja son los
   * items ya cifrados, uno a uno, por el CRUD de siempre.
   */
  it('no manda el fichero al servidor en ningún momento', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { data: { item: { id: 'x', vault_id: 'v', ciphertext: 'c', iv: 'i', version: 2 } } },
    })

    pintar()
    await elegirFichero(CHROME)
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 2' }))

    await waitFor(() => expect(post).toHaveBeenCalled())

    const enviado = JSON.stringify(post.mock.calls)

    expect(enviado).not.toContain('secreto-del-fichero')
    expect(enviado).not.toContain('otra-mas')
    expect(enviado).not.toContain('name,url,username')
    expect(enviado).not.toContain('GitHub')
  })

  /*
   * Un import a medias no puede callarse cuántas entraron: si no, el usuario no sabe
   * si repetir el fichero entero, y repetirlo duplicaría lo que sí entró.
   */
  it('dice cuántas entraron si se corta a mitad', async () => {
    let llamadas = 0

    vi.spyOn(vaultApi, 'createItem').mockImplementation(async () => {
      llamadas += 1

      if (llamadas > 1) throw new Error('se cayó la red')

      return {
        id: 'x',
        vaultId: 'vault-1',
        content: { nombre: 'X' },
        createdAt: null,
        updatedAt: null,
      }
    })

    pintar()
    await elegirFichero(CHROME)
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 2' }))

    expect(await screen.findByText(/se han importado 1 de 2/i)).toBeInTheDocument()
  })
})
