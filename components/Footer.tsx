import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-900 border-t border-gray-800 py-4">
      <div className="w-full">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
            <span>© 2026 껨산기</span>
            <span className="hidden md:inline">·</span>
            <span>Contact: <span className="hover:text-gray-300">snuggdok[at]지메일.com</span></span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <Link href="/about" className="hover:text-gray-300">
              사이트 소개
            </Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-gray-300">
              개인정보처리방침
            </Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-gray-300">
              이용약관
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}


