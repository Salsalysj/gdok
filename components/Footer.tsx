import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-900/80 border-t border-gray-800 py-4 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
            <span>© 2026 껨산기</span>
            <span className="hidden md:inline">·</span>
            <span>Contact: <a href="mailto:snuggdok@gmail.com" className="hover:text-blue-400 transition-colors">snuggdok@gmail.com</a></span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <Link href="/about" className="hover:text-blue-400 transition-colors">
              About
            </Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-blue-400 transition-colors">
              Privacy Policy
            </Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-blue-400 transition-colors">
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

