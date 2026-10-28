// Cuenta fija de la demo en GitHub Pages: no hay base de datos detrás y la sesión vive solo en esta pestaña.
export const DEMO = { email: "demo@boutique.com", password: "demo1234", name: "Usuario Demo" };

const KEY = "demo-session";

export function signIn(email: string, password: string) {
  const ok = email.trim().toLowerCase() === DEMO.email && password === DEMO.password;
  if (ok) sessionStorage.setItem(KEY, "1");
  return ok;
}

export const isSignedIn = () => sessionStorage.getItem(KEY) === "1";

export const signOut = () => sessionStorage.removeItem(KEY);
