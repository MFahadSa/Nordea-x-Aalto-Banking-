import React from 'react';
import { LOGO_BLUE, LOGO_WHITE } from '../constants/logos.js';

interface Props {
  variant?: 'blue' | 'white';
  className?: string;
}

export const NordeaLogo: React.FC<Props> = ({ variant = 'white', className = 'nlogo' }) => {
  return (
    <img
      src={variant === 'white' ? LOGO_WHITE : LOGO_BLUE}
      alt="Nordea"
      className={className}
    />
  );
};
