import { AppLayout } from '@/components/app/AppLayout'
import { ItemList } from '@/pages/vault/ItemList'

/**
 * Pantalla principal de la aplicación autenticada: la vault del usuario.
 *
 * Aquí estuvo hasta el issue #55 el placeholder que dejó #6. La lista y sus
 * estados viven en pages/vault, para que esta pantalla siga siendo lo que dice
 * ser: dónde se monta cada cosa.
 */
export function Home() {
  return (
    <AppLayout title="Vault">
      <ItemList />
    </AppLayout>
  )
}
