export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertDebugControllerSecretForProduction } = await import("./lib/debug-controller/auth")
    assertDebugControllerSecretForProduction()
  }
}
