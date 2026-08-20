import { AppLayout } from '@/components/app/AppLayout'
import { ItemList } from '@/pages/vault/ItemList'

/**
 * The main screen of the authenticated application: the user's vault.
 *
 * Until issue #55 this held the placeholder #6 left behind. The list and its states
 * live in pages/vault, so that this screen stays what it says it is: where each thing
 * is mounted.
 */
export function Home() {
  return (
    <AppLayout title="Vault">
      <ItemList />
    </AppLayout>
  )
}
