const login = await fetch("https://dsrmb-sys.vercel.app/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "ds001", password: "1234" })
});
const loginBody = await login.text();
const setCookie = login.headers.getSetCookie?.() ?? [];
console.log("login", login.status, loginBody.slice(0, 200));
const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
const boot = await fetch("https://dsrmb-sys.vercel.app/api/bootstrap", { headers: { Cookie: cookie } });
console.log("bootstrap", boot.status, (await boot.text()).slice(0, 400));
