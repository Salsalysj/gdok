'use client';

import { useState } from 'react';

type ItemIconProps = {
  icon?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export default function ItemIcon({ icon, name, size = 'md', className = '' }: ItemIconProps) {
  const [imageError, setImageError] = useState(false);

  // Lost Ark 아이콘 URL 생성
  const getIconUrl = (iconPath?: string) => {
    if (!iconPath) return null;
    // Icon 필드가 이미 전체 URL인 경우 그대로 사용
    if (iconPath.startsWith('http')) {
      return iconPath;
    }
    // 경로만 있는 경우 CDN URL 생성
    return `https://cdn-lostark.game.onstove.com${iconPath}`;
  };

  const iconUrl = getIconUrl(icon);
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  const PlaceholderIcon = () => (
    <div
      className={`${sizeClasses[size]} bg-gray-700 rounded border border-gray-600 flex items-center justify-center ${className}`}
      title={name}
    >
      <svg
        className="w-6 h-6 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    </div>
  );

  if (!iconUrl || imageError) {
    return <PlaceholderIcon />;
  }

  return (
    <img
      src={iconUrl}
      alt={name || '아이템 아이콘'}
      className={`${sizeClasses[size]} object-cover rounded border border-gray-600 ${className}`}
      onError={() => setImageError(true)}
      loading="lazy"
    />
  );
}

