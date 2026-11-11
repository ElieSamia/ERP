import Link from 'next/link';

export default function NotFound() {
  return <div className="empty">This record doesn’t exist or was deleted. <Link href="/">Back to the apps</Link></div>;
}
