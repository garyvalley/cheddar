declare module '#app' {
  interface PageMeta {
    /** Open to everyone, signed in or not (app/middleware/auth.global.ts). */
    public?: boolean
    /** Only for someone signed out: a signed-in visitor goes to the overview. */
    guestOnly?: boolean
    /** The page that turns on two-step sign-in: the only one an account without it may see. */
    twoStepSetup?: boolean
  }
}

export {}
