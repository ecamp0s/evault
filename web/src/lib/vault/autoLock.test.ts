import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_EVENTS,
  CHECK_INTERVAL_MS,
  idleStateFor,
  INACTIVITY_LIMIT_MS,
  secondsUntilLock,
  WARNING_AT_MS,
} from './autoLock'

const MINUTE = 60 * 1000

describe('en qué estado está la vault según el tiempo sin actividad', () => {
  it('recién usada está activa', () => {
    expect(idleStateFor(0)).toBe('active')
  })

  it('sigue activa hasta el momento del aviso', () => {
    expect(idleStateFor(WARNING_AT_MS - 1)).toBe('active')
  })

  it('avisa a los catorce minutos', () => {
    expect(idleStateFor(WARNING_AT_MS)).toBe('warning')
    expect(idleStateFor(14 * MINUTE)).toBe('warning')
  })

  it('sigue avisando hasta el momento del bloqueo, sin bloquear antes', () => {
    expect(idleStateFor(INACTIVITY_LIMIT_MS - 1)).toBe('warning')
  })

  it('a los quince minutos toca bloquear', () => {
    expect(idleStateFor(INACTIVITY_LIMIT_MS)).toBe('expired')
    expect(idleStateFor(15 * MINUTE)).toBe('expired')
  })

  it('un desfase enorme sigue siendo bloqueo y no otra cosa', () => {
    /*
     * El caso de la pestaña que estuvo horas en segundo plano. Importa porque es el
     * que un setTimeout no habría detectado a tiempo, y aquí no es un caso especial:
     * es la misma resta.
     */
    expect(idleStateFor(8 * 60 * MINUTE)).toBe('expired')
  })
})

describe('los plazos', () => {
  it('son quince minutos para bloquear y catorce para avisar', () => {
    expect(INACTIVITY_LIMIT_MS).toBe(15 * MINUTE)
    expect(WARNING_AT_MS).toBe(14 * MINUTE)
  })

  it('dejan un minuto entre el aviso y el bloqueo', () => {
    // Si esto baja, el aviso deja de servir para reaccionar.
    expect(INACTIVITY_LIMIT_MS - WARNING_AT_MS).toBe(MINUTE)
  })

  it('se comprueban con una frecuencia bastante menor que el propio aviso', () => {
    /*
     * Si el intervalo fuera más largo que la ventana de aviso, habría desfases en los
     * que el aviso no llega a mostrarse y la vault se bloquea sin avisar.
     */
    expect(CHECK_INTERVAL_MS).toBeLessThan(INACTIVITY_LIMIT_MS - WARNING_AT_MS)
  })
})

describe('los segundos que se anuncian en el aviso', () => {
  it('son sesenta cuando empieza el aviso', () => {
    expect(secondsUntilLock(WARNING_AT_MS)).toBe(60)
  })

  it('redondean hacia arriba para no anunciar cero antes de tiempo', () => {
    expect(secondsUntilLock(INACTIVITY_LIMIT_MS - 1)).toBe(1)
  })

  it('nunca son negativos, aunque el desfase ya haya pasado del límite', () => {
    expect(secondsUntilLock(INACTIVITY_LIMIT_MS + 5 * MINUTE)).toBe(0)
  })
})

describe('qué cuenta como actividad', () => {
  it('no incluye mousemove, que haría que una vault no se bloquease nunca', () => {
    /*
     * El ratón parado encima de una ventana genera mousemove con cualquier vibración
     * de la mesa. Con eso, la vault de un escritorio no se bloquearía jamás, y este
     * test existe para que nadie lo añada por parecer razonable.
     */
    expect(ACTIVITY_EVENTS).not.toContain('mousemove')
  })

  it('incluye escribir, que es lo que evita que el bloqueo tire un item a medias', () => {
    expect(ACTIVITY_EVENTS).toContain('keydown')
  })
})
