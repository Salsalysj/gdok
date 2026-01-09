import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-900 border-t border-gray-800 py-4">
      <div className="w-full">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
            <span>© 2026 껨산기</span>
            <span className="hidden md:inline">·</span>
            <span>Contact: <a href="mailto:snuggdok@gmail.com" className="hover:text-gray-300">snuggdok@gmail.com</a></span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <Link href="/about" className="hover:text-gray-300">
              About
            </Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-gray-300">
              Privacy Policy
            </Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-gray-300">
              Terms of Service
            </Link>
            <span>·</span>
            <span>Version: v0.9.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}


