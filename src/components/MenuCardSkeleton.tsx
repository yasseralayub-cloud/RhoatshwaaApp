import React from 'react';
import { motion } from 'motion/react';

interface MenuCardSkeletonProps {
  count?: number;
}

export const MenuCardSkeleton: React.FC<{ id?: string }> = ({ id }) => {
  return (
    <div
      id={id}
      className="bg-white rounded-3xl border border-black/5 overflow-hidden p-3.5 flex flex-col justify-between shadow-xs animate-pulse"
      aria-hidden="true"
    >
      {/* Visual Image skeleton */}
      <div className="relative w-full aspect-video md:h-44 rounded-2xl overflow-hidden mb-3.5 bg-neutral-200/75 dark:bg-neutral-200">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
        
        {/* Skeleton Badge */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-10">
          <div className="w-16 h-5 bg-neutral-300/80 rounded-full" />
          <div className="w-14 h-5 bg-neutral-300/80 rounded-full ml-auto" />
        </div>
      </div>

      {/* Item info skeleton */}
      <div className="flex-1 flex flex-col justify-between">
        <div className="space-y-2">
          {/* Title line */}
          <div className="h-5 bg-neutral-200 rounded-md w-3/4" />
          
          {/* Subtitle line */}
          <div className="h-3 bg-neutral-100 rounded-md w-1/3" />

          {/* Description lines */}
          <div className="space-y-1.5 pt-1">
            <div className="h-3 bg-neutral-100 rounded-md w-full" />
            <div className="h-3 bg-neutral-100 rounded-md w-4/5" />
          </div>
        </div>

        {/* Purchase interface skeleton */}
        <div className="mt-4 pt-3 border-t border-black/5 flex items-center justify-between gap-3">
          {/* Price */}
          <div className="space-y-1">
            <div className="h-6 w-16 bg-neutral-200 rounded-md" />
          </div>

          {/* Add button placeholder */}
          <div className="w-24 h-9 bg-neutral-200 rounded-xl" />
        </div>
      </div>
    </div>
  );
};

export const MenuGridSkeleton: React.FC<MenuCardSkeletonProps> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <MenuCardSkeleton key={`menu-skeleton-${index}`} id={`menu-skeleton-${index}`} />
      ))}
    </div>
  );
};
