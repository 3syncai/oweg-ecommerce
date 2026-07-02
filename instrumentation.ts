export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertDebugControllerSecretForProduction } = await import(
      "./src/lib/debug-controller/auth"
    );
    assertDebugControllerSecretForProduction();
  }
}
