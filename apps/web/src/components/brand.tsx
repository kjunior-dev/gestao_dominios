import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="DevTrust Domains, início">
      <span className="brand-icon">
        <ShieldCheck size={23} />
      </span>
      <span>
        DevTrust<small>DOMAINS</small>
      </span>
    </Link>
  );
}
