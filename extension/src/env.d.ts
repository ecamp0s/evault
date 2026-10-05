/**
 * The instance origins, baked in by vite.config.ts from EVAULT_EXTENSION_ORIGINS and
 * already validated there by `parseOrigins`. See src/instance.ts.
 */
declare const __INSTANCE_ORIGINS__: string[]

/** The browser this build is for, baked in by vite.config.ts from EVAULT_EXTENSION_BROWSER. */
declare const __BROWSER__: import('./target').Browser
