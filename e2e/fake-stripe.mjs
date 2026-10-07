// A tiny stand-in for api.stripe.com, just enough for checkout: creating a Checkout Session and a
// coupon, plus a placeholder "hosted payment page" the browser is redirected to.
import http from "node:http";

const PORT = Number(process.env.FAKE_STRIPE_PORT ?? 12111);
let sessionCounter = 0;

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Request-Id": "req_fake" });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    req.resume();
    req.on("end", () => {
      if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
        sessionCounter += 1;
        const id = `cs_e2e_${sessionCounter}`;
        return json(res, 200, { id, object: "checkout.session", url: `http://localhost:${PORT}/pay/${id}` });
      }
      if (req.method === "POST" && url.pathname === "/v1/coupons") {
        return json(res, 200, { id: "co_e2e", object: "coupon" });
      }
      if (req.method === "GET" && url.pathname.startsWith("/pay/")) {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end("<!doctype html><title>Fake Stripe</title><h1>Fake Stripe Checkout</h1>");
      }
      return json(res, 404, { error: { type: "invalid_request_error", message: `No fake for ${req.method} ${url.pathname}` } });
    });
  })
  .listen(PORT, () => console.log(`fake stripe on ${PORT}`));
