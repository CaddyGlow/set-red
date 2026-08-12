declare module 'h3' {
  interface H3EventContext {
    auth?: import('./auth').AuthContext
    workspaceSettings?: import('../schemas/workspace').InternalWorkspaceSettings
    cloudflare: {
      request: Request<unknown, IncomingRequestCfProperties>
      env: Cloudflare.Env
      context: ExecutionContext
    }
  }
}

export {}
