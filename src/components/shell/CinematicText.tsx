import React from 'react';
import { CinematicText as PlanesCinematicText } from '../ui/CinematicText';

export function CinematicText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  if (typeof children === 'string') {
    return <PlanesCinematicText className={className}>{children}</PlanesCinematicText>;
  }
  return <h1 className={`sbi-cinematic ${className}`}>{children}</h1>;
}
