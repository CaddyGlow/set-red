declare module 'h3' {
  interface H3EventContext {
    auth?: import('./auth').AuthContext
    workspaceSettings?: import('../schemas/workspace').WorkspaceSettings
    cloudflare: {
      request: Request<unknown, IncomingRequestCfProperties>
      env: Cloudflare.Env
      context: ExecutionContext
    }
  }
}

export {}
