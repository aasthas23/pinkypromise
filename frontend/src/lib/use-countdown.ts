import { useEffect, useState } from "react";
export function useCountdown(expiresAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  return expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
}
