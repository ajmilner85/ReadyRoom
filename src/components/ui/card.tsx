import React, { forwardRef } from 'react';
import type { ComponentPropsWithRef } from 'react';

export interface CardProps extends ComponentPropsWithRef<'div'> {
  className?: string;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ className = '', ...props }, ref) => {
  return (
    <div ref={ref} {...props} />
  );
});

export default Card;