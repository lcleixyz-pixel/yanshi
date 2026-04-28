type ClassValue = string | number | null | undefined | false | Record<string, boolean>;

export default function clsx(...args: ClassValue[]): string {
  const out: string[] = [];
  for (const arg of args) {
    if (!arg) continue;
    if (typeof arg === 'string' || typeof arg === 'number') {
      out.push(String(arg));
    } else if (typeof arg === 'object') {
      for (const [k, v] of Object.entries(arg)) {
        if (v) out.push(k);
      }
    }
  }
  return out.join(' ');
}
