/**
 * Claves de caché de TanStack Query.
 *
 * Centralizadas porque una clave escrita a mano en dos sitios que no coinciden
 * produce el fallo más difícil de ver: la mutación invalida una entrada y la
 * pantalla lee otra, así que la interfaz se queda con datos viejos sin ningún
 * error por medio.
 *
 * El vaultId forma parte de la clave siempre. Si no lo fuera, cambiar de vault
 * mostraría los items del anterior mientras llega la respuesta, que en un gestor
 * de contraseñas significa enseñar credenciales del contexto equivocado.
 */
export const queryKeys = {
  vaults: () => ['vaults'] as const,
  items: (vaultId: string) => ['vaults', vaultId, 'items'] as const,
} as const
