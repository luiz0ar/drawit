import React from 'react';
import { Check, Circle } from 'lucide-react';
import {
  PASSWORD_CRITERIA,
  validatePassword,
} from '../../../lib/passwordValidation';

export interface PasswordRequirementsProps {
  password: string;
  className?: string;
  hideWhenValid?: boolean;
}

export const PasswordRequirements: React.FC<PasswordRequirementsProps> = ({
  password,
  className = '',
  hideWhenValid = false,
}) => {
  const result = validatePassword(password);

  if (hideWhenValid && result.isValid) {
    return null;
  }

  return (
    <div
      className={`p-3 rounded-lg border bg-muted/30 text-xs space-y-2 ${className}`}
      aria-live="polite"
    >
      <p className="font-semibold text-foreground/80">
        Password must contain:
      </p>
      <ul className="space-y-1.5" role="list">
        {PASSWORD_CRITERIA.map((criterion) => {
          const isMet = result[criterion.id];
          return (
            <li
              key={criterion.id}
              className={`flex items-center gap-2 transition-colors duration-150 ${
                isMet
                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              {isMet ? (
                <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" aria-hidden="true" />
              ) : (
                <Circle className="w-2 h-2 shrink-0 mx-0.5 opacity-60 fill-current" aria-hidden="true" />
              )}
              <span>{criterion.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

