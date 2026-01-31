'use client';

import { useState } from 'react';
import { ITEM_ICON_MAP } from '@/lib/valueDbIcons';

type ItemIconProps = {
  icon?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export default function ItemIcon({ icon, name, size = 'md', className = '' }: ItemIconProps) {
  const [imageError, setImageError] = useState(false);

  // Lost Ark 아이콘 URL 생성 (CDN 경로 또는 전체 URL)
  const getIconUrl = (iconPath?: string) => {
    if (!iconPath) return null;
    if (iconPath.startsWith('http') || iconPath.startsWith('/')) {
      return iconPath;
    }
    return `https://cdn-lostark.game.onstove.com${iconPath}`;
  };

  // value-db와 동일: name만 있으면 ITEM_ICON_MAP으로 /value-db-icons/ 파일 매칭
  const valueDbIcon =
    name && ITEM_ICON_MAP[name] ? `/value-db-icons/${ITEM_ICON_MAP[name]}` : null;
  const iconUrl = getIconUrl(icon) ?? valueDbIcon;
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

