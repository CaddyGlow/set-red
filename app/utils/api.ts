import type { NitroFetchOptions, NitroFetchRequest } from 'nitropack'

type APIOptions = Omit<NitroFetchOptions<NitroFetchRequest>, 'headers'> & {
  headers?: Record<string, string>
}

export function useAPI<T = unknown>(api: string, options?: APIOptions): Promise<T>
export async function useAPI(api: string, options?: APIOptions): Promise<unknown> {
  const { headers, ...fetchOptions } = options ?? {}
  const requestOptions: NitroFetchOptions<NitroFetchRequest> = {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...headers,
    },
  }

  try {
    return await $fetch(api, requestOptions)
  }
  catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 401) {
      if (import.meta.client && !['/login', '/register'].includes(window.location.pathname))
        window.location.assign('/login')
    }
    throw error
  }
}
