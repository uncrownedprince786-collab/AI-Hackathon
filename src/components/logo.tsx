import Image from "next/image";
import Link from "next/link";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={className}
      aria-label="AI Hackathons home"
    >
      <Image
        src="/logo.svg"
        alt=""
        width={32}
        height={32}
        priority
        className="size-8"
      />
    </Link>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={className} aria-label="AI Hackathons home">
      <span className="text-[15px] font-bold tracking-tight whitespace-nowrap">
        AI Hackathons
      </span>
    </Link>
  );
}
