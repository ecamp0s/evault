import { AppLayout } from '@/components/app/AppLayout'
import { AuditList } from '@/pages/vault/AuditList'

/**
 * The review screen: what is wrong with the passwords in this vault.
 *
 * Like `Home`, this file only says where the thing is mounted; the findings and their
 * states live in `pages/vault`.
 */
export function Audit() {
  return (
    <AppLayout title="Revisión">
      <AuditList />
    </AppLayout>
  )
}
